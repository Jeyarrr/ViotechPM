# Phase 5 progress

## Scope and preservation

2026-10-31: private testing selected by the user. No Vercel/Render/Neon projects, custom domain or approved private storage exist yet. Complete independent preparation; live deployment and hosted verification remain blocked. No paid resources or company-data export authorized.

Starting main: a5443a6, clean tree and synchronized remote. Prior delivery CI 40918710538 succeeded. Read README and prior phase reports, inspected runtime/session/permissions, Prisma/migrations, realtime, reminders, storage, frontend API and CI. Protected-file and 21-business-table snapshot recorded privately. Thirteen existing migrations; no resets or local record changes.

## Existing problems and production blockers (before implementation)

- Server binds 127.0.0.1, unsuitable for Render public listener.
- Development username alias is development-only, but the actual database administrator password is weak and can authenticate using its email unless production adds a password guard.
- No explicit production provisioning/rotation workflow or startup credential audit.
- Production cookie uses SameSite=Lax. Default vercel.app/onrender.com domains are cross-site; hosted authentication must be tested, preferably using same-site custom subdomains.
- PostgreSQL LISTEN currently uses runtime URL. Neon transaction pooling cannot preserve its listener session; separate direct listener URL required.
- Uploads rely on local disk; Render free filesystems are ephemeral. No durable private storage approved. Full document deployment is blocked.
- Reminder scheduler needs running Node process; sleeping free hosting cannot guarantee deadline delivery.
- Startup/shutdown, request correlation, readiness and frontend timeouts need improvement.
- Analytics loads grouped completions and project rows; benchmark and reduce avoidable repeated work before adding indexes.
- CI omits PostgreSQL integration/browser checks.
- Known pg queued-query deprecation and Vite socket teardown warnings need honest reporting.

## Baseline

Fresh backend run: 94/94 passed, seven files, 58.53 seconds. Full 40-case browser baseline is running before application changes. Production dependency audit: zero reported vulnerabilities. Current dependency versions recorded in ignored audit output; no automatic major upgrades.

## Checkpoints

1. 5.1 audit/security: in progress; no application changes yet.
2. 5.2 database/performance: pending.
3. 5.3 deployment configuration: pending.
4. 5.4 actual deployment: blocked on account connections, target provisioning, secure secrets and approved durable storage/domain arrangement.
5. 5.5 final QA/docs: pending; hosted verification cannot be claimed without actual deployments.

## References checked

- https://neon.com/docs/guides/prisma
- https://neon.com/docs/connect/connection-pooling
- https://render.com/docs/free
- https://render.com/docs/web-services
- https://render.com/docs/websocket
- https://render.com/docs/blueprint-spec
- https://vercel.com/docs/routing/rewrites

Provider requirements checked against official documentation; do not invent connection strings or hosted URLs.

## Checkpoint 5.1 implementation (2026-11-01)

Added production password-policy enforcement, database-backed default-credential rejection, administrator startup audit, explicit target-confirmed provisioning/rotation, a production seed refusal, secure configurable SameSite cookies, direct listener connection selection and fail-closed production environment validation. My profile now offers current-password-verified password changes with persisted-session revocation. Local credentials, data and branding remain preserved.

Fresh baseline: 94/94 backend and 40/40 browser cases (12.8 minutes). Security implementation: 102/102 backend tests, TypeScript, lint and formatting passed. Dedicated password browser checks and builds are being completed before the checkpoint commit. The existing pg queued-query deprecation and Vite websocket teardown warnings are recorded; neither caused baseline failures.

Checkpoint 5.1 verification complete: 102 backend tests passed; all four new password browser cases passed; frontend/backend builds, types, lint and formatting passed. Security-checkpoint client entry bundle: 493.38 kB raw / 159.05 kB gzip.

Preservation review: protected .env, login source, design tokens and all logo assets match their original SHA-256 hashes. Nineteen of 21 business tables match the earlier snapshot exactly. The local users/audit_logs tables differ by a successful login recorded at 2026-10-31 18:58:52 UTC (before this resumed verification), which updated last_login_at/updated_at and added one audit entry. No attempt was made to roll back legitimate authentication activity. Thirteen migrations are applied; all database constraints are validated; all three money columns remain NUMERIC(16,2). No business data was exported or reset.

## Checkpoint 5.2 verified (2026-11-01)

Prisma schema validation and migration status passed: 13 applied migrations, no pending schema changes. Production database guide records pooled runtime/direct CLI and LISTEN requirements, safe migration, backup/restore and rollback procedures. No Neon database exists yet and no migration/export was performed against hosting.

Socket.IO now loads after authentication with cancellation-safe cleanup. Client entry bundle decreased from 493.38 kB / 159.05 kB gzip to 451.65 kB / 145.98 kB gzip (8.46% raw, 8.22% gzip); the deferred socket chunk is 41.78 kB. This measures bundle transfer, not hosted latency. Reminder reads are batched in 100-project pages; the 50-project regression uses four model reads rather than 151, preserving per-project active-recipient scope. Existing reminder deduplication tests still pass. Empty local project tables cannot establish representative large-data query latency; EXPLAIN used the existing project index and no speculative indexes were added.

Verification: 103/103 backend tests; eight collaboration/workspace browser cases across four viewports; both builds, TypeScript and lint passed. Formatting initially flagged the new performance test, which was reformatted and rechecked successfully. Large-scale analytics/load benchmarking remains a pre-company-rollout task.
