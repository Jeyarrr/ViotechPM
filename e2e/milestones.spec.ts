import { test, expect } from './fixtures';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';

test('milestone CRUD, linked task completion, progress, archive and restore', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const code = `MS-${randomBytes(5).toString('hex').toUpperCase()}`,
    errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email address').fill(process.env.BOOTSTRAP_ADMIN_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.BOOTSTRAP_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page).toHaveURL('/');
  const token = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken as string;
  const headers = { Origin: 'http://localhost:5174', 'X-CSRF-Token': token };
  const me = (await (await page.request.get('/api/auth/me')).json()).data.user;
  const client = await page.request.post('/api/clients', {
    headers,
    data: { code: `CLI-${code}`, name: code, type: 'BUSINESS', status: 'ACTIVE' },
  });
  expect(client.status()).toBe(201);
  const clientId = (await client.json()).data.id as string;
  const categoryId = (await (await page.request.get('/api/lookups/categories')).json()).data
    .items[0].id as string;
  const project = await page.request.post('/api/projects', {
    headers,
    data: {
      code: `PRJ-${code}`,
      name: `Delivery ${code}`,
      clientId,
      categoryId,
      managerId: me.id,
      startDate: '2026-10-01',
      targetDate: '2026-12-31',
      priority: 'HIGH',
      status: 'ACTIVE',
    },
  });
  expect(project.status()).toBe(201);
  const projectId = (await project.json()).data.id as string;
  await page.goto(`/milestones?projectId=${projectId}`);
  await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Milestone title').fill(`Deliverable ${code}`);
  await dialog.getByLabel('Responsible employee').selectOption(me.id);
  await dialog.getByLabel('Start date').fill('2026-10-01');
  await dialog.getByLabel('Due date').fill('2026-09-01');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Due date must be on or after');
  await dialog.getByLabel('Due date').fill('2026-11-20');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const row = page.getByRole('row').filter({ hasText: `Deliverable ${code}` });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByLabel('Description').fill('Persisted milestone description.');
  await dialog.getByLabel('Status', { exact: false }).selectOption('IN_PROGRESS');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await row.getByRole('link', { name: 'View', exact: true }).click();
  const milestoneId = page.url().split('/').at(-1)!;
  await page.reload();
  await expect(page.getByText('Persisted milestone description.')).toBeVisible();
  const task = await page.request.post('/api/tasks', {
    headers,
    data: {
      code: `TSK-${code}`,
      projectId,
      title: `Linked task ${code}`,
      assigneeId: me.id,
      priority: 'MEDIUM',
      status: 'TODO',
      startDate: '2026-10-01',
      dueDate: '2026-11-10',
    },
  });
  expect(task.status()).toBe(201);
  const taskId = (await task.json()).data.id as string;
  await page.goto(`/tasks?projectId=${projectId}`);
  const taskRow = page.getByRole('row').filter({ hasText: `Linked task ${code}` });
  await taskRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByLabel('Milestone', { exact: false }).selectOption(milestoneId);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto(`/milestones/${milestoneId}`);
  await expect(page.getByText('0 completed / 1 current linked tasks')).toBeVisible();
  await page.getByRole('button', { name: 'Edit milestone' }).click();
  await dialog.getByLabel('Status', { exact: false }).selectOption('COMPLETED');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Complete all current linked tasks');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('link', { name: 'View linked tasks' }).click();
  await taskRow.getByLabel(`Status for Linked task ${code}`).selectOption('COMPLETED');
  await expect(page.getByRole('status').filter({ hasText: 'Task status saved.' })).toBeVisible();
  await page.goto(`/milestones/${milestoneId}`);
  await expect(page.getByText('1 completed / 1 current linked tasks')).toBeVisible();
  await page.getByRole('button', { name: 'Edit milestone' }).click();
  await dialog.getByLabel('Status', { exact: false }).selectOption('COMPLETED');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Milestone progress' })).toHaveAttribute(
    'value',
    '100',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  mkdirSync('.local/screenshots', { recursive: true });
  await page.screenshot({
    path: `.local/screenshots/milestone-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('link', { name: 'All milestones' }).click();
  await row.getByRole('button', { name: 'Archive', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(row).not.toBeVisible();
  await page.getByLabel('Archived milestones').selectOption('true');
  await row.getByRole('button', { name: 'Restore', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel('Archived milestones').selectOption('false');
  await expect(row).toBeVisible();
  expect((await page.request.delete(`/api/tasks/${taskId}`, { headers, data: {} })).status()).toBe(
    200,
  );
  expect(
    (await page.request.delete(`/api/milestones/${milestoneId}`, { headers, data: {} })).status(),
  ).toBe(200);
  expect(
    (await page.request.delete(`/api/projects/${projectId}`, { headers, data: {} })).status(),
  ).toBe(200);
  expect(
    (await page.request.delete(`/api/clients/${clientId}`, { headers, data: {} })).status(),
  ).toBe(200);
  expect(errors).toEqual([]);
});
