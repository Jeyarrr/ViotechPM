import { test, expect } from './fixtures';

test('task discussion persists and updates a second viewer in realtime', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(process.env.BOOTSTRAP_ADMIN_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.BOOTSTRAP_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page).toHaveURL('/');
  const write = async (path: string, body: object = {}, method = 'POST') => {
    const csrf = await (await page.request.get('/api/auth/csrf')).json();
    const response = await page.request.fetch(`/api${path}`, {
      method,
      headers: { Origin: 'http://localhost:5174', 'X-CSRF-Token': csrf.data.csrfToken },
      data: body,
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).data;
  };
  const me = (await (await page.request.get('/api/auth/me')).json()).data.user;
  const categories = (await (await page.request.get('/api/lookups/categories')).json()).data.items;
  const key = Date.now().toString(36).toUpperCase();
  const client = await write('/clients', {
    code: `CC-${key}`,
    name: 'Discussion browser client',
    type: 'BUSINESS',
    status: 'ACTIVE',
  });
  const project = await write('/projects', {
    code: `PC-${key}`,
    name: 'Discussion browser project',
    clientId: client.id,
    categoryId: categories[0].id,
    managerId: me.id,
    startDate: '2026-10-01',
    targetDate: '2026-12-31',
    priority: 'MEDIUM',
    status: 'ACTIVE',
  });
  const task = await write('/tasks', {
    code: `TC-${key}`,
    title: 'Discussion browser task',
    projectId: project.id,
    assigneeId: me.id,
    startDate: '2026-10-01',
    dueDate: '2026-12-01',
    priority: 'MEDIUM',
    status: 'TODO',
  });
  const other = await context.newPage();
  try {
    await page.goto(`/tasks/${task.id}`);
    await other.goto(`/tasks/${task.id}`);
    await expect(other.getByRole('heading', { name: 'Discussion', exact: true })).toBeVisible();
    await page.getByLabel('Choose document').setInputFiles({
      name: 'meeting-notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Private meeting notes'),
    });
    await page.getByRole('button', { name: 'Upload document', exact: true }).click();
    await expect(other.getByText('meeting-notes.txt', { exact: true })).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    expect((await downloadPromise).suggestedFilename()).toBe('meeting-notes.txt');
    await page.getByLabel('New comment', { exact: true }).fill('Realtime discussion message');
    await page.getByRole('button', { name: 'Post comment' }).click();
    await expect(other.getByText('Realtime discussion message', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Edit comment', { exact: true }).fill('Updated discussion message');
    await page.getByRole('button', { name: 'Save comment' }).click();
    await expect(other.getByText('Updated discussion message', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Updated discussion message', { exact: true })).toBeVisible();
    await page.goto(`/projects/${project.id}`);
    await expect(
      page.getByRole('heading', { name: 'Project activity', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Activity type').selectOption('comment');
    await expect(page.getByRole('link', { name: 'comment created', exact: true })).toBeVisible();
    await page.goto('/analytics');
    await expect(
      page.getByRole('heading', { name: 'Operational analytics', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Analytics project', exact: true })
      .selectOption(project.id);
    await expect(
      page.getByRole('link', { name: 'Discussion browser project', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await other.close();
    await write(`/tasks/${task.id}`, {}, 'DELETE');
    await write(`/projects/${project.id}`, {}, 'DELETE');
    await write(`/clients/${client.id}`, {}, 'DELETE');
  }
});
