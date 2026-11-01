# Neon setup — private testing

## Connected project

- Project: `viotechpm` (`polished-breeze-77055606`)
- Organization: `org-misty-sun-93907091`
- Branch: `production`
- Region: AWS Singapore
- Enabled service: Postgres only; existing Express authentication and Prisma/pg remain in use.

The branch name does not make this a public production deployment. The application is currently run locally against the hosted database.

## Commands

```powershell
npm run dev:neon
# Apply future reviewed migrations explicitly:
npm run db:migrate:neon
```

`dev:neon` starts the existing frontend/API, binds the API to loopback, and uses development authentication. Username/password: `admin` / `admin`, as explicitly requested for private testing. Account name: Lawrence Arvin Violan. Normal production startup rejects this password and requires HTTPS and durable document storage. The separately authorized [free Render test configuration](RENDER_FREE_TEST.md) explicitly permits the existing test login and disables documents.

Normal `npm run dev` continues to use `server/.env` and the existing local database. No local data was imported, reset, or overwritten.

## Connection mapping

`neon init` generated `neon.ts` and the ignored `.neon` project link. `neon deploy` pulled secrets into the ignored root `.env.local`.

| Neon variable           | Application use                                                                 |
| ----------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Prisma queries and PostgreSQL sessions via the pooler                           |
| `DATABASE_URL_UNPOOLED` | `DIRECT_DATABASE_URL` for migrations; `REALTIME_DATABASE_URL` for LISTEN/NOTIFY |
| `NEON_BRANCH`           | Provider branch metadata                                                        |

The explicit runner uses certificate-verified TLS (`sslmode=verify-full`) and leaves source environment files unchanged. Never put database credentials in a `VITE_` variable or commit `.env.local`. Other computers need their own CLI login and `neon init`/`neon deploy`, plus the existing server environment configuration.

## Verification results

- Installed Neon CLI 8.16.0; exact requested init succeeded using existing authentication.
- `neon config plan`: `No changes — branch production already matches the policy.`
- `neon deploy`: `Pulled 3 Neon variables into .env.local`.
- `npm run build`: exit 0, server TypeScript compilation and Vite build succeeded (`built in 12.74s`).
- Tested all 13 migrations on temporary branch `viotechpm-setup-check` before applying them to the empty production branch.
- `npm run db:migrate:neon`: `All migrations have been successfully applied.`
- `node scripts/neon-smoke.mjs`: passed compiled API readiness, pooled queries, direct realtime listener startup, CSRF login, PostgreSQL sessions, authenticated client create/update/read/archive, logout rejection, browser login, dashboard rendering and authenticated reload on the temporary branch.
- Private production-branch verification: 13 migrations present; actual `admin/admin` browser login, dashboard and reload passed.
- Temporary test branch removed after verification; production contains the requested administrator and bootstrap roles/departments, without smoke clients or test users.

The smoke script requires ignored `.local/neon-check-direct.txt` and `.local/neon-check-pool.txt` containing provider-issued connections for a disposable branch. It refuses the configured production host. It creates test fixtures on that disposable branch; delete that branch after running it. Build first.

## Issues encountered

The first smoke attempts failed because the test created its login request before obtaining its CSRF cookie, omitted JSON bodies for archive/logout, and used a browser origin that differed from the test server allowlist. Those test setup issues were corrected; the final run passed without weakening application checks.

The build emitted non-fatal third-party Zod comment-annotation warnings. Installation also reported an esbuild install-script warning; CLI initialization and deployment nevertheless completed successfully.

Vercel/frontend hosting, an externally hosted Express API, and durable private file storage are separate remaining deployment tasks. No public app URL was deployed during this database setup.
