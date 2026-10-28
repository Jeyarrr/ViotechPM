import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { permissionsFor } from '../config/permissions.js';
import { publicUserSelect, userRepository } from '../repositories/user.repository.js';
import { AppError } from '../utils/errors.js';

type SelectedUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
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

export async function createAuthService(db: PrismaClient) {
  const users = userRepository(db);
  // Unknown accounts take the same password verification path as known accounts.
  const dummyHash = await argon2.hash(randomBytes(32), passwordOptions);
  return {
    async authenticate(email: string, password: string) {
      const user = await users.findCredentials(email);
      const valid = await argon2.verify(user?.passwordHash ?? dummyHash, password);
      if (!user || !valid || user.status !== 'ACTIVE') {
        await db.auditLog.create({ data: { action: 'auth.login.failed', entityType: 'User' } });
        throw new AppError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
      }
      return user.id;
    },
    async currentUser(id: string) {
      const user = await users.findPublic(id);
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
