# Verification

## Backend integration and configuration

```powershell
npm run db:local:start
npm run db:generate
npm test
```

Tests require a real PostgreSQL `TEST_DATABASE_URL`. They refuse the application URL and any test database whose name does not end in `_test`. They apply the actual committed migration to the test database before exercising Express through Supertest, with the real PostgreSQL session store and Argon2 verification. They create temporary test accounts only in the test database and remove those account rows afterward. Anonymous failure audits and session rows can remain in the test database and expire normally; they are never inserted into the application database.

The original 42 core checks cover:

- Readiness/connection, migrations, role/department bootstrap, Argon2id hashing, repeatable seed without password reset.
- Required environment validation without value leakage, production HTTPS requirement, least-privilege mapping for all roles and unknown-role denial.
- Unauthenticated requests, valid sign-in, normalized email, wrong password, unknown/inactive account, malformed fields, and absence of public registration.
- HttpOnly/SameSite cookies, Secure production cookie behind a trusted TLS proxy, no hash exposure, session rotation, refresh persistence, expiry and absolute lifetime enforcement, and logout invalidation.
- Missing/forged/non-ASCII CSRF tokens, absent/untrusted origins, CORS restrictions, malformed JSON/content types, and rate limiting.
- Real backend role denial/allowance, role/status changes on existing sessions, audit/last-login writes, and actual zero/empty dashboard data.
- Client and project CRUD, duplicates, strict validation, partial updates, search/filter/page, category configuration, scoped URL denial, and archive/restore preservation.
- Employee creation/hash privacy, profile edits, role escalation denial, last-active-admin concurrent protection, deactivation/session revocation, and safe handoff requirements.
- Member assignment/removal/uniqueness, active eligibility, task validation/CRUD/status/completion/reopening, per-role task visibility, reassignment, archive history, and real progress.
- Authorized dashboard totals, budgets, statuses, activity, workload, deadlines and own tasks; aggregate refresh after changes and archive exclusion; absence of fabricated expenses.
- Concurrent member removal versus assignment, plus task and authenticated-session persistence across an API restart.

## Browser acceptance

```powershell
npx playwright install chromium
npm run db:seed
npm run test:e2e
```

Playwright starts isolated real frontend/API instances on 5174/4001 against `TEST_DATABASE_URL` and tests desktop Chromium (1440×1000), laptop (1280×800), tablet (820×1180), and a mobile Pixel 7 viewport. It reads bootstrap credentials from ignored `server/.env` and bootstraps them only in the test database, without embedding them in source. Existing dev servers are never reused by the test launcher. Traces are disabled so credentials are not captured in trace artifacts. Run backend and browser suites sequentially: both use the same test database.

Coverage: protected route redirect, original logo loading, show/hide password, sign-in, real dashboard/no sample data, horizontal overflow, page-refresh persistence, desktop sidebar collapse/expand, mobile drawer selection/close, future module state, profile, account dropdown, sign-out, redirect after logout, and unexpected browser/API errors. Blank login and signed-in dashboard screenshots are saved under ignored `.local/screenshots` for visual review.

The original 16 browser cases also cover client create/validation/edit/detail/archive/restore, project creation/date errors/budgets/details/edit/archive/restore, employee creation/edit/deactivation, project team assignment, task creation/list/status/Kanban/archive, completion progress, and dashboard refresh after a UI mutation. Browser fixtures are archived or deactivated in the test database, retaining their audit history. Backend fixtures are deleted only from the isolated test database after each suite. No fixtures are inserted into the application database.

## Static and build checks

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run build
npm audit
```

Build checks cover both the compiled Express entry point and Vite production assets. Browser tests use development servers; production TLS and deployment are intentionally outside Phase 1. No claim is made for untested browsers, load levels, or production hosting.

## Phase 3 verification

The full backend suite currently contains 78 tests across five files. Additional coverage includes milestone/task/project completion consistency, responsibility and membership boundaries, lifecycle validation, immutable submission snapshots, independent multi-stage approval, self-review denial, rejection/return/resubmission, duplicate/concurrent decisions, reviewer reassignment and account handoff safeguards.

Financial tests exercise exact 0.10 + 0.20 arithmetic, approved-only controlled posting, duplicate posting races, competing allocation overruns, budget reduction guards, immutable reversals, original-row preservation, missing/zero allocations, scope and date/category/archive filters, database sign/reference/reason checks, and rollback/audit integrity. Reporting tests cover three matching list/export scopes, formula/quote/newline handling, explicit export bounds, audit privacy/read-only behavior and live dashboard refresh through approval, posting, milestones and reversal.

The complete browser suite has eight scenarios at four viewports (32 cases). Phase 3 adds milestone CRUD/task links/progress, transaction revision/two-stage approval/rejection/cancellation, expense posting/overrun/reversal, and report CSV/audit details/live dashboard scenarios. Each uses the real isolated PostgreSQL API, refreshes persisted state, and checks layout overflow/browser errors. Final execution results are recorded in PHASE3_REPORT.md; fixture accounts/data never enter the application database.

Export safety unit tests also run in GitHub Actions without database access. No new palette, logo or login changes are required; a local preservation comparison checks their original hashes along with the environment, account credentials and original core columns. Existing upstream Zod build-annotation and node-postgres concurrent-query deprecation notices are non-blocking. Production TLS, other browsers, load testing, PDF and Phase 4 features remain outside this verification.
