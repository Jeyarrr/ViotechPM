# Environment configuration

Keep existing local `server/.env` unchanged. `npm run dev` starts API and frontend; start local PostgreSQL with `npm run db:local:start` first when needed. `npm run server` starts only the API. Use `server/.env.example` for a new developer installation.

## Separate staging/private testing

Use separate provider projects, a separate Neon branch/database, private storage and a fresh session secret. Do not reuse local credentials or upload real company data. Vercel receives only the public API origin. Backend secret values go directly into Render's secret settings. The environment must stay restricted until hosted verification is complete.

| Variable              | Location                    | Requirement                                                                    |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| NODE_ENV              | Backend                     | production                                                                     |
| PORT                  | Backend                     | Provider assigned; default 4000 locally                                        |
| HOST                  | Backend                     | 0.0.0.0 on Render; 127.0.0.1 locally                                           |
| CLIENT_ORIGIN         | Backend                     | Exact approved HTTPS frontend origin, no trailing slash                        |
| DATABASE_URL          | Backend secret              | Neon-issued pooled runtime URL, TLS required                                   |
| DIRECT_DATABASE_URL   | Backend/admin secret        | Same Neon database, direct endpoint, TLS required                              |
| REALTIME_DATABASE_URL | Backend secret              | Optional direct listener override; defaults to DIRECT_DATABASE_URL             |
| SESSION_SECRET        | Backend secret              | Fresh cryptographically random value, at least 48 characters                   |
| TRUST_PROXY           | Backend                     | 1 only behind the approved single trusted proxy path                           |
| COOKIE_SAME_SITE      | Backend                     | lax for same-site subdomains; none only for explicitly tested cross-site HTTPS |
| PRODUCTION_READY_ACK  | Backend                     | true only after security, target, storage and access review                    |
| UPLOAD_STORAGE        | Backend                     | durable-local requires an approved persistent private disk                     |
| UPLOAD_DIRECTORY      | Backend                     | Absolute path inside that private disk mount; never a public directory         |
| UPLOAD_MAX_BYTES      | Backend                     | Default 10485760; maximum 52428800                                             |
| REMINDERS_ENABLED     | Backend                     | false until always-running scheduling is approved and verified                 |
| REMINDER_INTERVAL_MS  | Backend                     | Default 300000; range 60000 to 86400000                                        |
| REMINDER_DAYS         | Backend                     | Default 3,1,0; each 0 to 90                                                    |
| REMINDER_OVERDUE_DAYS | Backend                     | Default 1; range 1 to 90                                                       |
| VITE_API_URL          | Vercel public build setting | Actual HTTPS backend origin, no /api suffix; shared by HTTP and Socket.IO      |
| VITE_PROXY_TARGET     | Local development only      | Local Vite API/socket proxy target; not a production API setting               |

Provisioning-only variables and the target confirmation procedure are in [security.md](security.md). Remove provisioning credentials after use. Never configure BOOTSTRAP_ADMIN_PASSWORD in production. Never put database/session/provisioning secrets in variables prefixed VITE_. Rebuild the frontend when changing VITE_API_URL.

A host-only secure cookie remains scoped to the API host. CORS must match the actual frontend origin exactly, requests must include credentials, and CSRF remains enabled. Same-site app/api custom subdomains are preferred. Default provider domains are cross-site; SameSite=None alone does not override browser third-party-cookie restrictions. Verify the selected architecture on actual desktop/mobile browsers.
