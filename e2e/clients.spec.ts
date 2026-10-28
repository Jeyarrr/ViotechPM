import { test, expect } from './fixtures';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';

test('client create, edit, refresh, details, archive, restore, and responsive layout', async ({
  page,
}, info) => {
  const code = `E2E-${randomBytes(5).toString('hex').toUpperCase()}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Email address').fill(process.env.BOOTSTRAP_ADMIN_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.BOOTSTRAP_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/clients');
  await page.getByRole('button', { name: 'Add client' }).click();
  await page.getByLabel('Client code', { exact: false }).fill(code);
  await page.getByLabel('Client or company name', { exact: false }).fill(`Browser client ${code}`);
  await page.getByLabel('Email address').fill('invalid');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await page.getByLabel('Email address').fill('contact@example.test');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Search clients').fill(code);
  const row = page.getByRole('row').filter({ hasText: code });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Contact person').fill('Updated contact');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await page.getByLabel('Search clients').fill(code);
  await expect(row.getByText('Updated contact')).toBeVisible();
  await row.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Updated contact')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  mkdirSync('.local/screenshots', { recursive: true });
  await page.screenshot({
    path: `.local/screenshots/clients-${info.project.name}.png`,
    fullPage: true,
  });
  await row.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(row).not.toBeVisible();
  await page.getByLabel('Archived clients').selectOption('true');
  await row.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(row).not.toBeVisible();
  await page.getByLabel('Archived clients').selectOption('false');
  await expect(row).toBeVisible();
  // Retain the audit history in the isolated test database while clearing the current directory.
  await row.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(row).not.toBeVisible();
  expect(errors).toEqual([]);
});
