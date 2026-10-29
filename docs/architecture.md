# Architecture and API

Phase 2 extends this foundation with client, project, employee, membership, task, and dashboard services. The complete current endpoint and object-permission matrix is in [PHASE2_API.md](PHASE2_API.md).

## Structure

```text
client/
  public/assets/        Original official logos
  src/components/       ui primitives, shared feedback/branding, app layout
  src/pages/            Login, overview, clients, projects, team, tasks, profile, future modules
  src/hooks/            Authentication queries and mutations
  src/lib/              Query client and display helpers
  src/services/         Typed HTTP client and error handling
  src/routes/           Protected routes and permission-aware navigation
  src/types/            Public user and future dashboard data contracts
  src/styles/           Tailwind entry, design tokens, responsive styles
server/
  prisma/               Schema, committed migrations, seed entry point
  prisma.config.ts      CLI database URL and migration/seed configuration
  src/config/           Validated environment, database factory, role permissions
  src/controllers/      HTTP response and session lifecycle orchestration
  src/routes/           Auth and authorized core CRUD endpoints
  src/middleware/       Authentication, authorization, CSRF/origin, errors
  src/repositories/     Database selection and user lookup
  src/services/         Authentication, bootstrap, dashboard contract
  src/generated/        Ignored generated Prisma TypeScript
  tests/                Real PostgreSQL integration and config tests
scripts/                Isolated local database setup/start/stop
e2e/                    Desktop and mobile browser acceptance tests
```

The Vite development server proxies `/api` to Express. Browsers use same-origin relative API calls by default and always include cookies. A future separate HTTPS frontend can set `VITE_API_URL`; CORS and `CLIENT_ORIGIN` must match that frontend. Frontend/backend should share a site or use a reverse proxy so SameSite=Lax cookies work. Do not weaken cookies to accommodate arbitrary cross-site deployment.

## Authentication lifecycle

1. The client requests `/api/auth/csrf`. A random synchronizer token is stored in an anonymous PostgreSQL session.
2. Sign-in includes the exact configured Origin, JSON content type, and `X-CSRF-Token`. Both client and server validate email/password. Email is normalized to trimmed lowercase.
3. The server verifies an Argon2id hash. Unknown emails verify a dummy hash to avoid an obvious fast path; unknown, wrong-password, and inactive accounts receive the same response.
4. On success, the anonymous session is destroyed and regenerated with a new ID and CSRF token. The user ID, authentication time, CSRF token, and cookie metadata are in session data. The database records last login and an audit event. The session is saved before returning the public user.
5. Protected requests resolve the current active user and assigned role from PostgreSQL. Permissions are derived server-side; role/account changes take effect on the next request. Password hashes are never selected for public responses.
6. Logout requires Origin and CSRF checks, destroys the server session, clears the cookie, and records an audit event. The client clears all cached user/workspace data.

Sessions have a fixed eight-hour lifetime. There is no remember-me option or public registration. No authentication token is stored in localStorage. Session-store pruning runs every 15 minutes, and expired sessions are rejected even before pruning.

## Security configuration

- `SESSION_SECRET`: required random value, minimum 32 characters; changing it signs out existing sessions.
- Cookie: HttpOnly, SameSite=Lax, path `/`; Secure in production. Development uses HTTP only on loopback.
- Production requires `NODE_ENV=production`, HTTPS `CLIENT_ORIGIN`, TLS termination, and explicit `TRUST_PROXY=1` only if exactly one trusted proxy sits in front of the API. The current development entry point binds to loopback; configure the hosting ingress/listener in the deployment phase.
- Authentication is limited to 10 failed requests per IP per 15 minutes; successful sign-ins do not count. A general API limit is 150 requests per IP per minute. Limits use process memory; use a shared store before multiple API instances.
- Helmet sets security headers, API responses are marked `no-store`, JSON size is limited to 16 KB, mutation origins are allowlisted, and every mutation requires a cryptographically random CSRF token.
- Errors return safe messages and never serialize driver exceptions or environment values. Unexpected errors log a generic event; add centralized redacted telemetry in a later operational phase.
- Password hashing uses Argon2id with 19 MiB memory, two iterations, and parallelism one. Tune upward for deployment hardware after measuring concurrency.
- Bootstrap credentials are environment-only. Repeating bootstrap preserves existing user password, status, department, and role. Phase 2 employee administration requires an active Super Admin and protects the last active administrator.
- Existing roles/departments and audit events are real data. Dashboard reads authorized core records in a repeatable-read transaction; empty workspaces still show actual zero values.

