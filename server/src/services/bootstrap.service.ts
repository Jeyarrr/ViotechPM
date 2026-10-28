import argon2 from 'argon2';
import type { PrismaClient } from '../generated/prisma/client.js';
import { roleDefinitions } from '../config/permissions.js';
import { passwordOptions } from './auth.service.js';
import { bootstrapSchema } from '../validators/auth.js';

export async function bootstrap(db: PrismaClient, input: NodeJS.ProcessEnv) {
  const parsed = bootstrapSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      'Set valid BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, and a unique BOOTSTRAP_ADMIN_PASSWORD (14–128 characters).',
    );
  const env = parsed.data;
  const passwordHash = await argon2.hash(env.BOOTSTRAP_ADMIN_PASSWORD, passwordOptions);
  return db.$transaction(async (tx) => {
    for (const role of roleDefinitions) {
      await tx.role.upsert({
        where: { key: role.key },
        create: role,
        update: { name: role.name, description: role.description },
      });
    }
    for (const name of [
      'Software Development',
      'IT Support',
      'Infrastructure & Networking',
      'Administration',
    ]) {
      await tx.department.upsert({ where: { name }, create: { name }, update: {} });
    }
    // Never overwrite an existing password, role, or account state on a repeated seed.
    const existing = await tx.user.findUnique({ where: { email: env.BOOTSTRAP_ADMIN_EMAIL } });
    if (existing) return { created: false };
    const role = await tx.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    const department = await tx.department.findUniqueOrThrow({ where: { name: 'Administration' } });
    const user = await tx.user.create({
      data: {
        name: env.BOOTSTRAP_ADMIN_NAME,
        email: env.BOOTSTRAP_ADMIN_EMAIL,
        passwordHash,
        roleId: role.id,
        departmentId: department.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'system.admin.bootstrapped',
        entityType: 'User',
        entityId: user.id,
      },
    });
    return { created: true };
  });
}
