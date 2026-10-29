import { test, expect } from './fixtures';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';

test('filtered reports, protected CSV, audit details and live milestone dashboard work', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const code = `RPT-${randomBytes(5).toString('hex').toUpperCase()}`,
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const write = async (method: 'post' | 'patch' | 'delete', path: string, data: object = {}) => {
    const token = (await (await page.request.get('/api/auth/csrf')).json()).data
      .csrfToken as string;
    return page.request[method](path, {
      headers: { Origin: 'http://localhost:5174', 'X-CSRF-Token': token },
      data,
    });
  };
  await page.goto('/login');
  await page.getByLabel('Email address').fill(process.env.BOOTSTRAP_ADMIN_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.BOOTSTRAP_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page).toHaveURL('/');
  const before = (await (await page.request.get('/api/dashboard')).json()).data.operations
    .upcomingCount as number;
  const me = (await (await page.request.get('/api/auth/me')).json()).data.user;
  const client = await write('post', '/api/clients', {
    code: `CLI-${code}`,
    name: code,
    type: 'BUSINESS',
    status: 'ACTIVE',
  });
  expect(client.status()).toBe(201);
  const clientId = (await client.json()).data.id as string;
  const categoryId = (await (await page.request.get('/api/lookups/categories')).json()).data
    .items[0].id as string;
  const project = await write('post', '/api/projects', {
    code: `PRJ-${code}`,
    name: code,
    clientId,
    categoryId,
    managerId: me.id,
    startDate: '2026-10-01',
    targetDate: '2026-12-31',
    budget: '100.00',
    priority: 'HIGH',
    status: 'ACTIVE',
  });
  expect(project.status()).toBe(201);
  const projectId = (await project.json()).data.id as string;
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const milestone = await write('post', '/api/milestones', {
    projectId,
    title: `+SUM("${code}",1)`,
    startDate: day,
    dueDate: day,
    status: 'NOT_STARTED',
    priority: 'HIGH',
  });
  expect(milestone.status()).toBe(201);
  const milestoneId = (await milestone.json()).data.id as string;
  const typeId = (await (await page.request.get('/api/lookups/transaction-types')).json()).data
    .items[0].id as string;
  const transaction = await write('post', '/api/transactions', {
    projectId,
    typeId,
    title: `${code} pending cost`,
    requestedAmount: '5.50',
    transactionDate: day,
  });
  expect(transaction.status()).toBe(201);
  await page.reload();
  await expect(
    page.locator('.operations-kpis .finance-kpi').filter({ hasText: 'Upcoming Milestones' }),
  ).toContainText(String(before + 1));
  await expect(
    page.getByRole('heading', { name: 'Milestone completion overview', exact: true }),
  ).toBeVisible();
  await page.goto('/analytics');
  await expect(
    page.getByRole('heading', { name: 'Reports & analytics', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Report project').selectOption(projectId);
  await expect(page.getByRole('row').filter({ hasText: code })).toContainText('NOT_STARTED');
  const downloadCsv = async () => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const download = await pending;
    return readFileSync((await download.path())!, 'utf8');
  };
  expect(await downloadCsv()).toContain(`"'+SUM(""${code}"",1)"`);
  await page.getByLabel('Report status').selectOption('COMPLETED');
  await expect(page.getByText('No records found', { exact: true })).toBeVisible();
  await page.getByLabel('Report status').selectOption('');
  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: code })).toContainText('5.50');
  expect(await downloadCsv()).toContain('"5.50"');
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await expect(page.getByText('No records found', { exact: true })).toBeVisible();
  const csv = await downloadCsv();
  expect(csv).toContain('"Amount (PHP)"');
  expect(csv).not.toContain('5.50');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  mkdirSync('.local/screenshots', { recursive: true });
  await page.screenshot({
    path: `.local/screenshots/reports-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto('/audit-logs');
  await page.getByLabel('Audit project').selectOption(projectId);
  await page.getByLabel('Audit event').selectOption('milestone.created');
  await expect(page.getByRole('row').filter({ hasText: 'milestone.created' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Audit event details', { exact: true })).toBeVisible();
  await expect(dialog.locator('.audit-metadata')).toContainText(code);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByLabel('Search audit logs').fill('not-a-matching-audit-event');
  await expect(page.getByText('No records found', { exact: true })).toBeVisible();
  await page.getByLabel('Search audit logs').fill('');
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `.local/screenshots/audit-${info.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Audit logs', exact: true })).toBeVisible();
  expect(
    (await write('patch', `/api/milestones/${milestoneId}`, { status: 'COMPLETED' })).status(),
  ).toBe(200);
  await page.goto('/');
  await expect(
    page.locator('.operations-kpis .finance-kpi').filter({ hasText: 'Upcoming Milestones' }),
  ).toContainText(String(before));
  expect((await write('delete', `/api/projects/${projectId}`)).status()).toBe(200);
  expect((await write('delete', `/api/clients/${clientId}`)).status()).toBe(200);
  expect(errors).toEqual([]);
});
