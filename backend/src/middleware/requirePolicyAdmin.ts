import { Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';

function allowlist(): Set<string> | null {
  const raw = process.env.POLICY_ADMIN_USER_IDS;
  if (!raw || !raw.trim()) return null;
  return new Set(raw.split(',').map((id) => id.trim()).filter(Boolean));
}

export function isAdminGateEnabled(): boolean {
  return allowlist() !== null;
}

export function canManagePolicies(userId: string | null | undefined): boolean {
  const ids = allowlist();
  if (!ids) return true;
  return !!userId && ids.has(userId);
}

export function requirePolicyAdmin(req: Request, res: Response, next: NextFunction) {
  const { userId } = getAuth(req);
  if (!canManagePolicies(userId as string | undefined)) {
    res.status(403).json({ error: 'Policy administration is restricted' });
    return;
  }
  next();
}