## Endpoints

Success responses use `{ "data": ... }`. Failures use `{ "error": { "code": "...", "message": "..." } }`. Validation errors additionally contain safe `fields` entries.

| Method | Path                 | Access          | Result                                                                   |
| ------ | -------------------- | --------------- | ------------------------------------------------------------------------ |
| GET    | `/api/health`        | Public          | Database readiness, 200 or 503                                           |
| GET    | `/api/auth/csrf`     | Public          | Current session CSRF token                                               |
| POST   | `/api/auth/login`    | Origin + CSRF   | Sign in; 200, 401, 403, 422, or 429                                      |
| POST   | `/api/auth/logout`   | Origin + CSRF   | Destroy session; idempotent for an anonymous session with a valid token  |
| GET    | `/api/auth/me`       | Authenticated   | Public user, role, department, permissions                               |
| GET    | `/api/dashboard`     | `overview:read` | Authorized current-project metrics and related task/activity collections |
| GET    | `/api/system/access` | `system:manage` | System foundation permission boundary                                    |

Core CRUD endpoints are documented in [PHASE2_API.md](PHASE2_API.md). Unknown endpoints return 404. Missing sessions receive 401; authenticated users without permission receive 403. Inaccessible project/task IDs return the same 404 as missing IDs.

## Role boundaries

| Role                  | Phase 1                                       | Future navigation visibility                        |
| --------------------- | --------------------------------------------- | --------------------------------------------------- |
| Super Admin           | Overview, own profile, system-access endpoint | All modules                                         |
| Project Manager       | Overview, own profile                         | Project/task/milestone, management, analytics/audit |
| Developer             | Overview, own profile                         | Projects, own tasks, milestones                     |
| IT Support Technician | Overview, own profile                         | Projects, own tasks, milestones                     |
| Employee              | Overview, own profile                         | Own tasks                                           |

The table above records the Phase 1 foundation. Phase 2 adds assigned-project access for all five roles and object-level authorization through project membership, management, and task assignment. See the core matrix in PHASE2_API.md and the current operational matrix in PHASE3_API.md. Unknown roles receive no permissions. Future links continue to reveal no business data or operations.

## UI and future data

React Query manages the session and dashboard requests. Protected routes wait for server session resolution, including on a refresh. API 401 responses clear the current user cache. Network errors have explicit retry states. React Hook Form and Zod validate login; Radix provides keyboard/focus handling for dropdowns and the mobile dialog. Motion respects reduced-motion preferences. Fonts are self-hosted through the build.

`OverviewData` describes five real metrics, status counts, budgets, activity, deadlines, assigned tasks, and workload. Budget plotting uses Recharts only when records exist; the empty display explicitly labels its illustrative scale. Phase 3 adds actual posted expenses and immutable reversals; the allocation series remains available alongside financial charts. Core mutations invalidate both core queries and the dashboard. Future navigation retains unavailable states. Profile is read-only and shows actual account data. Reusable CRUD dialogs use Radix focus handling, React Hook Form, and Zod; new styles extend the unchanged login tokens.

The frontend build is suitable for static hosting after configuring SPA route rewrites and the API origin. No hosting has been provisioned.

## Phase 3 operations

Milestones extend existing projects and optionally link tasks. Transactions separate requests from spending: each submission stores an immutable snapshot and ordered independent reviewers, and each completed step has one decision. Review mutations lock project then transaction rows and validate the current assigned stage on the server. Expense posting requires the completed approved snapshot, current financial-management scope and sufficient existing budget. A unique transaction link and project serialization prevent duplicate posting and concurrent overruns. Corrections append exact negative ledger entries with reasons; the original record remains intact.

All financial aggregation and arithmetic use PostgreSQL DECIMAL and 40-digit Decimal calculations. JavaScript number conversion is confined to legacy display contracts and chart presentation. The existing dashboard contract is extended with authorized operational data, never fabricated values; ordinary users receive no financial aggregates. Reads use repeatable-read transactions for consistent summaries.

AuditLog remains the single event store. A nullable canonical project link supports indexed manager scopes; sensitive global/authentication/denied events remain Super Admin only. The audit viewer has no mutation endpoints and recursively redacts credential-like metadata keys. Reports reuse module filter/scope builders; bounded CSV downloads preserve the displayed filters and neutralize spreadsheet formulas. See [Phase 3 endpoints and permissions](PHASE3_API.md).
