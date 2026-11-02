# Free Render test deployment

Current policy: the user explicitly authorized enabling all five README demo accounts on the live test site. `HOSTED_TEST_MODE=true` allows those test logins, including the preserved administrator alias. The local-only restriction recorded below was superseded by that authorization. Normal production mode still enforces the stricter policy. All four additional accounts were provisioned without replacing the original administrator.

## Account policy update — November 2, 2026

The subsequent local multi-user requirements supersede the original weak hosted-login exception described below. Production authentication now rejects weak passwords and the four documented local demo identities even with `HOSTED_TEST_MODE=true`. Previously issued hosted sessions for the local administrator password are denied on subsequent authorization checks, including Socket.IO checks. The administrator's database record, password hash and relationships remain intact. Restoring hosted administrator access requires a separately authorized strong password rotation; local access remains unchanged. No demo users or fictional project data are provisioned in Neon. The original deployment checks below describe the earlier deployment, not the current password policy.

The user selected free Render hosting, disabled documents, and retained the existing admin/admin test login. This configuration is for a disposable demonstration database with no company records. A Render web service has a public endpoint; this configuration does not make it network-private.

Use the repository root, Node 24, branch main, Singapore region and Free compute.

Build: `npm ci --include=dev && npm run build -w server`

Start: `npm run start -w server`

Health check: `/api/ready`

Set the existing database/session variables from the ignored `.local/render-import.env`, and these explicit options:

```dotenv
DOCUMENTS_ENABLED=false
HOSTED_TEST_MODE=true
TEST_ADMIN_EMAIL=admin@viotech.local
```

`TEST_ADMIN_EMAIL` must match the actual existing administrator email. It maps the username admin to that account; it does not seed, reset or create accounts. The generated local import file uses the configured account's actual email. No new password is generated. Secure cookies, HTTPS, CSRF/origin validation, role checks, rate limits and PostgreSQL sessions remain active. Without HOSTED_TEST_MODE, the normal production password restrictions still apply. Local development defaults are unchanged.

With documents disabled, the backend does not initialize document storage or run its readiness probe. All document paths return 503 DOCUMENTS_DISABLED after authentication; the frontend shows a disabled message and does not offer file controls. Existing document records and files are not removed.

Keep `REMINDERS_ENABLED=false` because free hosting can sleep. Set `CLIENT_ORIGIN` to the actual Vercel frontend HTTPS origin, with no trailing slash. For separate Vercel/Render provider domains use `COOKIE_SAME_SITE=none`; browser third-party cookie restrictions may still affect login and must be checked on the hosted app. Set `TRUST_PROXY=1` for Render's HTTPS proxy. Set `PRODUCTION_READY_ACK=true` only when the actual origin and required variables have been set.

Deployed and verified on November 2, 2026 (Asia/Manila):

- Frontend: https://viotechpm.vercel.app (Vercel deployment `dpl_CE6VrGcz8q6ftC3FK8V9YX4Jsgvw`, READY).
- Backend: https://viotechpm-api.onrender.com (Render service `srv-dbjn3i142hec73dh94ng`, Free, Singapore; deploy `dep-dbjn3ip42hec73dh96u0`, live).
- Deployed application commit: `ded3aa890f69aaba0ccd5fa981da7022e30c2d25`.
- Render build successful; Vercel build completed with Vite reporting `built in 9.81s`.
- Live health reports database connected; readiness reports ready.
- Live admin/admin login returns Lawrence Arvin Violan. Exact-origin CORS, secure session, disabled documents and logout session revocation passed.
- Chromium browser test against the actual Vercel URL passed login, dashboard rendering and authenticated reload using Render and Neon.

The canonical frontend is reachable without Vercel authentication; application login is required. This is an internet-reachable test deployment, not network-private hosting. Documents and scheduled reminders remain disabled. Render's Free service can sleep when idle. The MCP creation interface did not expose a health-check-path setting; `/api/ready` was verified directly, while Render uses its default service check. Full business-workflow, multi-browser and recovery acceptance checks remain separate from this deployment smoke test.
