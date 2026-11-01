# Free Render test deployment

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

Verification: full build passed; compiled production API tested against Neon with the HTTPS proxy headers, existing admin/admin login, secure HttpOnly cookies, persisted session, feature flag response, disabled document GET/POST and session revocation on logout. This is a local production-mode check, not a claim of a completed Render deployment.
