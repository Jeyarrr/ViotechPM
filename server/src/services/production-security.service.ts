import argon2 from 'argon2';
import type { PrismaClient } from '../generated/prisma/client.js';

/** A minimum policy, not a claim that a password is unique or unbreached. */
export function productionPasswordAllowed(password: string): boolean {
  return (
    password.length >= 16 &&
    password.length <= 128 &&
    new Set(password.toLowerCase()).size >= 6 &&
    !/^(.{1,16})\1+$/i.test(password) &&
    !/^(?:admin|password|changeme|letmein|qwerty|viotech|replace)[\W_\d]*$/i.test(password) &&
    !password.toUpperCase().includes('REPLACE_WITH')
  );
}

export function assertProductionTarget(input: NodeJS.ProcessEnv) {
  if (input.NODE_ENV !== 'production') throw Error('Provisioning requires NODE_ENV=production.');
  let target: URL;
  try {
    target = new URL(input.DIRECT_DATABASE_URL ?? '');
  } catch {
    throw Error('A valid DIRECT_DATABASE_URL is required.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    target.hostname.includes('-pooler') ||
    !['require', 'verify-full'].includes(target.searchParams.get('sslmode') ?? '') ||
    target.hostname !== input.PROVISION_TARGET_HOST ||
    decodeURIComponent(target.pathname.slice(1)) !== input.PROVISION_TARGET_DATABASE
  ) {
    throw Error('Production target must be a confirmed remote direct TLS database.');
  }
  return target;
}

export async function assertProductionAccounts(db: PrismaClient) {
  const admins = await db.user.findMany({
    where: { status: 'ACTIVE', role: { key: 'super_admin' } },
    select: { passwordHash: true },
  });
  if (!admins.length) throw Error('Provision an active administrator before production startup.');
  for (const admin of admins) {
    if (!admin.passwordHash.startsWith('$argon2id$'))
      throw Error('Administrator password requires secure rotation.');
    for (const blocked of ['admin', 'password', 'admin123', 'changeme'])
      if (await argon2.verify(admin.passwordHash, blocked))
        throw Error('Development credentials detected. Rotate them before production startup.');
  }
}
