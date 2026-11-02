import fs from 'node:fs';
import { parse } from 'dotenv';
import argon2 from 'argon2';
import { createDatabase } from '../server/dist/config/database.js';
import { passwordOptions } from '../server/dist/services/auth.service.js';

// Deliberately read only the local server file, never .env.local (Neon).
const env = parse(fs.readFileSync('server/.env'));
const target = new URL(env.DATABASE_URL);
if (
  process.env.NODE_ENV === 'production' ||
  env.NODE_ENV !== 'development' ||
  target.hostname !== '127.0.0.1' ||
  target.port !== '55432' ||
  target.pathname !== '/viotechpm'
)
  throw Error(
    'Demo provisioning requires the isolated local development cluster on 127.0.0.1:55432/viotechpm.',
  );
export const demoAccounts = [
  ['manager', 'Demo Project Manager', 'project_manager', 'Manager@VioPM2026!'],
  ['developer', 'Demo Developer', 'developer', 'Developer@VioPM2026!'],
  ['technician', 'Demo IT Support Technician', 'it_support', 'Technician@VioPM2026!'],
  ['employee', 'Demo Employee', 'employee', 'Employee@VioPM2026!'],
];
const id = (n) => `7e48c2a1-d9a7-4d76-8901-${String(n).padStart(12, '0')}`;
const db = createDatabase(env.DATABASE_URL);
try {
  const [setting] = await db.$queryRawUnsafe('SHOW listen_addresses');
  if (setting.listen_addresses !== '127.0.0.1')
    throw Error('Local database must listen only on loopback.');
  const admin = await db.user.findUniqueOrThrow({
    where: { email: env.BOOTSTRAP_ADMIN_EMAIL },
    include: { role: true },
  });
  if (
    admin.role.key !== 'super_admin' ||
    admin.name !== 'Lawrence Arvin Violan' ||
    admin.status !== 'ACTIVE' ||
    !(await argon2.verify(admin.passwordHash, 'admin'))
  )
    throw Error('Existing administrator identity/credentials differ. No account changes made.');
  const hashes = await Promise.all(demoAccounts.map((a) => argon2.hash(a[3], passwordOptions)));
  await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(78512026)::text`;
      for (let i = 0; i < demoAccounts.length; i++) {
        const [username, name, key] = demoAccounts[i],
          email = `${username}@viotech.test`;
        const role = await tx.role.findUniqueOrThrow({ where: { key } });
        const existing = await tx.user.findUnique({ where: { email } });
        if (existing && existing.id !== id(i + 1))
          throw Error(`Account collision: ${email}; refusing to overwrite an existing account.`);
        if (!existing)
          await tx.user.create({
            data: { id: id(i + 1), name, email, roleId: role.id, passwordHash: hashes[i] },
          });
      }
      const clientCode = 'LOCAL-DEMO-CLIENT',
        projectCode = 'LOCAL-DEMO-PROJECT';
      const existingClient = await tx.client.findUnique({ where: { code: clientCode } });
      const existingProject = await tx.project.findUnique({ where: { code: projectCode } });
      if (
        (existingClient && existingClient.id !== id(10)) ||
        (existingProject && existingProject.id !== id(11))
      )
        throw Error('Demo code collision; no changes made.');
      await tx.client.upsert({
        where: { id: id(10) },
        update: {},
        create: {
          id: id(10),
          code: clientCode,
          name: 'Fictional Aurora Learning Lab',
          notes: 'LOCAL-DEMO: fictional development data only',
          createdById: admin.id,
        },
      });
      const category = await tx.projectCategory.findFirstOrThrow();
      const startDate = new Date('2026-11-01'),
        dueDate = new Date('2026-12-15');
      await tx.project.upsert({
        where: { id: id(11) },
        update: {},
        create: {
          id: id(11),
          code: projectCode,
          name: 'Local Demo — Collaboration Workspace',
          clientId: id(10),
          categoryId: category.id,
          managerId: id(1),
          createdById: admin.id,
          startDate,
          targetDate: dueDate,
          status: 'ACTIVE',
        },
      });
      for (let i = 0; i < 4; i++)
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: id(11), userId: id(i + 1) } },
          update: {},
          create: {
            projectId: id(11),
            userId: id(i + 1),
            assignedById: admin.id,
            role: demoAccounts[i][1],
          },
        });
      await tx.milestone.upsert({
        where: { id: id(12) },
        update: {},
        create: {
          id: id(12),
          projectId: id(11),
          title: 'Fictional pilot delivery',
          responsibleId: id(1),
          createdById: admin.id,
          startDate,
          dueDate,
        },
      });
      for (let i = 0; i < 4; i++)
        await tx.task.upsert({
          where: { id: id(20 + i) },
          update: {},
          create: {
            id: id(20 + i),
            code: `LOCAL-DEMO-TASK-${i + 1}`,
            projectId: id(11),
            milestoneId: id(12),
            title: [
              'Plan pilot delivery',
              'Build fictional demo feature',
              'Prepare demo support checklist',
              'Review fictional user guide',
            ][i],
            assigneeId: id(i + 1),
            createdById: id(1),
            startDate,
            dueDate,
          },
        });
      await tx.approvalPolicy.upsert({
        where: { projectId: id(11) },
        update: {},
        create: {
          projectId: id(11),
          primaryReviewerId: id(1),
          finalReviewerId: admin.id,
          requireSecondReview: true,
          updatedById: admin.id,
        },
      });
    },
    { timeout: 30000 },
  );
  const after = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
  if (
    after.passwordHash !== admin.passwordHash ||
    after.roleId !== admin.roleId ||
    after.name !== admin.name
  )
    throw Error('Administrator preservation verification failed.');
  fs.mkdirSync('.local', { recursive: true });
  fs.writeFileSync(
    '.local/demo-credentials.md',
    `# Local development only\n\nExisting administrator: Lawrence Arvin Violan\nUsername: admin\nEmail: ${admin.email}\nPassword: admin\n\nThe additional fictional accounts use their full email addresses to sign in.\n`,
  );
  console.log('PASS: original administrator ID, name, role and password hash preserved.');
  console.log(
    'PASS: four fictional accounts, client, project, milestone, four assignments and approval policy provisioned locally; reruns preserve existing records.',
  );
} finally {
  await db.$disconnect();
}
