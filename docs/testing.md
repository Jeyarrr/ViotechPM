# Verification

## Backend integration and configuration

```powershell
npm run db:local:start
npm run db:generate
npm test
```

Tests require a real PostgreSQL `TEST_DATABASE_URL`. They refuse the application URL and any test database whose name does not end in `_test`. They apply the actual committed migration to the test database before exercising Express through Supertest, with the real PostgreSQL session store and Argon2 verification. They create temporary test accounts only in the test database and remove those account rows afterward. Anonymous failure audits and session rows can remain in the test database and expire normally; they are never inserted into the application database.

The 23 automated checks cover:

- Readiness/connection, migrations, role/department bootstrap, Argon2id hashing, repeatable seed without password reset.
- Required environment validation without value leakage, production HTTPS requirement, least-privilege mapping for all roles and unknown-role denial.
- Unauthenticated requests, valid sign-in, normalized email, wrong password, unknown/inactive account, malformed fields, and absence of public registration.
- HttpOnly/SameSite cookies, Secure production cookie behind a trusted TLS proxy, no hash exposure, session rotation, refresh persistence, expiry and absolute lifetime enforcement, and logout invalidation.
- Missing/forged/non-ASCII CSRF tokens, absent/untrusted origins, CORS restrictions, malformed JSON/content types, and rate limiting.
- Real backend role denial/allowance, role/status changes on existing sessions, audit/last-login writes, and actual zero/empty dashboard data.

## Browser acceptance

```powershell
npx playwright install chromium
npm run db:seed
npm run test:e2e
```

Playwright starts the real frontend/API if needed and tests desktop Chromium (1440×1000), laptop (1280×800), tablet (820×1180), and a mobile Pixel 7 viewport. It reads the seeded bootstrap credentials from the ignored `server/.env`, without embedding them in test source. Run against your local development administrator, not a production account. Traces are disabled so credentials are not captured in trace artifacts.

Coverage: protected route redirect, original logo loading, show/hide password, sign-in, real dashboard/no sample data, horizontal overflow, page-refresh persistence, desktop sidebar collapse/expand, mobile drawer selection/close, future module state, profile, account dropdown, sign-out, redirect after logout, and unexpected browser/API errors. Blank login and signed-in dashboard screenshots are saved under ignored `.local/screenshots` for visual review.

## Static and build checks

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run build
npm audit
```

Build checks cover both the compiled Express entry point and Vite production assets. Browser tests use development servers; production TLS and deployment are intentionally outside Phase 1. No claim is made for untested browsers, load levels, or production hosting.
