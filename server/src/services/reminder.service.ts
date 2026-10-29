import type { PrismaClient, Prisma } from '../generated/prisma/client.js';

export function manilaDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function reminderSettings() {
  const days = (process.env.REMINDER_DAYS ?? '3,1,0').split(',').map(Number);
  const overdueInterval = Number(process.env.REMINDER_OVERDUE_DAYS ?? 1);
  if (
    !days.length ||
    days.some((d) => !Number.isInteger(d) || d < 0 || d > 90) ||
    !Number.isInteger(overdueInterval) ||
    overdueInterval < 1 ||
    overdueInterval > 90
  )
    throw Error('Invalid reminder day configuration.');
  return { days, overdueInterval };
}
export async function runReminders(
  db: PrismaClient,
  now = new Date(),
  settings = reminderSettings(),
) {
  const day = manilaDay(now),
    midnight = Date.parse(`${day}T00:00:00Z`);
  return db.$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(57420304) AS locked`;
      if (!lock[0]?.locked) return { created: 0, day };
      const projects = await tx.project.findMany({
        where: { archivedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        include: { members: { select: { userId: true } } },
      });
      let created = 0;
      for (const project of projects) {
        const candidates = await tx.user.findMany({
          where: {
            id: { in: [project.managerId, ...project.members.map((m) => m.userId)] },
            status: 'ACTIVE',
          },
        });
        const active = new Set(candidates.map((u) => u.id));
        const [tasks, milestones] = await Promise.all([
          tx.task.findMany({
            where: { projectId: project.id, archivedAt: null, status: { not: 'COMPLETED' } },
            select: { id: true, title: true, dueDate: true, assigneeId: true },
          }),
          tx.milestone.findMany({
            where: { projectId: project.id, archivedAt: null, status: { not: 'COMPLETED' } },
            select: { id: true, title: true, dueDate: true, responsibleId: true },
          }),
        ]);
        const work = [
          {
            id: project.id,
            title: project.name,
            dueDate: project.targetDate,
            type: 'Project',
            assigned: project.managerId,
          },
          ...tasks.map((t) => ({ ...t, type: 'Task', assigned: t.assigneeId })),
          ...milestones.map((m) => ({ ...m, type: 'Milestone', assigned: m.responsibleId })),
        ];
        for (const item of work) {
          const difference = Math.round((item.dueDate.getTime() - midnight) / 86400000);
          if (
            difference >= 0
              ? !settings.days.includes(difference)
              : (-difference - 1) % settings.overdueInterval !== 0
          )
            continue;
          const recipients = [
            ...new Set(
              [project.managerId, item.assigned].filter(
                (id): id is string => !!id && active.has(id),
              ),
            ),
          ];
          const type = difference < 0 ? 'reminder.overdue' : 'reminder.upcoming';
          const data: Prisma.NotificationCreateManyInput[] = recipients.map((recipientId) => ({
            recipientId,
            projectId: project.id,
            taskId: item.type === 'Task' ? item.id : null,
            entityType: item.type,
            entityId: item.id,
            type,
            title:
              difference < 0
                ? `${item.type} overdue`
                : difference === 0
                  ? `${item.type} due today`
                  : `${item.type} due in ${difference} day${difference === 1 ? '' : 's'}`,
            message: item.title,
            dedupeKey: `reminder:${item.type}:${item.id}:${item.dueDate.toISOString().slice(0, 10)}:${day}`,
          }));
          created += (await tx.notification.createMany({ data, skipDuplicates: true })).count;
        }
      }
      return { created, day };
    },
    { timeout: 60000 },
  );
}
export function startReminderScheduler(db: PrismaClient) {
  const interval = Number(process.env.REMINDER_INTERVAL_MS ?? 300000);
  if (!Number.isInteger(interval) || interval < 60000 || interval > 86400000)
    throw Error('REMINDER_INTERVAL_MS must be between 60000 and 86400000.');
  const settings = reminderSettings();
  let stopped = false,
    running: Promise<unknown> | undefined;
  const tick = () => {
    if (stopped || running) return;
    running = runReminders(db, new Date(), settings)
      .catch(() =>
        console.error('Deadline reminder run failed; the next scheduled run will retry.'),
      )
      .finally(() => {
        running = undefined;
      });
  };
  const timer = setInterval(tick, interval);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}
