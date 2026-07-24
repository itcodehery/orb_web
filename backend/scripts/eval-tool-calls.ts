// Regression harness for tool-call reliability. Run after touching
// TOOL_USE_DIRECTIVE or the tool registry: `npx tsx scripts/eval-tool-calls.ts`
import { Ollama } from '../src/llm/Ollama';
import { registry } from '../src/agent/sharedInstances';
import { TOOL_USE_DIRECTIVE } from '../src/agent/systemPrompt';

const MODEL = process.env.EVAL_MODEL || 'qwen3:8b';
const BASE_PROMPT = 'You are Orb, a local AI assistant. Ensure all actions are safe and approved.' + TOOL_USE_DIRECTIVE;

interface Case {
  name: string;
  message: string;
  expectTool: string | null; // null = expect no tool call
}

const CASES: Case[] = [
  { name: 'imperative bash', message: 'List the files in the current directory using ls.', expectTool: 'execute_bash' },
  { name: 'bash, question phrasing', message: 'How do I create a new rust project?', expectTool: 'execute_bash' },
  { name: 'web search, question phrasing', message: 'Can you find out the latest Node.js LTS version?', expectTool: 'web_search' },
  { name: 'read file, question phrasing', message: "What's inside /etc/hostname?", expectTool: 'read_file' },
  { name: 'pure knowledge (no tool expected)', message: 'What is a Rust trait?', expectTool: null },
];

async function run() {
  const llm = new Ollama(MODEL, (process.env.EVAL_MODE as 'low' | 'high') || 'low', 2048);
  let pass = 0;
  for (const c of CASES) {
    const res = await llm.chat([{ role: 'user', content: c.message }], registry.getSchemas(), BASE_PROMPT);
    const calledTool = res.toolCalls?.[0]?.function?.name ?? null;
    const ok = c.expectTool === null ? calledTool === null : calledTool === c.expectTool;
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${c.name} (expected: ${c.expectTool ?? 'none'}, got: ${calledTool ?? 'none'})`);
    if (ok) pass++;
  }
  console.log(`\n${pass}/${CASES.length} passed`);
  if (pass !== CASES.length) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
