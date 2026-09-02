import { Router, Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';
import crypto from 'crypto';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth';
import { requirePolicyAdmin, canManagePolicies, isAdminGateEnabled } from '../middleware/requirePolicyAdmin';
import {
  listDocuments, getDocument, createDocument, updateDocument, setDocumentStatus, activateDocument, archiveDocument, deleteDocument,
  listRules, countEnabledRules, getRule, insertRules, updateRule, deleteRule, deleteCompiledRules, listEvents, getEventStats,
} from '../db/policies.repo';
import { validateRule, ruleToInput } from '../policy/validateRule';
import { getActivePolicy, invalidatePolicyCache } from '../policy/engine';
import { evaluateToolCall, toSessionDecision } from '../policy/evaluate';
import { recordDenial } from '../policy/resolver';
import { extractText, fileExtension, MIME_BY_EXTENSION, SUPPORTED_EXTENSIONS } from '../policy/extractText';
import { compilePolicyDocument } from '../policy/compiler';
import { TOOL_NAMES, PolicyContext } from '../policy/types';
import { ToolCall } from '../types';

const router = Router();

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_COMPILE_MODEL = 'llama3.1';

// express.json() is capped at 100 kb (index.ts), so uploads are multipart,
// held in memory (documents are small text extracts, not large binaries).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (fileExtension(file.originalname)) cb(null, true);
    else cb(new Error(`Unsupported file type — use ${SUPPORTED_EXTENSIONS.map((e) => '.' + e).join(', ')}`));
  },
});

// Converts multer's errors (size limit, filter rejection) into the house { error } shape.
function uploadSingle(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds the 10 MB limit'
        : (err as Error).message || 'Upload failed';
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}

function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function startCompile(documentId: number, model: string) {
  compilePolicyDocument(documentId, model).catch((err) => {
    console.error('Policy compile failed:', err);
  });
}

// NOTE: every static /policies/* path is registered before /policies/:id so
// Express never matches "active", "evaluate", "events", "stats" or "upload" as an id.

router.get('/policies', requireAuth, (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  res.json({ documents: listDocuments(), canManage: canManagePolicies(userId), adminGateEnabled: isAdminGateEnabled() });
});

router.get('/policies/active', requireAuth, (req: Request, res: Response) => {
  const active = getActivePolicy();
  res.json(active ? { document: active.document, rules: active.rules } : null);
});

router.post('/policies/evaluate', requireAuth, (req: Request, res: Response) => {
  const { tool, arguments: args } = req.body;
  if (typeof tool !== 'string' || !(TOOL_NAMES as readonly string[]).includes(tool) || tool === '*') {
    res.status(400).json({ error: `tool must be one of ${TOOL_NAMES.filter((t) => t !== '*').join(', ')}` });
    return;
  }

  const active = getActivePolicy();
  const sessionDecision = toSessionDecision('Allowed', 'session', tool);
  const ctx: PolicyContext = { channel: 'dry_run', allowApproval: true, sessionSource: 'session' };
  const result = evaluateToolCall(active, tool, (args && typeof args === 'object' ? args : {}), sessionDecision, ctx);

  res.json({
    decision: result.decision,
    monitored: result.monitored ? result.documentDecision : null,
    activeDocument: active ? { id: active.document.id, title: active.document.title, enforcement_mode: active.document.enforcement_mode } : null,
  });
});

router.get('/policies/events', requireAuth, (req: Request, res: Response) => {
  const requested = req.query.limit ? Number(req.query.limit) : 50;
  const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 200) : 50;
  res.json(listEvents(limit));
});

router.post('/policies/events/denied', requireAuth, (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { tool, arguments: args, sessionId } = req.body;
  if (typeof tool !== 'string' || !tool) {
    res.status(400).json({ error: 'tool is required' });
    return;
  }
  const toolCall: ToolCall = { type: 'function', function: { name: tool, arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}) } };
  recordDenial(toolCall, { channel: 'execute_tool', userId: userId as string, sessionId: typeof sessionId === 'number' ? sessionId : undefined, allowApproval: true, sessionSource: 'session' });
  res.status(204).end();
});

router.get('/policies/stats', requireAuth, (req: Request, res: Response) => {
  const hours = req.query.hours ? Number(req.query.hours) : 24;
  res.json(getEventStats(Number.isFinite(hours) && hours > 0 ? hours : 24));
});

router.post('/policies/upload', requireAuth, requirePolicyAdmin, uploadSingle, async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'file is required (multipart field "file")' });
    return;
  }
  const ext = fileExtension(file.originalname);
  if (!ext) {
    res.status(400).json({ error: 'Unsupported file type' });
    return;
  }
  const mimeType = MIME_BY_EXTENSION[ext];

  let text: string;
  try {
    text = await extractText(file.buffer, mimeType, file.originalname);
  } catch (error: any) {
    res.status(400).json({ error: `Could not read file: ${error.message}` });
    return;
  }
  if (!text.trim()) {
    res.status(400).json({ error: 'No text could be extracted from this file' });
    return;
  }

  const title = typeof req.body.title === 'string' && req.body.title.trim()
    ? req.body.title.trim().slice(0, 120)
    : file.originalname.replace(/\.[^.]+$/, '');
  const model = typeof req.body.model === 'string' && req.body.model.trim() ? req.body.model.trim() : DEFAULT_COMPILE_MODEL;

  const document = createDocument({
    title,
    filename: file.originalname,
    mime_type: mimeType,
    size_bytes: file.size,
    source_hash: crypto.createHash('sha256').update(file.buffer).digest('hex'),
    source_text: text,
    compile_model: model,
    uploaded_by: userId as string,
  });
  invalidatePolicyCache();
  startCompile(document.id, model);
  res.status(201).json({ document });
});

