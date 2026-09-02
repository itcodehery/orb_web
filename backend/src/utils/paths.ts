import path from 'path';
import os from 'os';

// Node's fs module has no concept of '~' — that's a shell convention, never
// expanded by Node itself. Every place that turns a model-supplied path into
// a real filesystem call needs this, or a bare "~/..." path fails with ENOENT.
function expandHome(value: string): string {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function normalizePath(value: string): string {
  return path.resolve(expandHome(value));
}
