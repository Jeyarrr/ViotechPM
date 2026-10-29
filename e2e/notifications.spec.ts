import { test, expect } from './fixtures';

test('notification bell, filters and read status page work responsively', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(process.env.BOOTSTRAP_ADMIN_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.BOOTSTRAP_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.getByRole('link', { name: 'View all notifications' })).toBeVisible();
  await page.getByRole('link', { name: 'View all notifications' }).click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
  await page.getByLabel('Unread only').check();
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByText('You’re all caught up')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
