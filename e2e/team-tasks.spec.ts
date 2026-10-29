import { test, expect } from './fixtures';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';

test('employee administration, team assignment, task list and Kanban persist across refresh', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const code = `TEAM-${randomBytes(5).toString('hex').toUpperCase()}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(process.env.BOOTSTRAP_ADMIN_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.BOOTSTRAP_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page).toHaveURL('/');
  const token = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken as string;
  const headers = { Origin: 'http://localhost:5174', 'X-CSRF-Token': token };
  const me = (await (await page.request.get('/api/auth/me')).json()).data.user;
  const roles = (await (await page.request.get('/api/lookups/roles')).json()).data.items as {
    id: string;
    key: string;
  }[];
  await page.goto('/team');
  await page.getByRole('button', { name: 'Add employee' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill(`Employee ${code}`);
  await dialog.getByLabel('Email address').fill(`${code.toLowerCase()}@test.viotech.local`);
  await dialog
    .getByLabel('Role', { exact: false })
    .selectOption(roles.find((r) => r.key === 'developer')!.id);
  await dialog.getByLabel('Initial password').fill(randomBytes(24).toString('base64url'));
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel('Search employees').fill(code);
  const employeeRow = page.getByRole('row').filter({ hasText: code });
  await employeeRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog.getByLabel('Full name').fill(`Updated ${code}`);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByLabel('Search employees').fill(code);
  await expect(employeeRow).toContainText(`Updated ${code}`);
  const employeeId = (await (await page.request.get(`/api/employees?q=${code}`)).json()).data
    .items[0].id as string;
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
  await page.goto(`/projects/${projectId}`);
  await page.getByRole('button', { name: 'View project team' }).click();
  await dialog.getByRole('button', { name: 'Assign member' }).click();
  await dialog.getByLabel('Employee').selectOption(employeeId);
  await dialog.getByLabel('Project responsibility').fill('Development');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByText(`Updated ${code}`, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Add task' }).click();
  await dialog.getByLabel('Task code').fill(`TSK-${code}`);
  await dialog.getByLabel('Task title').fill(`Implement ${code}`);
  await dialog.getByLabel('Assignee').selectOption(employeeId);
  await dialog.getByLabel('Start date').fill('2026-10-01');
  await dialog.getByLabel('Due date').fill('2026-10-30');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('link', { name: 'View all tasks' }).click();
  const taskRow = page.getByRole('row').filter({ hasText: `Implement ${code}` });
  await expect(taskRow).toContainText(`Updated ${code}`);
  await taskRow.getByLabel(`Status for Implement ${code}`).selectOption('IN_PROGRESS');
  await expect(page.getByRole('status').filter({ hasText: 'Task status saved.' })).toBeVisible();
  await page.reload();
  await expect(taskRow.getByLabel(`Status for Implement ${code}`)).toHaveValue('IN_PROGRESS');
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  const card = page.locator('.kanban-task').filter({ hasText: `Implement ${code}` });
  await card.getByLabel(`Status for Implement ${code}`).selectOption('COMPLETED');
  await expect(
    page
      .locator('.kanban-column')
      .filter({ has: page.getByRole('heading', { name: 'Completed', exact: false }) })
      .getByText(`Implement ${code}`, { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  mkdirSync('.local/screenshots', { recursive: true });
  await page.screenshot({
    path: `.local/screenshots/tasks-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText('1 completed / 1 current tasks')).toBeVisible();
  await page.getByRole('button', { name: 'Edit project' }).click();
  await dialog.getByLabel('Status', { exact: false }).selectOption('COMPLETED');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('link', { name: 'View all tasks' }).click();
  await taskRow.getByRole('button', { name: 'Archive', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(taskRow).not.toBeVisible();
  await page.goto('/team');
  await page.getByLabel('Search employees').fill(code);
  await employeeRow.getByRole('button', { name: 'Deactivate' }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(employeeRow).toContainText('INACTIVE');
  expect(
    (await page.request.delete(`/api/projects/${projectId}`, { headers, data: {} })).status(),
  ).toBe(200);
  expect(
    (await page.request.delete(`/api/clients/${clientId}`, { headers, data: {} })).status(),
  ).toBe(200);
  expect(errors).toEqual([]);
});
