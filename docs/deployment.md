# Deployment guide: private testing

Status (November 2, 2026): the user-authorized free test deployment is live at https://viotechpm.vercel.app with the Render backend at https://viotechpm-api.onrender.com and the existing Neon database. Hosted browser login, dashboard reload, API sessions and disabled documents passed. See [the deployment record](RENDER_FREE_TEST.md) for exact resources and verification. The user selected documents disabled and the existing test administrator login. This internet-reachable test configuration does not establish network-private or full production readiness. The remaining sections describe the stricter full-production requirements and broader acceptance checks, not blockers to the explicitly selected test mode.

## Required decisions before deployment

Vercel repository access is granted. Complete Render/Neon account connections and grant only the repository access needed for the existing Jeyarrr/ViotechPM repository. Choose an isolated Neon branch and securely enter provider-issued connection strings. Approve durable private storage and a scheduling plan. Choose an access restriction mechanism and frontend/API domain arrangement, then verify actual browser authentication before admitting testers. App login is not equivalent to network-private hosting; the default Render web-service URL is internet reachable. Configure approved network/access controls separately, or leave the service unprovisioned.

## Neon

Follow [database-production.md](database-production.md): confirm target/data, recovery point and pending SQL; apply `npm run db:migrate` explicitly; provision a unique strong administrator with [security.md](security.md). Use pooled runtime and direct migration/LISTEN connections. Never seed production or import local company records automatically.

## Render backend

Repository root must be the monorepo root, not server/. Node 24. Build: `npm ci --include=dev && npm run build -w server`. Start: `npm run start -w server`. The service binds 0.0.0.0 and the provider PORT. Health path: `/api/ready`. Automatic deployment is disabled in render.yaml. No migration/seed is run by build/start.

The Blueprint is deliberately gated with PRODUCTION_READY_ACK=false and missing secret/storage values. Its free plan does not satisfy the durable-local storage requirement, so it is not a working full-feature deployment. Do not override storage validation merely to make it start. After explicit approval, select a suitable persistent-disk plan and mount, or implement/test an approved private object-storage adapter. No disk or paid plan is silently provisioned by this file.

Set backend variables using [environment.md](environment.md). Production startup refuses known default administrator credentials. Only enable the acknowledgment after target, administrator, storage and access restrictions have been reviewed. Verify `/api/health` and `/api/ready` over HTTPS and inspect redacted logs.

Render free services can sleep after 15 minutes without inbound HTTP/WebSocket traffic and lose local filesystem changes on restart/redeploy/spin-down. They cannot guarantee continuous reminders or durable uploads. Keep REMINDERS_ENABLED=false until continuous execution is approved. [Provider limitations](https://render.com/docs/free), [service configuration](https://render.com/docs/web-services), [Blueprint fields](https://render.com/docs/blueprint-spec).

## Vercel frontend

Import the existing repository using the repository root. vercel.json selects Vite, installs the workspace with `npm ci --include=dev`, runs `npm run build -w client`, and serves client/dist. Git-triggered deployment is disabled; manually deploy only verified commits. Configure deployment protection appropriate to the approved account/plan before deployment; no paid protection is assumed.

Set VITE_API_URL to the actual approved HTTPS backend origin without /api or trailing slash. Vercel builds reject missing/non-HTTPS/local API origins. Only public build settings belong here. SPA rewrites support nested routes; asset requests retain their actual paths. Validate refresh on /projects, /tasks and /profile. [Vercel configuration](https://vercel.com/docs/project-configuration).

## Authentication, sockets and reminders

Prefer HTTPS app/api subdomains of the same owned domain with COOKIE_SAME_SITE=lax. Default provider domains are cross-site; none requires HTTPS and still cannot bypass browser third-party-cookie blocking. Keep exact-origin CORS, credentialed requests, secure HttpOnly host-only cookies and CSRF. Do not replace sessions with localStorage tokens. VITE_API_URL also selects the Socket.IO endpoint; direct authenticated WSS goes to Render.

The PostgreSQL listener uses a direct connection. REST/database records remain authoritative. Reconnection refreshes cached data; missed transient hints are not a durable event queue. Run one backend instance unless shared limits/storage and multi-instance tests are implemented. Reminders use the existing in-process scheduler, transaction advisory lock and persistent unique dedupe keys. They run only while the process is alive. UTC timestamps and Asia/Manila business dates are preserved.

## Hosted acceptance checklist (all pending)

- Approved restricted access, HTTPS and actual frontend/backend URLs recorded.
- Health/readiness and correct isolated database verified; no local data uploaded.
- Unique administrator login; default credentials rejected; session survives refresh and is revoked on logout/password change/deactivation.
- Cookie/CORS/CSRF and role/resource isolation verified on actual desktop/mobile browsers.
- Essential client/project/task/milestone/transaction/approval/expense CRUD and reporting pass.
- Notifications/comments update a second browser; WSS reconnects after interruption without duplicate persisted notifications.
- Reminder delivery and restart deduplication verified on the approved scheduling plan.
- Private file upload/download, unauthorized access rejection and persistence across restart/redeploy verified.
- Nested route refresh, no localhost runtime calls, loading/error states and logs checked.
- Backup/restore drill and application rollback verified with an isolated target.

Keep deployment and production verification marked incomplete until these checks run on actual hosted resources. Repository configuration and local test success do not establish hosted availability.
