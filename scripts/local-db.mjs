// Isolated local developer cluster. Does not modify the installed PostgreSQL service.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const local = join(root, '.local');
const data = join(local, 'postgres');
const bin =
  process.env.PG_BIN ??
  (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '');
const port = '55432';
function run(name, args, env = {}) {
  const command = bin ? join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`) : name;
  const result = spawnSync(command, args, {
    windowsHide: true,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 60_000,
  });
  if (result.status !== 0)
    throw new Error(
      `${name} failed. Check PostgreSQL installation, port ${port}, and .local/postgres.log.`,
    );
  return result.stdout;
}
function running() {
  try {
    run('pg_ctl', ['status', '-D', data]);
    return true;
  } catch {
    return false;
  }
}
function start() {
  if (!existsSync(join(data, 'PG_VERSION'))) throw new Error('Run npm run db:local first.');
  if (!running()) run('pg_ctl', ['start', '-D', data, '-l', join(local, 'postgres.log'), '-w']);
  console.info(`Isolated PostgreSQL is running on localhost:${port}.`);
}

try {
  const action = process.argv[2] ?? 'setup';
  if (action === 'stop') {
    if (running()) run('pg_ctl', ['stop', '-D', data, '-m', 'fast', '-w']);
    console.info('Isolated PostgreSQL stopped.');
  } else if (action === 'start') {
    start();
  } else if (action === 'setup') {
    mkdirSync(local, { recursive: true });
    const envFile = join(root, 'server', '.env');
    const initialized = existsSync(join(data, 'PG_VERSION'));
    if (existsSync(envFile) && !initialized)
      throw new Error(
        'server/.env already exists. Preserve it and use your configured PostgreSQL, or move it aside before creating an isolated cluster.',
      );
    if (!initialized) {
      const password = randomBytes(30).toString('hex');
      const adminPassword = randomBytes(24).toString('base64url');
      const passwordFile = join(local, '.pgpass-init');
      writeFileSync(passwordFile, password, { mode: 0o600 });
      try {
        run('initdb', [
          '-D',
          data,
          '-U',
          'viotechpm',
          '--pwfile',
          passwordFile,
          '--auth=scram-sha-256',
          '--encoding=UTF8',
          '--locale=C',
        ]);
      } finally {
        unlinkSync(passwordFile);
      }
      writeFileSync(
        join(data, 'postgresql.auto.conf'),
        `port = ${port}\nlisten_addresses = '127.0.0.1'\npassword_encryption = 'scram-sha-256'\n`,
      );
      writeFileSync(
        envFile,
        `NODE_ENV=development\nPORT=4000\nCLIENT_ORIGIN=http://localhost:5173\nDATABASE_URL=postgresql://viotechpm:${password}@127.0.0.1:${port}/viotechpm?schema=public\nTEST_DATABASE_URL=postgresql://viotechpm:${password}@127.0.0.1:${port}/viotechpm_test?schema=public\nSESSION_SECRET=${randomBytes(48).toString('hex')}\nBOOTSTRAP_ADMIN_NAME=Viotech Administrator\nBOOTSTRAP_ADMIN_EMAIL=admin@viotech.local\nBOOTSTRAP_ADMIN_PASSWORD=${adminPassword}\nTRUST_PROXY=0\n`,
        { mode: 0o600, flag: 'wx' },
      );
    }
    start();
    const file = readFileSync(envFile, 'utf8');
    const url = new URL(file.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim() ?? '');
    if (url.hostname !== '127.0.0.1' || url.port !== port || url.username !== 'viotechpm')
      throw new Error('server/.env does not point to the isolated local cluster.');
    const connection = { PGPASSWORD: decodeURIComponent(url.password) };
    for (const name of ['viotechpm', 'viotechpm_test']) {
      const result = run(
        'psql',
        [
          '-w',
          '-h',
          '127.0.0.1',
          '-p',
          port,
          '-U',
          'viotechpm',
          '-d',
          'postgres',
          '-tAc',
          `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
        ],
        connection,
      );
      if (result.trim() !== '1')
        run('createdb', ['-w', '-h', '127.0.0.1', '-p', port, '-U', 'viotechpm', name], connection);
    }
    console.info(
      'Local databases ready. Credentials are in ignored server/.env; no credentials were printed.',
    );
  } else throw new Error('Use setup, start, or stop.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local database setup failed.');
  process.exitCode = 1;
}
