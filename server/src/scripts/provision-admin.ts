// Reads provider/shell environment only. Never loads or overwrites local .env files.
import argon2 from 'argon2';
import { z } from 'zod';
import { createDatabase } from '../config/database.js';
import { bootstrap } from '../services/bootstrap.service.js';
import { passwordOptions } from '../services/auth.service.js';
import {
  assertProductionTarget,
  productionPasswordAllowed,
} from '../services/production-security.service.js';

async function main() {
  assertProductionTarget(process.env);
  const input = z
    .object({
      PROVISION_ACTION: z.enum(['create', 'rotate']),
      PROVISION_ADMIN_NAME: z.string().trim().min(2).max(150),
      PROVISION_ADMIN_EMAIL: z
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
      PROVISION_ADMIN_PASSWORD: z.string().refine(productionPasswordAllowed),
    })
    .parse(process.env);
  const db = createDatabase(process.env.DIRECT_DATABASE_URL!);
  try {
    if (input.PROVISION_ACTION === 'create') {
      const result = await bootstrap(db, {
        BOOTSTRAP_ADMIN_NAME: input.PROVISION_ADMIN_NAME,
        BOOTSTRAP_ADMIN_EMAIL: input.PROVISION_ADMIN_EMAIL,
        BOOTSTRAP_ADMIN_PASSWORD: input.PROVISION_ADMIN_PASSWORD,
      });
      if (!result.created)
        throw Error('Account already exists; select explicit rotation if needed.');
    } else {
      const passwordHash = await argon2.hash(input.PROVISION_ADMIN_PASSWORD, passwordOptions);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE email = ${input.PROVISION_ADMIN_EMAIL} FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { email: input.PROVISION_ADMIN_EMAIL },
          include: { role: true },
        });
        if (!user || user.role.key !== 'super_admin' || user.status !== 'ACTIVE')
          throw Error('Active administrator required.');
        if (await argon2.verify(user.passwordHash, input.PROVISION_ADMIN_PASSWORD))
          throw Error('Choose a different password.');
        await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
        await tx.$executeRaw`DELETE FROM sessions WHERE sess->>'userId' = ${user.id}`;
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            entityType: 'User',
            entityId: user.id,
            action: 'security.admin_password_rotated',
          },
        });
      });
    }
    console.info(
      'Administrator provisioning completed. No credentials were printed. Remove provisioning secrets from the environment.',
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'Provisioning failed. Check confirmed target, action, administrator details and password policy. No account reset was performed automatically.',
  );
  process.exitCode = 1;
});
