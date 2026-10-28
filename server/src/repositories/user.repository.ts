import type { PrismaClient } from '../generated/prisma/client.js';

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  profileImage: true,
  createdAt: true,
  lastLoginAt: true,
  role: { select: { key: true, name: true } },
  department: { select: { id: true, name: true } },
} as const;

export function userRepository(db: PrismaClient) {
  return {
    findCredentials: (email: string) => db.user.findUnique({ where: { email } }),
    findPublic: (id: string) => db.user.findUnique({ where: { id }, select: publicUserSelect }),
  };
}
