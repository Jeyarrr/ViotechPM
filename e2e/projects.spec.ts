import { test, expect } from './fixtures';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';

test('project create, validation, detail, update, archive, and restore', async ({ page }, info) => {
  const code = `PRJ-${randomBytes(5).toString('hex').toUpperCase()}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email address').fill(process.env.BOOTSTRAP_ADMIN_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.BOOTSTRAP_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page).toHaveURL('/');
  const baseline = (await (await page.request.get('/api/dashboard')).json()).data.metrics
    .totalProjects as number;
  const token = (await (await page.request.get('http://localhost:4001/api/auth/csrf')).json()).data
    .csrfToken as string;
  const headers = { Origin: 'http://localhost:5174', 'X-CSRF-Token': token };
  const clientResponse = await page.request.post('http://localhost:4001/api/clients', {
    headers,
    data: {
      code: `CLI-${code}`,
      name: `Project client ${code}`,
      type: 'BUSINESS',
      status: 'ACTIVE',
    },
  });
  expect(clientResponse.status()).toBe(201);
  const clientId = (await clientResponse.json()).data.id as string;
  const categoryId = (
    await (await page.request.get('http://localhost:4001/api/lookups/categories')).json()
  ).data.items[0].id as string;
  await page.goto('/projects');
  await page.getByRole('button', { name: 'Add project', exact: true }).click();
  await page.getByLabel('Project code', { exact: false }).fill(code);
  await page.getByLabel('Project name', { exact: false }).fill(`Browser project ${code}`);
  await page.getByRole('dialog').getByLabel('Client', { exact: false }).selectOption(clientId);
  await page.getByRole('dialog').getByLabel('Category', { exact: false }).selectOption(categoryId);
  await page.getByLabel('Start date', { exact: false }).fill('2026-10-01');
  await page.getByLabel('Target completion date', { exact: false }).fill('2026-09-01');
  await page.getByLabel('Project budget (PHP)').fill('15000.75');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Target completion must be on or after');
  await page.getByLabel('Target completion date', { exact: false }).fill('2026-12-31');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Search projects').fill(code);
  const row = page.getByRole('row').filter({ hasText: code });
  await expect(row).toContainText('15,000.75');
  await row.getByRole('link', { name: 'View', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Browser project ${code}` })).toBeVisible();
  await expect(page.getByText('0 completed / 0 current tasks')).toBeVisible();
  await page.getByRole('button', { name: 'Edit project' }).click();
  await page.getByLabel('Description', { exact: true }).fill('Persisted project description.');
  await page.getByRole('dialog').getByLabel('Status', { exact: false }).selectOption('ACTIVE');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const detailUrl = page.url();
  if ((page.viewportSize()?.width ?? 1440) < 1024)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Overview', exact: true }).filter({ visible: true }).click();
  await expect(
    page.locator('.kpi-card').filter({ hasText: 'Total Projects' }).locator('.kpi-value'),
  ).toHaveText(String(baseline + 1));
  await expect(page.getByText('Project budgets', { exact: true })).toBeVisible();
  await expect(page.getByText('Not available yet', { exact: true })).toBeVisible();
  await expect(page.locator('.budget-live .recharts-surface')).toBeVisible();
  mkdirSync('.local/screenshots', { recursive: true });
  await page.screenshot({
    path: `.local/screenshots/dashboard-populated-${info.project.name}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto(detailUrl);
  await page.reload();
  await expect(page.getByText('Persisted project description.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  mkdirSync('.local/screenshots', { recursive: true });
  await page.screenshot({
    path: `.local/screenshots/project-details-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('link', { name: 'All projects' }).click();
  await page.getByLabel('Search projects').fill(code);
  await row.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(row).not.toBeVisible();
  await page.getByLabel('Archived projects').selectOption('true');
  await row.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Archived projects').selectOption('false');
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(
    (
      await page.request.delete(`http://localhost:4001/api/clients/${clientId}`, {
        headers,
        data: {},
      })
    ).status(),
  ).toBe(200);
  expect(errors).toEqual([]);
});
