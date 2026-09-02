import { createExtractionLLM } from '../llm/factory';
import { getDocument, setDocumentStatus, insertRules } from '../db/policies.repo';
import { validateRule, ValidatedRule } from './validateRule';
import { PolicyDocument } from './types';

const CHUNK_SIZE = 6000;
const CHUNK_OVERLAP = 300;

// Splits on paragraph boundaries rather than a hard character cut, so a rule
// described mid-sentence never gets sliced across a chunk boundary.
function chunkText(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return text.trim() ? [text.trim()] : [];

  const chunks: string[] = [];
  let current = '';
  for (const para of paragraphs) {
    if (current.length && current.length + para.length + 2 > CHUNK_SIZE) {
      chunks.push(current);
      const tail = current.slice(-CHUNK_OVERLAP);
      current = `${tail}\n\n${para}`;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

const TOOL_CATALOGUE = `- execute_bash { command: string } — runs a shell command on the local machine
- read_file { filepath: string } — reads a local file
- write_file { filepath: string, content: string } — writes/overwrites a local file
- list_directory { dirpath: string } — lists a local directory
- web_search { query: string } — searches the web`;

function buildExtractionPrompt(chunk: string, chunkIndex: number, totalChunks: number): string {
  return `You are extracting enforceable rules from a company's AI usage policy document for "Orb", a governance layer in front of local and cloud LLMs. Orb's tools are:
${TOOL_CATALOGUE}

You will see the document in ${totalChunks} chunk(s); this is chunk ${chunkIndex + 1} of ${totalChunks}. Extract only rules that are grounded in THIS chunk's text — never invent a rule, and never force-fit vague text into one.

Two kinds of rules:
- "action" rules constrain a specific tool call. Only emit one when the text clearly restricts, requires approval for, or explicitly allows a tool-like operation (running commands, reading/writing files, listing directories, searching the web).
- "conduct" rules are everything else — behavioral or content directives ("never disclose salary data", "do not give legal advice", "always cite sources", "respond in English").

For each action rule, choose:
- tool: one of execute_bash | read_file | write_file | list_directory | web_search | * (any tool)
- matchField: command (execute_bash) | filepath (read_file/write_file) | dirpath (list_directory) | query (web_search) | content (write_file) | * (any argument) — omit when matchKind is "any"
- matchKind: "any" (every call to the tool), "contains" (substring), "prefix" (starts with), or "glob" (path pattern like "/etc/**" or "~/Documents/HR/**")
- pattern: the literal text/glob to match — omit when matchKind is "any"
- effect: "deny" (block it), "require_approval" (a human must approve each time), or "allow" (explicitly permitted)

Worked examples:
{"kind":"action","title":"No privilege escalation","tool":"execute_bash","matchField":"command","matchKind":"contains","pattern":"sudo","effect":"deny","sourceExcerpt":"Employees may not use sudo or any privilege-escalation commands."}
{"kind":"action","title":"HR folder writes need approval","tool":"write_file","matchField":"filepath","matchKind":"glob","pattern":"~/Documents/HR/**","effect":"require_approval","sourceExcerpt":"Any write to the HR folder requires manager sign-off."}
{"kind":"conduct","title":"No salary disclosure","directive":"Never disclose an employee's salary or compensation details.","sourceExcerpt":"Compensation information is confidential and must never be shared."}

Quote sourceExcerpt verbatim from the chunk (a short sentence or two).

Chunk text:
"""
${chunk}
"""

Respond with a single JSON object and nothing else, in this exact shape:
{"rules": [ { "kind": "action", "title": "...", "tool": "...", "matchField": "...", "matchKind": "...", "pattern": "...", "effect": "...", "sourceExcerpt": "..." }, { "kind": "conduct", "title": "...", "directive": "...", "sourceExcerpt": "..." } ]}

If this chunk contains no extractable rules, respond with {"rules": []}.`;
}

function dedupeKey(rule: ValidatedRule): string {
  return rule.kind === 'conduct'
    ? JSON.stringify(['conduct', rule.directive])
    : JSON.stringify(['action', rule.effect, rule.tool, rule.match_field, rule.match_kind, rule.pattern]);
}

// Background job kicked off (unawaited) right after upload. Never throws —
// every failure path resolves into a 'failed' or 'review' status with a note
// in compile_error, matching the log-only convention of postChatAnalysis.
export async function compilePolicyDocument(documentId: number, model: string): Promise<void> {
  const document = getDocument(documentId);
  if (!document) return;

  if (document.mime_type === 'application/json') {
    await compileFromJson(document);
    return;
  }

  try {
    const chunks = chunkText(document.source_text);
    if (chunks.length === 0) {
      setDocumentStatus(documentId, 'failed', { compile_error: 'The document contained no extractable text.' });
      return;
    }

    const llm = createExtractionLLM(model);
    const seen = new Set<string>();
    const accepted: ValidatedRule[] = [];
    let discarded = 0;
    let failedChunks = 0;

    for (let i = 0; i < chunks.length; i++) {
      // Bail out if the document was deleted mid-compile.
      if (!getDocument(documentId)) return;

      let text: string;
      try {
        const response = await llm.chat([{ role: 'user', content: buildExtractionPrompt(chunks[i], i, chunks.length) }]);
        text = (response.text || '').trim();
      } catch {
        failedChunks += 1;
        continue;
      }

      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        failedChunks += 1;
        continue;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      } catch {
        failedChunks += 1;
        continue;
      }

      const rawRules = Array.isArray(parsed?.rules) ? parsed.rules : [];
      for (const raw of rawRules) {
        const result = validateRule(raw);
        if (!result.ok) {
          discarded += 1;
          continue;
        }
        const key = dedupeKey(result.rule);
        if (seen.has(key)) continue;
        seen.add(key);
        accepted.push(result.rule);
      }
    }

    if (accepted.length) insertRules(documentId, accepted, 'compiled');

    // The document may have been deleted while we were compiling.
    if (!getDocument(documentId)) return;

    if (accepted.length === 0 && failedChunks === chunks.length) {
      setDocumentStatus(documentId, 'failed', {
        compile_error: `Compilation failed on all ${chunks.length} chunk${chunks.length === 1 ? '' : 's'} — the model never returned parseable JSON. Try a different model.`,
      });
      return;
    }

    const notes: string[] = [];
    if (discarded > 0) notes.push(`${discarded} extracted rule${discarded === 1 ? '' : 's'} discarded (invalid).`);
    if (failedChunks > 0) notes.push(`${failedChunks} of ${chunks.length} chunk${chunks.length === 1 ? '' : 's'} failed to parse.`);
    if (accepted.length === 0) notes.push('No rules were extracted — add rules manually or recompile with another model.');

    setDocumentStatus(documentId, 'review', { compile_error: notes.length ? notes.join(' ') : null });
  } catch (error: any) {
    if (getDocument(documentId)) {
      setDocumentStatus(documentId, 'failed', { compile_error: error.message || 'Compilation failed.' });
    }
  }
}

// A JSON upload ({ "rules": [...] }) is a pre-compiled rule set — skip the
// LLM entirely and validate/insert directly.
async function compileFromJson(document: PolicyDocument): Promise<void> {
  try {
    const parsed = JSON.parse(document.source_text);
    const rawRules = Array.isArray(parsed?.rules) ? parsed.rules : [];
    const accepted: ValidatedRule[] = [];
    let discarded = 0;

    for (const raw of rawRules) {
      const result = validateRule(raw);
      if (result.ok) accepted.push(result.rule);
      else discarded += 1;
    }

    if (accepted.length) insertRules(document.id, accepted, 'compiled');

    const notes: string[] = [];
    if (discarded > 0) notes.push(`${discarded} rule${discarded === 1 ? '' : 's'} in the JSON file were invalid and discarded.`);
    if (accepted.length === 0) notes.push('No valid rules found in the JSON file.');

    setDocumentStatus(document.id, accepted.length ? 'review' : 'failed', { compile_error: notes.length ? notes.join(' ') : null });
  } catch (error: any) {
    setDocumentStatus(document.id, 'failed', { compile_error: `Invalid JSON: ${error.message}` });
  }
}
