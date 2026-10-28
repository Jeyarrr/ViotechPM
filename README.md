# ViotechPM

Phase 1 of the project workspace for **Viotech I.T. Solutions**. A PERN monorepo with secure authentication, a PostgreSQL user foundation, a responsive dark interface, and an honest empty dashboard ready for future modules.

## Quick start

Requires Node.js **22.12+** (Node 24 recommended), npm, and PostgreSQL. This workspace was verified with Node 24 and PostgreSQL 18. No application is deployed.

```powershell
npm ci
npm run db:local
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:5173**. The API runs at **http://localhost:4000**. Use `localhost` in the browser to match the configured origin.

`db:local` creates an isolated development cluster in ignored `.local/postgres` on **127.0.0.1:55432**, plus `viotechpm` and `viotechpm_test` databases. It uses the installed PostgreSQL binaries without changing the existing system service. On this machine it finds PostgreSQL 18 automatically; set `PG_BIN` to your PostgreSQL `bin` directory elsewhere (or leave unset on a system with PostgreSQL commands on PATH).

The setup generates random database, session, and bootstrap secrets in **`server/.env`**, which is ignored by Git. Read `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` from that local file to sign in. Credentials are never printed by setup or included in source. Existing `.env` configuration is preserved. Seeding can be repeated without resetting an existing account or password.

```powershell
# Start the isolated cluster after restarting your computer
npm run db:local:start
# Stop this project's cluster
npm run db:local:stop
```

For an existing PostgreSQL server, copy `server/.env.example` to `server/.env`, replace every placeholder, create the databases, and run generate, migrate, and seed. See [database setup](docs/database.md). Never commit real `.env` files.

## Commands

| Command                                                  | Purpose                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                                            | Run the frontend and API together                             |
| `npm run dev:client`                                     | Vite frontend at localhost:5173                               |
| `npm run dev:server`                                     | Express API at localhost:4000                                 |
| `npm run build`                                          | Generate Prisma client and build both applications            |
| `npm run build -w client`                                | Build frontend into client/dist                               |
| `npm run build -w server`                                | Build API into server/dist                                    |
| `npm run start -w server`                                | Run compiled API (after build)                                |
| `npm run typecheck`                                      | Check both applications and backend tests                     |
| `npm run lint`                                           | Lint application, configuration, and tests                    |
| `npm run format:check`                                   | Check formatting                                              |
| `npm run format`                                         | Format source and documentation                               |
| `npm test`                                               | PostgreSQL authentication integration and configuration tests |
| `npx playwright install chromium`                        | Install acceptance test browser                               |
| `npm run test:e2e`                                       | Desktop and mobile browser acceptance tests                   |
| `npm run db:generate`                                    | Generate Prisma client after installing or schema changes     |
| `npm run db:migrate`                                     | Apply committed migrations                                    |
| `npm run db:migrate:dev -w server -- --name change_name` | Author a future migration against a development database      |
| `npm run db:seed`                                        | Safely bootstrap roles, departments, and the first admin      |

## Phase 1 features

- Official logos preserved in `client/public/assets`, with the dark logo used on login, sidebar, and application branding.
- Responsive login, protected routes, collapsible sidebar, mobile drawer, accessible account menu, and read-only profile.
- Overview with five zero-value KPIs, project status, budget/expenses, project activity, deadlines, and team workload. No fabricated project statistics or production demo records. The empty budget chart explicitly labels its illustrative scale.
- Five roles, four configurable department records, account status, last login, and append-only application audit events for authentication/bootstrap.
- Argon2id passwords, PostgreSQL-backed sessions, HttpOnly cookies, login session regeneration, fixed eight-hour sessions, session destruction on logout, rate limits, CSRF tokens, restricted origins, and structured errors.
- Database-backed authorization on protected endpoints. Role/status is rechecked on every protected request. Future navigation is filtered by permission; direct unauthorized routes show access restricted.
- Future module pages clearly state that the module is not available. No project, task, client, finance, milestone, or approval CRUD has been implemented.

## Stack

React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, shadcn/ui-style source components and Radix primitives, Lucide, React Router 7, TanStack Query 5, React Hook Form, Zod 4, Recharts 3, Motion, and locally served Inter. Express 5, Prisma 7.10.1 with its PostgreSQL adapter, node-postgres, express-session/connect-pg-simple, Argon2, Helmet, and express-rate-limit. Vitest, Supertest, Playwright, ESLint, and Prettier. Exact resolved versions are committed in `package-lock.json`.

## Documentation

- [Architecture, security, and API](docs/architecture.md)
- [Schema, local PostgreSQL, bootstrap, and future Neon setup](docs/database.md)
- [Verification and acceptance coverage](docs/testing.md)
- [Phase 1 delivery report](docs/phase-1-report.md)

## Design and scope

Maroon, charcoal, and neutral surfaces follow the official Viotech identity. Both original logo files are copied without edits or distortion. The legacy Figma reference could not be read because the account reached its MCP tool limit; the supplied written requirements drove the redesign.

Phase 2 can add authorized project/client/task models, scoped project membership, milestone workflows, and real dashboard aggregations. Production hosting, multi-instance rate limiting, notification services, and deployment are outside Phase 1. Do not expose the development PostgreSQL cluster to a network.

Git is initialized locally. To publish source later, create your intended private GitHub repository and add it as a remote. No remote, push, or deployment has been performed.
