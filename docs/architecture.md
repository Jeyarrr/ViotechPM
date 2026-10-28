# Architecture and API

## Structure

```text
client/
  public/assets/        Original official logos
  src/components/       ui primitives, shared feedback/branding, app layout
  src/pages/            Login, overview, profile, future modules, not-found
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
  src/routes/           Auth route definitions and sign-in rate limiting
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
- Bootstrap credentials are environment-only. Repeating bootstrap preserves existing user password, status, department, and role. No account administration HTTP endpoints are exposed in Phase 1.
- Existing role/dept data is real foundation data. Authentication audit events are real events. Project-related dashboard data remains empty until its modules exist.

## Endpoints

Success responses use `{ "data": ... }`. Failures use `{ "error": { "code": "...", "message": "..." } }`. Validation errors additionally contain safe `fields` entries.

| Method | Path                 | Access          | Result                                                                  |
| ------ | -------------------- | --------------- | ----------------------------------------------------------------------- |
| GET    | `/api/health`        | Public          | Database readiness, 200 or 503                                          |
| GET    | `/api/auth/csrf`     | Public          | Current session CSRF token                                              |
| POST   | `/api/auth/login`    | Origin + CSRF   | Sign in; 200, 401, 403, 422, or 429                                     |
| POST   | `/api/auth/logout`   | Origin + CSRF   | Destroy session; idempotent for an anonymous session with a valid token |
| GET    | `/api/auth/me`       | Authenticated   | Public user, role, department, permissions                              |
| GET    | `/api/dashboard`     | `overview:read` | Typed zero metrics and empty collections                                |
| GET    | `/api/system/access` | `system:manage` | System foundation permission boundary                                   |

Other endpoints return 404. Missing sessions receive 401; authenticated users without permission receive 403.

## Role boundaries

| Role                  | Phase 1                                       | Future navigation visibility                        |
| --------------------- | --------------------------------------------- | --------------------------------------------------- |
| Super Admin           | Overview, own profile, system-access endpoint | All modules                                         |
| Project Manager       | Overview, own profile                         | Project/task/milestone, management, analytics/audit |
| Developer             | Overview, own profile                         | Projects, own tasks, milestones                     |
| IT Support Technician | Overview, own profile                         | Projects, own tasks, milestones                     |
| Employee              | Overview, own profile                         | Own tasks                                           |

Future links reveal no business data or CRUD operations. The role map defines broad capabilities only; Phase 2 must add project membership and object-level authorization before project APIs are introduced. Unknown roles receive no permissions.

## UI and future data

React Query manages the session and dashboard requests. Protected routes wait for server session resolution, including on a refresh. API 401 responses clear the current user cache. Network errors have explicit retry states. React Hook Form and Zod validate login; Radix provides keyboard/focus handling for dropdowns and the mobile dialog. Motion respects reduced-motion preferences. Fonts are self-hosted through the build.

`OverviewData` describes all five metrics and each future chart/list collection. Budget plotting uses Recharts only when records exist; the initial display is an explicitly labeled empty chart scale. Future navigation includes polished unavailable states. Profile is read-only and shows actual account data. Source UI primitives follow shadcn conventions and are configured in `client/components.json` for subsequent additions.

The frontend build is suitable for static hosting after configuring SPA route rewrites and the API origin. No hosting has been provisioned.
