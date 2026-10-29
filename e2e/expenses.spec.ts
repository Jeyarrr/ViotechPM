import { test, expect } from './fixtures';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import type { APIRequestContext } from '@playwright/test';

test('approved expenses, budget controls and immutable reversals persist', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const code = `FIN-${randomBytes(5).toString('hex').toUpperCase()}`,
    password = randomBytes(24).toString('base64url'),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const write = async (
    request: APIRequestContext,
    method: 'post' | 'patch' | 'delete',
    path: string,
    data: object = {},
  ) => {
    const token = (await (await request.get('/api/auth/csrf')).json()).data.csrfToken as string;
    return request[method](path, {
      headers: { Origin: 'http://localhost:5174', 'X-CSRF-Token': token },
      data,
    });
  };
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(process.env.BOOTSTRAP_ADMIN_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.BOOTSTRAP_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page).toHaveURL('/');
  const me = (await (await page.request.get('/api/auth/me')).json()).data.user;
  const roles = (await (await page.request.get('/api/lookups/roles')).json()).data.items as {
    id: string;
    key: string;
  }[];
  const email = `${code.toLowerCase()}@test.viotech.local`;
  const created = await write(page.request, 'post', '/api/employees', {
    name: code,
    email,
    password,
    roleId: roles.find((r) => r.key === 'employee')!.id,
  });
  expect(created.status()).toBe(201);
  const requesterId = (await created.json()).data.id as string;
  const client = await write(page.request, 'post', '/api/clients', {
    code: `CLI-${code}`,
    name: code,
    type: 'BUSINESS',
    status: 'ACTIVE',
  });
  expect(client.status()).toBe(201);
  const clientId = (await client.json()).data.id as string;
  const categoryId = (await (await page.request.get('/api/lookups/categories')).json()).data
    .items[0].id as string;
  const project = await write(page.request, 'post', '/api/projects', {
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
  expect(
    (
      await write(page.request, 'post', `/api/projects/${projectId}/members`, {
        userId: requesterId,
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await write(page.request, 'patch', `/api/projects/${projectId}/approval-policy`, {
        primaryReviewerId: me.id,
        requireSecondReview: false,
      })
    ).status(),
  ).toBe(200);
  const requesterContext = await browser.newContext({
    baseURL: 'http://localhost:5174',
    extraHTTPHeaders: { 'X-Forwarded-For': `10.31.${randomBytes(1)[0]}.${randomBytes(1)[0]}` },
  });
  try {
    expect(
      (
        await write(requesterContext.request, 'post', '/api/auth/login', { email, password })
      ).status(),
    ).toBe(200);
    const typeId = (await (await page.request.get('/api/lookups/transaction-types')).json()).data
      .items[0].id as string;
    const approveRequest = async (amount: string) => {
      const response = await write(requesterContext.request, 'post', '/api/transactions', {
        projectId,
        typeId,
        title: `${code} expense ${amount}`,
        requestedAmount: amount,
        transactionDate: '2026-10-29',
      });
      expect(response.status()).toBe(201);
      const id = (await response.json()).data.id as string;
      expect(
        (await write(requesterContext.request, 'post', `/api/transactions/${id}/submit`)).status(),
      ).toBe(200);
      expect(
        (
          await write(page.request, 'post', `/api/approvals/${id}/approve`, {
            comment: 'Approved financial acceptance fixture.',
          })
        ).status(),
      ).toBe(200);
      return id;
    };
    const first = await approveRequest('60.10');
    await page.goto(`/transactions/${first}`);
    await page.getByRole('button', { name: 'Post approved expense', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Reverse expense', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Post approved expense', exact: true }),
    ).not.toBeVisible();
    expect(
      (await write(page.request, 'post', '/api/expenses', { transactionId: first })).status(),
    ).toBe(409);
    await page.goto(`/expenses?projectId=${projectId}`);
    await expect(
      page.locator('.finance-kpi').filter({ hasText: 'Net recorded expenses' }),
    ).toContainText('₱60.10');
    await expect(
      page.locator('.finance-kpi').filter({ hasText: 'Remaining budget' }),
    ).toContainText('₱39.90');
    await page.getByLabel('Search expenses').fill('no-matching-reference');
    await expect(
      page.locator('.finance-kpi').filter({ hasText: 'Filtered expenses' }),
    ).toContainText('₱0.00');
    await page.getByLabel('Search expenses').fill('');
    await expect(page.getByRole('button', { name: 'Reverse', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    mkdirSync('.local/screenshots', { recursive: true });
    await page.screenshot({
      path: `.local/screenshots/expenses-${info.project.name}.png`,
      fullPage: true,
    });
    const second = await approveRequest('50.00');
    await page.goto(`/transactions/${second}`);
    await page.getByRole('button', { name: 'Post approved expense', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('budget');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.goto(`/expenses?projectId=${projectId}`);
    await page.getByRole('button', { name: 'Reverse', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByText('Reversal reason is required.')).toBeVisible();
    await dialog
      .getByLabel('Reversal reason')
      .fill('Cancelled purchase; preserve original posting.');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.locator('.finance-kpi').filter({ hasText: 'Net recorded expenses' }),
    ).toContainText('₱0.00');
    await expect(
      page.locator('.finance-kpi').filter({ hasText: 'Remaining budget' }),
    ).toContainText('₱100.00');
    const ledger = (await (await page.request.get(`/api/expenses?projectId=${projectId}`)).json())
      .data;
    expect(ledger.items).toHaveLength(2);
    expect(
      ledger.items
        .map((e: { amount: string }) => Number(e.amount))
        .sort((a: number, b: number) => a - b),
    ).toEqual([-60.1, 60.1]);
    for (const id of [first, second])
      expect(
        (
          await write(page.request, 'post', `/api/transactions/${id}/cancel`, {
            comment: 'Financial acceptance fixture cleanup.',
          })
        ).status(),
      ).toBe(200);
  } finally {
    await requesterContext.close();
  }
  expect((await write(page.request, 'delete', `/api/projects/${projectId}`)).status()).toBe(200);
  expect((await write(page.request, 'delete', `/api/clients/${clientId}`)).status()).toBe(200);
  expect(
    (
      await write(page.request, 'patch', `/api/employees/${requesterId}/status`, {
        status: 'INACTIVE',
      })
    ).status(),
  ).toBe(200);
  expect(errors).toEqual([]);
});
