import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('sign-in, refresh persistence, workspace navigation, logos, and logout', async ({
  page,
}, testInfo) => {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error(
      'Bootstrap credentials are required in server/.env for browser acceptance tests.',
    );
  const errors: string[] = [];
  let authenticated = false;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    const expectedAnonymousCheck =
      !authenticated &&
      message.location().url.endsWith('/api/auth/me') &&
      message.text().includes('status of 401');
    if (message.type() === 'error' && !expectedAnonymousCheck) errors.push(message.text());
  });
  page.on('response', (response) => {
    const expectedAnonymousCheck =
      !authenticated && response.url().endsWith('/api/auth/me') && response.status() === 401;
    if (response.url().includes('/api/') && response.status() >= 400 && !expectedAnonymousCheck)
      errors.push(`Unexpected API response ${response.status()}`);
  });
  await page.goto('/');
  await expect(page).toHaveURL('/login');
  const logo = page.getByRole('img', { name: 'Viotech I.T. Solutions' }).filter({ visible: true });
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  mkdirSync('.local/screenshots', { recursive: true });
  await expect(page.locator('.login-form-wrap')).toHaveCSS('opacity', '1');
  await page.screenshot({
    path: `.local/screenshots/login-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page).toHaveURL('/');
  authenticated = true;
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  await expect(page.getByText('Live workspace · No sample project data')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.locator('.overview-page')).toHaveCSS('opacity', '1');
  await page.screenshot({
    path: `.local/screenshots/dashboard-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) < 1024) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).toBeVisible();
    await page
      .getByRole('link', { name: 'Projects', exact: false })
      .filter({ visible: true })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  } else {
    await page.getByRole('button', { name: 'Collapse sidebar' }).first().click();
    await expect(page.locator('.desktop-sidebar .sidebar')).toHaveClass(/sidebar-collapsed/);
    await page.getByRole('button', { name: 'Expand sidebar' }).first().click();
    await page
      .locator('.desktop-sidebar')
      .getByRole('link', { name: 'Projects', exact: false })
      .click();
  }
  await expect(page).toHaveURL('/projects');
  await expect(page.getByText('This module is planned and is not available yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: 'My profile' }).click();
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible();
  await expect(page.locator('dd').filter({ hasText: email })).toBeVisible();
  await page.getByRole('button', { name: 'Open account menu' }).click();
  authenticated = false;
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/login');
  await page.goto('/');
  await expect(page).toHaveURL('/login');
  expect(errors).toEqual([]);
});