router.get('/policies/:id', requireAuth, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const document = id ? getDocument(id) : null;
  if (!id || !document) {
    res.status(404).json({ error: 'Policy document not found' });
    return;
  }
  res.json({ document, rules: listRules(id) });
});

router.patch('/policies/:id', requireAuth, requirePolicyAdmin, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id || !getDocument(id)) {
    res.status(404).json({ error: 'Policy document not found' });
    return;
  }
  const { title, enforcement_mode } = req.body;
  const patch: { title?: string; enforcement_mode?: 'enforce' | 'monitor' } = {};
  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ error: 'title must be a non-empty string' });
      return;
    }
    patch.title = title.trim().slice(0, 120);
  }
  if (enforcement_mode !== undefined) {
    if (enforcement_mode !== 'enforce' && enforcement_mode !== 'monitor') {
      res.status(400).json({ error: 'enforcement_mode must be "enforce" or "monitor"' });
      return;
    }
    patch.enforcement_mode = enforcement_mode;
  }
  const document = updateDocument(id, patch);
  invalidatePolicyCache();
  res.json({ document });
});

router.post('/policies/:id/activate', requireAuth, requirePolicyAdmin, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const document = id ? getDocument(id) : null;
  if (!id || !document) {
    res.status(404).json({ error: 'Policy document not found' });
    return;
  }
  if (document.status !== 'review' && document.status !== 'archived') {
    res.status(409).json({ error: `Only documents in review or archived can be activated (status is "${document.status}")` });
    return;
  }
  if (countEnabledRules(id) === 0) {
    res.status(400).json({ error: 'Enable at least one rule before activating' });
    return;
  }
  const activated = activateDocument(id);
  invalidatePolicyCache();
  res.json({ document: activated });
});

router.post('/policies/:id/archive', requireAuth, requirePolicyAdmin, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const document = id ? getDocument(id) : null;
  if (!id || !document) {
    res.status(404).json({ error: 'Policy document not found' });
    return;
  }
  if (document.status !== 'active' && document.status !== 'review') {
    res.status(409).json({ error: `Cannot archive a document with status "${document.status}"` });
    return;
  }
  const archived = archiveDocument(id);
  invalidatePolicyCache();
  res.json({ document: archived });
});

router.post('/policies/:id/recompile', requireAuth, requirePolicyAdmin, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const document = id ? getDocument(id) : null;
  if (!id || !document) {
    res.status(404).json({ error: 'Policy document not found' });
    return;
  }
  if (document.status === 'active' || document.status === 'compiling') {
    res.status(409).json({ error: document.status === 'active' ? 'Archive the policy before recompiling it' : 'Compilation is already running' });
    return;
  }
  const model = typeof req.body?.model === 'string' && req.body.model.trim() ? req.body.model.trim() : (document.compile_model || DEFAULT_COMPILE_MODEL);
  deleteCompiledRules(id); // manual rules are kept
  setDocumentStatus(id, 'compiling', { compile_error: null, compile_model: model });
  invalidatePolicyCache();
  startCompile(id, model);
  res.json({ document: getDocument(id) });
});

router.delete('/policies/:id', requireAuth, requirePolicyAdmin, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const document = id ? getDocument(id) : null;
  if (!id || !document) {
    res.status(404).json({ error: 'Policy document not found' });
    return;
  }
  if (document.status === 'active') {
    res.status(409).json({ error: 'Archive the active policy before deleting it' });
    return;
  }
  deleteDocument(id);
  invalidatePolicyCache();
  res.status(204).end();
});

router.post('/policies/:id/rules', requireAuth, requirePolicyAdmin, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id || !getDocument(id)) {
    res.status(404).json({ error: 'Policy document not found' });
    return;
  }
  const result = validateRule(req.body);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  const [rule] = insertRules(id, [result.rule], 'manual');
  invalidatePolicyCache();
  res.status(201).json({ rule });
});

router.patch('/policies/:id/rules/:ruleId', requireAuth, requirePolicyAdmin, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const ruleId = parseId(req.params.ruleId);
  const existing = id && ruleId ? getRule(id, ruleId) : null;
  if (!id || !ruleId || !existing) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  const { enabled, ...fields } = req.body || {};
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'enabled must be a boolean' });
    return;
  }
  // Merge partial edits onto the stored rule, then re-validate the whole thing.
  const result = validateRule({ ...ruleToInput(existing), ...fields });
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  const rule = updateRule(id, ruleId, result.rule, enabled);
  invalidatePolicyCache();
  res.json({ rule });
});

router.delete('/policies/:id/rules/:ruleId', requireAuth, requirePolicyAdmin, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  const ruleId = parseId(req.params.ruleId);
  if (!id || !ruleId || !deleteRule(id, ruleId)) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  invalidatePolicyCache();
  res.status(204).end();
});

export default router;
