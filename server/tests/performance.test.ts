import { it, expect, vi } from 'vitest';
import { runReminders } from '../src/services/reminder.service.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

it('batches reminder reads and keeps recipients scoped to each project', async () => {
  const projects = Array.from({ length: 50 }, (_, index) => ({
    id: `p${index}`,
    managerId: `m${index}`,
    members: [],
    name: 'Private work',
    targetDate: new Date('2026-11-01T00:00:00Z'),
  }));
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]),
    project: { findMany: vi.fn().mockResolvedValue(projects) },
    user: {
      findMany: vi.fn().mockResolvedValue(projects.map((project) => ({ id: project.managerId }))),
    },
    task: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'task',
          projectId: 'p0',
          title: 'Restricted',
          dueDate: new Date('2026-11-01T00:00:00Z'),
          assigneeId: 'm1',
        },
      ]),
    },
    milestone: { findMany: vi.fn().mockResolvedValue([]) },
    notification: {
      createMany: vi
        .fn()
        .mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
    },
  };
  const db = {
    $transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx),
  } as unknown as PrismaClient;
  const result = await runReminders(db, new Date('2026-11-01T01:00:00Z'));
  expect(result.created).toBe(51);
  for (const model of [tx.project, tx.user, tx.task, tx.milestone])
    expect(model.findMany).toHaveBeenCalledTimes(1);
  const taskNotifications = tx.notification.createMany.mock.calls
    .flatMap((call) => call[0].data)
    .filter((item) => item.taskId === 'task');
  expect(taskNotifications.map((item) => item.recipientId)).toEqual(['m0']);
});
