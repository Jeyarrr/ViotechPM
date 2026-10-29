import { test, expect } from './fixtures';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import type { APIRequestContext, Page } from '@playwright/test';

test('request creation, revision, two-stage approval, rejection and cancellation persist', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const code = `TX-${randomBytes(5).toString('hex').toUpperCase()}`,
    password = randomBytes(24).toString('base64url'),
    errors: string[] = [];
  const signIn = async (target: Page, email: string, secret: string) => {
    target.on('pageerror', (error) => errors.push(error.message));
    await target.goto('/login');
    await target.getByLabel('Email or username').fill(email);
    await target.getByLabel('Password', { exact: true }).fill(secret);
    await target.getByRole('button', { name: 'Sign in to workspace' }).click();
    await expect(target).toHaveURL('/');
  };
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
  await signIn(page, process.env.BOOTSTRAP_ADMIN_EMAIL!, process.env.BOOTSTRAP_ADMIN_PASSWORD!);
  const me = (await (await page.request.get('/api/auth/me')).json()).data.user;
  const roles = (await (await page.request.get('/api/lookups/roles')).json()).data.items as {
    id: string;
    key: string;
  }[];
  const requesterEmail = `${code.toLowerCase()}-requester@test.viotech.local`,
    reviewerEmail = `${code.toLowerCase()}-reviewer@test.viotech.local`;
  const requester = await write(page.request, 'post', '/api/employees', {
    name: `Requester ${code}`,
    email: requesterEmail,
    password,
    roleId: roles.find((r) => r.key === 'employee')!.id,
  });
  expect(requester.status()).toBe(201);
  const requesterId = (await requester.json()).data.id as string;
  const reviewer = await write(page.request, 'post', '/api/employees', {
    name: `Final reviewer ${code}`,
    email: reviewerEmail,
    password,
    roleId: roles.find((r) => r.key === 'super_admin')!.id,
  });
  expect(reviewer.status()).toBe(201);
  const reviewerId = (await reviewer.json()).data.id as string;
  const client = await write(page.request, 'post', '/api/clients', {
    code: `CLI-${code}`,
    name: code,
    type: 'BUSINESS',
    status: 'ACTIVE',
  });
  expect(client.status()).toBe(201);
  const clientId = (await client.json()).data.id as string,
    categoryId = (await (await page.request.get('/api/lookups/categories')).json()).data.items[0]
      .id as string;
  const project = await write(page.request, 'post', '/api/projects', {
    code: `PRJ-${code}`,
    name: `Business ${code}`,
    clientId,
    categoryId,
    managerId: me.id,
    startDate: '2026-10-01',
    targetDate: '2026-12-31',
    budget: '1000.00',
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
  await page.goto(`/projects/${projectId}`);
  await page.getByRole('button', { name: 'Approval policy', exact: true }).click();
  const adminDialog = page.getByRole('dialog');
  await adminDialog.getByLabel('Project reviewer').selectOption(me.id);
  await adminDialog.getByLabel('Final reviewer').selectOption(reviewerId);
  await adminDialog.getByLabel('Review stages').selectOption('true');
  await adminDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(adminDialog).not.toBeVisible();
  const requesterContext = await browser.newContext({
    baseURL: 'http://localhost:5174',
    viewport: page.viewportSize()!,
    extraHTTPHeaders: { 'X-Forwarded-For': `10.21.${randomBytes(1)[0]}.${randomBytes(1)[0]}` },
  });
  const requesterPage = await requesterContext.newPage();
  const finalContext = await browser.newContext({
    baseURL: 'http://localhost:5174',
    viewport: page.viewportSize()!,
    extraHTTPHeaders: { 'X-Forwarded-For': `10.22.${randomBytes(1)[0]}.${randomBytes(1)[0]}` },
  });
  const finalPage = await finalContext.newPage();
  try {
    await signIn(requesterPage, requesterEmail, password);
    await requesterPage.goto(`/transactions?projectId=${projectId}`);
    await requesterPage.getByRole('button', { name: 'Create request', exact: true }).click();
    const dialog = requesterPage.getByRole('dialog');
    const typeId = (
      await (await requesterPage.request.get('/api/lookups/transaction-types')).json()
    ).data.items[0].id as string;
    await dialog.getByLabel('Transaction title').fill(`Equipment ${code}`);
    await dialog.getByLabel('Transaction type', { exact: false }).selectOption(typeId);
    await dialog.getByLabel('Requested amount (PHP)').fill('0');
    await dialog.getByLabel('Transaction date').fill('2026-10-29');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog.getByText('Amount must be greater than zero.')).toBeVisible();
    await dialog.getByLabel('Requested amount (PHP)').fill('100.25');
    await dialog.getByLabel('Supporting notes').fill('Initial justification.');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const row = requesterPage.getByRole('row').filter({ hasText: `Equipment ${code}` });
    await row.getByRole('link', { name: 'View', exact: true }).click();
    const transactionId = requesterPage.url().split('/').at(-1)!,
      ref = (await (await requesterPage.request.get(`/api/transactions/${transactionId}`)).json())
        .data.reference as string;
    await requesterPage.getByRole('button', { name: 'Submit request', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.goto('/approvals');
    await page.getByLabel('Search approvals').fill(ref);
    const approvalRow = page.getByRole('row').filter({ hasText: ref });
    await approvalRow.getByRole('button', { name: 'Return', exact: true }).click();
    await adminDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(adminDialog.getByText('Reason / feedback is required.')).toBeVisible();
    await adminDialog
      .getByLabel('Reason / feedback')
      .fill('Please provide the updated equipment justification.');
    await adminDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(adminDialog).not.toBeVisible();
    await requesterPage.reload();
    await expect(
      requesterPage.locator('.record-badge').filter({ hasText: 'RETURNED FOR REVISION' }),
    ).toBeVisible();
    await requesterPage.getByRole('button', { name: 'Edit request', exact: true }).click();
    await dialog.getByLabel('Requested amount (PHP)').fill('200.20');
    await dialog.getByLabel('Supporting notes').fill('Updated equipment justification.');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await requesterPage.getByRole('button', { name: 'Submit request', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await page.getByLabel('Search approvals').fill(ref);
    await approvalRow.getByRole('button', { name: 'Approve', exact: true }).click();
    await adminDialog.getByLabel('Review notes').fill('Project approval complete.');
    await adminDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(adminDialog).not.toBeVisible();
    await signIn(finalPage, reviewerEmail, password);
    await finalPage.goto('/approvals');
    await finalPage.getByLabel('Search approvals').fill(ref);
    await finalPage
      .getByRole('row')
      .filter({ hasText: ref })
      .getByRole('button', { name: 'Approve', exact: true })
      .click();
    await finalPage.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(finalPage.getByRole('dialog')).not.toBeVisible();
    await requesterPage.reload();
    await expect(
      requesterPage.getByRole('button', { name: 'Edit request', exact: true }),
    ).not.toBeVisible();
    await expect(
      requesterPage.getByRole('heading', { name: 'Submission 2', exact: true }),
    ).toBeVisible();
    await expect(
      requesterPage.getByRole('heading', { name: 'Submission 1', exact: true }),
    ).toBeVisible();
    await expect(requesterPage.locator('.detail-panel').first()).toContainText('₱200.20');
    expect(
      await requesterPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    mkdirSync('.local/screenshots', { recursive: true });
    await requesterPage.screenshot({
      path: `.local/screenshots/transaction-${info.project.name}.png`,
      fullPage: true,
    });
    const cancelled = await write(requesterPage.request, 'post', '/api/transactions', {
      projectId,
      typeId,
      title: `Cancel ${code}`,
      requestedAmount: '10',
      transactionDate: '2026-10-29',
    });
    expect(cancelled.status()).toBe(201);
    const cancelId = (await cancelled.json()).data.id as string;
    await requesterPage.goto(`/transactions/${cancelId}`);
    await requesterPage.getByRole('button', { name: 'Cancel request', exact: true }).click();
    await dialog.getByLabel('Cancellation reason').fill('Request no longer needed.');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(requesterPage.locator('.detail-panel').first()).toContainText('CANCELLED');
    const rejected = await write(requesterPage.request, 'post', '/api/transactions', {
      projectId,
      typeId,
      title: `Reject ${code}`,
      requestedAmount: '10',
      transactionDate: '2026-10-29',
    });
    expect(rejected.status()).toBe(201);
    const rejectedId = (await rejected.json()).data.id as string,
      rejectedRef = (
        await (await requesterPage.request.get(`/api/transactions/${rejectedId}`)).json()
      ).data.reference as string;
    expect(
      (
        await write(requesterPage.request, 'post', `/api/transactions/${rejectedId}/submit`)
      ).status(),
    ).toBe(200);
    await page.reload();
    await page.getByLabel('Search approvals').fill(rejectedRef);
    await page
      .getByRole('row')
      .filter({ hasText: rejectedRef })
      .getByRole('button', { name: 'Reject', exact: true })
      .click();
    await adminDialog
      .getByLabel('Reason / feedback')
      .fill('Expense is outside this project scope.');
    await adminDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(adminDialog).not.toBeVisible();
    await requesterPage.goto(`/transactions/${rejectedId}`);
    await expect(requesterPage.locator('.detail-panel').first()).toContainText('REJECTED');
    expect(
      (
        await write(page.request, 'post', `/api/transactions/${transactionId}/cancel`, {
          comment: 'Completed acceptance fixture cleanup.',
        })
      ).status(),
    ).toBe(200);
  } finally {
    await requesterContext.close();
    await finalContext.close();
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
  expect(
    (
      await write(page.request, 'patch', `/api/employees/${reviewerId}/status`, {
        status: 'INACTIVE',
      })
    ).status(),
  ).toBe(200);
  expect(errors).toEqual([]);
});
