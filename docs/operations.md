# Operations and recovery

## Start and stop

Local: `npm run db:local:start`, then `npm run dev` at repository root. The existing local account remains available. Production: reviewed migrations first, then `npm run build -w server` and `npm run start -w server`. Hosting builds must install development dependencies because Prisma and TypeScript are build tools. Do not run development seeding in production.

Production startup validates secrets, TLS/direct database connections, storage configuration and administrator credentials. SIGTERM/SIGINT stop reminders, realtime, HTTP and database pools with a bounded shutdown. Do not restart a migration halfway through to bypass a startup error.

## Health and logs

`GET /api/health` checks database connectivity. `GET /api/ready` additionally checks realtime listener availability and draining state. Configure hosting health checks on `/api/ready`. A 503 is a dependency/release issue to investigate, not a reason to disable readiness. Endpoint responses omit connection details.

Production request logs contain generated request ID, method, matched route template, status and duration. They intentionally omit bodies, raw URLs/query strings, cookies, authorization headers, connection strings and database errors. Use `X-Request-ID` from a failed response to correlate a request. Review provider log retention/access and add approved alert delivery before claiming continuous monitoring. No external monitoring service is purchased/configured.

## Troubleshooting

- Login origin rejected: CLIENT_ORIGIN must exactly match the HTTPS frontend origin. Redeploy the backend after configuration changes. Never permit wildcard credentialed CORS.
- Cookie missing: check HTTPS, trusted proxy, SameSite, host-only cookie host and browser third-party-cookie settings. Prefer same-site custom subdomains. Do not weaken CSRF.
- Database unavailable: check provider status, role permissions, TLS, correct Neon branch, pool capacity and migrations. Keep connection values out of tickets/logs.
- Socket disconnected: confirm the actual API URL, HTTPS/WSS support, credentials, CSRF and direct LISTEN endpoint. Notifications remain persisted in PostgreSQL. Reconnect refreshes active data; transient event hints are not a durable queue.
- Reminders delayed: sleeping services cannot schedule while stopped. Review REMINDERS_ENABLED, interval/day settings and the latest persisted reminder records. UTC storage and Manila business dates are retained. Restart runs the current schedule; it does not reconstruct every missed historical notification. Advisory transaction locks and unique dedupe keys prevent duplicate delivery for the same entity/deadline/day.
- File unavailable: verify the private disk mount and database metadata. Ephemeral disks are not supported for production uploads. Do not expose storage as a static directory. File signatures and limits are validated, but no antivirus scanning service is currently integrated.

## Release and rollback

1. Require local checks and CI for the exact release commit.
2. Verify target, recovery point, private access restrictions and storage before reviewed migrations.
3. Deploy backend manually, inspect readiness and redacted logs, then frontend with the actual API origin.
4. Complete the hosted checklist in deployment.md. Keep deployment marked unverified until all applicable checks pass.
5. On application failure, redeploy the previous verified commit on each host. Confirm schema compatibility first; never run destructive reverse migrations automatically.
6. On data/storage failure, restore into an isolated target, verify relationships/counts and file bytes, then plan a controlled cutover. See database-production.md.

## Scale and availability boundaries

The prepared configuration targets one backend process. PostgreSQL triggers broadcast invalidation IDs to each listener, but process-local rate limits and storage topology must be addressed before claiming safe multi-instance operation. Do not enable replicas without a shared rate limiter, shared private storage and multi-instance acceptance tests. The in-process scheduler requires continuous uptime; free service sleep makes continuous reminders unverified/unreliable. Current preparation does not establish an uptime SLA or a completed disaster-recovery drill.
