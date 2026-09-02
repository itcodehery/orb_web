import { db } from './db';

export interface MemoryRow {
  id: number;
  user_id: string;
  content: string;
  created_at: string;
}

export function createMemory(userId: string, content: string): MemoryRow {
  // Extraction can re-derive the same fact across turns; skip an exact
  // (case-insensitive) duplicate instead of accumulating repeat rows.
  const existing = db
    .prepare(`SELECT * FROM memories WHERE user_id = ? AND LOWER(content) = LOWER(?)`)
    .get(userId, content) as MemoryRow | undefined;
  if (existing) return existing;

  const created_at = new Date().toISOString();
  const info = db
    .prepare(`INSERT INTO memories (user_id, content, created_at) VALUES (?, ?, ?)`)
    .run(userId, content, created_at);
  return { id: info.lastInsertRowid as number, user_id: userId, content, created_at };
}

export function listMemories(userId: string): MemoryRow[] {
  return db
    .prepare(`SELECT * FROM memories WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as MemoryRow[];
}

export function deleteMemory(id: number, userId: string): void {
  db.prepare(`DELETE FROM memories WHERE id = ? AND user_id = ?`).run(id, userId);
}
