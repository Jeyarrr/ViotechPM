import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { permissionsFor } from '../config/permissions.js';
import { publicUserSelect, userRepository } from '../repositories/user.repository.js';
import { AppError } from '../utils/errors.js';
import { productionPasswordAllowed } from './production-security.service.js';

type SelectedUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
const localDemoEmails = new Set([
  'manager@viotech.test',
  'developer@viotech.test',
  'technician@viotech.test',
  'employee@viotech.test',
]);
export type PublicUser = Omit<SelectedUser, 'status' | 'createdAt' | 'lastLoginAt'> & {
  createdAt: string;
  lastLoginAt: string | null;
  permissions: ReturnType<typeof permissionsFor>;
};

export const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};
export function serializeUser(user: SelectedUser): PublicUser {
  const { status: _status, ...safe } = user;
  void _status;
  return {
    ...safe,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    permissions: permissionsFor(user.role.key),
  };
}

export async function createAuthService(db: PrismaClient, production = false) {
  const users = userRepository(db);
  // Unknown accounts take the same password verification path as known accounts.
  const dummyHash = await argon2.hash(randomBytes(32), passwordOptions);
  return {
    async authenticate(email: string, password: string) {
      const user = await users.findCredentials(email);
      const valid = await argon2.verify(user?.passwordHash ?? dummyHash, password);
      if (
        !user ||
        !valid ||
        user.status !== 'ACTIVE' ||
        (production && (!productionPasswordAllowed(password) || localDemoEmails.has(email)))
      ) {
        await db.auditLog.create({ data: { action: 'auth.login.failed', entityType: 'User' } });
        throw new AppError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
      }
      return user.id;
    },
    async changePassword(id: string, currentPassword: string, newPassword: string) {
      if (!productionPasswordAllowed(newPassword))
        throw new AppError(
          422,
          'PASSWORD_POLICY',
          'Use a unique password of 16–128 characters; avoid common or repetitive passwords.',
        );
      const passwordHash = await argon2.hash(newPassword, passwordOptions);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id } });
        if (
          !user ||
          user.status !== 'ACTIVE' ||
          !(await argon2.verify(user.passwordHash, currentPassword))
        )
          throw new AppError(403, 'INVALID_CURRENT_PASSWORD', 'The current password is incorrect.');
        if (await argon2.verify(user.passwordHash, newPassword))
          throw new AppError(422, 'PASSWORD_REUSED', 'Choose a different password.');
        await tx.user.update({ where: { id }, data: { passwordHash } });
        await tx.$executeRaw`DELETE FROM sessions WHERE sess->>'userId' = ${id}`;
        await tx.auditLog.create({
          data: {
            actorId: id,
            entityType: 'User',
            entityId: id,
            action: 'security.password_changed',
          },
        });
      });
    },
    async currentUser(id: string) {
      const user = await users.findPublic(id);
      if (production && user) {
        if (localDemoEmails.has(user.email)) return null;
        const credentials = await users.findCredentials(user.email);
        // Also invalidate previously issued hosted sessions for the local-only administrator password.
        if (credentials && (await argon2.verify(credentials.passwordHash, 'admin'))) return null;
      }
      return user?.status === 'ACTIVE' ? serializeUser(user) : null;
    },
    async recordLogin(id: string) {
      const [user] = await db.$transaction([
        db.user.update({
          where: { id },
          data: { lastLoginAt: new Date() },
          select: publicUserSelect,
        }),
        db.auditLog.create({
          data: { actorId: id, action: 'auth.login.succeeded', entityType: 'User', entityId: id },
        }),
      ]);
      return serializeUser(user);
    },
  };
}
export type AuthService = Awaited<ReturnType<typeof createAuthService>>;
