import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';

// Start only this repository's existing local cluster. Remote/custom databases
// retain their own lifecycle; never initialize, migrate or seed during startup.
if (existsSync('server/.env')) {
  const env = parse(readFileSync('server/.env'));
  const value = process.env.DATABASE_URL ?? env.DATABASE_URL;
  const target = value ? new URL(value) : null;
  if (
    (process.env.NODE_ENV ?? env.NODE_ENV) === 'development' &&
    target?.hostname === '127.0.0.1' &&
    target.port === '55432' &&
    target.pathname === '/viotechpm' &&
    existsSync('.local/postgres/PG_VERSION')
  ) {
    const result = spawnSync(process.execPath, ['scripts/local-db.mjs', 'start'], {
      stdio: 'inherit',
      windowsHide: true,
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
