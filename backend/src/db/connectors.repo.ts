import { db } from './db';

export type Provider = 'anthropic';

export const KNOWN_PROVIDERS: { id: Provider; name: string; envFallback: string }[] = [
  { id: 'anthropic', name: 'Claude (Anthropic)', envFallback: 'ANTHROPIC_API_KEY' },
];

export interface ConnectorStatus {
  provider: Provider;
  name: string;
  configured: boolean;
  source: 'database' | 'environment' | 'none';
  maskedKey: string | null;
  updated_at: string | null;
}

function maskKey(key: string): string {
  return key.length > 8 ? `****${key.slice(-4)}` : '****';
}

export function saveConnectorKey(provider: Provider, apiKey: string): void {
  db.prepare(
    `INSERT INTO connectors (provider, api_key, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(provider) DO UPDATE SET api_key = excluded.api_key, updated_at = excluded.updated_at`
  ).run(provider, apiKey, new Date().toISOString());
}

export function removeConnectorKey(provider: Provider): void {
  db.prepare(`DELETE FROM connectors WHERE provider = ?`).run(provider);
}

// Resolution order: DB-stored key (set via the Connectors UI) wins over the
// process env var, so the app is usable without editing .env by hand.
export function getConnectorKey(provider: Provider): string | undefined {
  const row = db.prepare(`SELECT api_key FROM connectors WHERE provider = ?`).get(provider) as { api_key: string } | undefined;
  if (row?.api_key) return row.api_key;
  const fallback = KNOWN_PROVIDERS.find(p => p.id === provider)?.envFallback;
  return fallback ? process.env[fallback] : undefined;
}

export function listConnectorStatuses(): ConnectorStatus[] {
  const rows = db.prepare(`SELECT provider, api_key, updated_at FROM connectors`).all() as { provider: Provider; api_key: string; updated_at: string }[];
  const byProvider = new Map(rows.map(r => [r.provider, r]));

  return KNOWN_PROVIDERS.map(p => {
    const stored = byProvider.get(p.id);
    if (stored) {
      return { provider: p.id, name: p.name, configured: true, source: 'database' as const, maskedKey: maskKey(stored.api_key), updated_at: stored.updated_at };
    }
    if (process.env[p.envFallback]) {
      return { provider: p.id, name: p.name, configured: true, source: 'environment' as const, maskedKey: maskKey(process.env[p.envFallback] as string), updated_at: null };
    }
    return { provider: p.id, name: p.name, configured: false, source: 'none' as const, maskedKey: null, updated_at: null };
  });
}
