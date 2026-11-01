import { test, expect } from './fixtures';
import { randomBytes } from 'node:crypto';

test('profile password change signs out and accepts only the new password', async ({ page }) => {
  const email = `password-${randomBytes(6).toString('hex')}@test.viotech.local`;
  const current = randomBytes(24).toString('base64url');
  const replacement = randomBytes(24).toString('base64url');
  const login = async (username: string, password: string) => {
    await page.goto('/login');
    await page.getByLabel('Email or username').fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  };
  await login(process.env.BOOTSTRAP_ADMIN_EMAIL!, process.env.BOOTSTRAP_ADMIN_PASSWORD!);
  await expect(page).toHaveURL('/');
  const token = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
  const headers = { Origin: 'http://localhost:5174', 'X-CSRF-Token': token };
  const roles = (await (await page.request.get('/api/lookups/roles')).json()).data.items as {
    id: string;
    key: string;
  }[];
  const created = await page.request.post('/api/employees', {
    headers,
    data: {
      name: 'Password Acceptance User',
      email,
      password: current,
      roleId: roles.find((role) => role.key === 'employee')!.id,
      departmentId: null,
    },
  });
  expect(created.status()).toBe(201);
  await page.request.post('/api/auth/logout', { headers, data: {} });
  await login(email, current);
  await expect(page).toHaveURL('/');
  await page.goto('/profile');
  await page.getByLabel('Current password', { exact: true }).fill(current);
  await page.getByLabel('New password', { exact: true }).fill(replacement);
  await page.getByLabel('Confirm new password', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Update password and sign out' }).click();
  await expect(page).toHaveURL('/login');
  await login(email, current);
  await expect(page.getByRole('alert')).toContainText('incorrect');
  await login(email, replacement);
  await expect(page).toHaveURL('/');
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
