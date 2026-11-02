# Local demo accounts and verification

The original local administrator was inspected before provisioning: Lawrence Arvin Violan, `admin@viotech.local`, role `super_admin`, ID `43e3c9cb-0d68-4de4-a64e-7d0fec7d6daf`. The existing local login was verified. Its ID, name, role and password hash were preserved. No administrator was recreated or renamed.

`npm run db:demo:local` builds the backend and provisions four fictional users in the existing local PostgreSQL database. It requires development mode, the exact loopback database and port, and PostgreSQL's loopback-only listener setting. It does not load Neon configuration. The transaction locks provisioning, rejects an existing email belonging to another record, and never updates an existing demo password. It creates a fictional client, project, milestone, four tasks, memberships and a two-stage approval policy. Repeated provisioning retains existing records and changes made during testing.

The username column in README is a human label for the four additional accounts: their accepted login identifier is their full email. Only the existing local administrator has an admin alias. Credentials for that administrator are in the ignored `.local/demo-credentials.md`.

Run `node scripts/verify-demo-local.mjs` after provisioning. This intentionally exercises only the fictional local fixture and leaves its comments, notifications, task progress and approved fictional requests available for inspection. It runs an API on loopback port 4002 and Vite on loopback port 5178, then closes both. Five separate browser contexts verify independent concurrent sessions, dashboard reload, administrative restrictions, permitted status changes, manager reassignment, realtime discussion, activity timeline, denied self-approval, manager approval and final administrator approval.

The full backend suite uses the separate `_test` database. Existing tests cover resource isolation, roles, documents, notifications, sockets, comments and approval concurrency. No existing migrations, logo, colors, login design or database architecture are changed.

Hosted authentication now enforces the production password policy even in hosted test mode. It denies the local demo identities and rejects existing sessions authenticated with the local-only administrator password. This intentionally disables the previously approved weak hosted login without resetting its password or changing associated records. A new hosted password has not been generated.
