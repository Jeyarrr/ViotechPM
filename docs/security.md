# Security and administrator operations

## Environments

The existing local database and development login are preserved. Production never accepts the development username alias and rejects passwords failing the production policy, even when their hashes exist in PostgreSQL. No password fallback is used: login still verifies Argon2id against the database.

Production requires HTTPS frontend origin, a random session secret of at least 48 characters, remote TLS database URLs, a direct listener/migration connection, explicit durable private storage and PRODUCTION_READY_ACK=true. The acknowledgment is an operator checklist confirmation, not a substitute for hosted testing. Never copy local .env into a hosting service.

The startup credential audit requires an active administrator with Argon2id hashing and rejects recognized default administrator passwords. Hashes cannot reveal arbitrary password strength; login enforces the password policy and newly provisioned credentials must satisfy it. Before deploying imported accounts, rotate credentials deliberately. Local accounts are never rotated by production setup.

## Password policy and self-service

Use a unique generated password or long passphrase, 16-128 characters, avoiding common/repetitive values and placeholders. The minimum policy cannot prove uniqueness or absence from every breach list. The authenticated POST /api/auth/password requires currentPassword and newPassword, CSRF and exact Origin. It only changes the current account, verifies the current password under a row lock, rejects reuse and deletes all that user's persisted sessions in the same transaction. Other accounts and roles cannot be supplied in the request. Socket authorization revalidation rejects revoked sessions.

My Profile provides password change using existing UI components. After success sign in again on every device. This changes a password only when the user explicitly submits the form; startup does not alter accounts.

## Initial production administrator / controlled rotation

First confirm the intended private Neon branch/database, apply reviewed migrations, and take a recovery snapshot if it already has data. Production seeding is disabled. Provisioning is a separate operator command, never a build/start hook.

Use provider secret entry or a secure local process environment, not command arguments or committed files:

- NODE_ENV=production
- DIRECT_DATABASE_URL: exact provider-provided direct TLS connection
- PROVISION_TARGET_HOST: exact hostname from that connection
- PROVISION_TARGET_DATABASE: exact database name
- PROVISION_ACTION=create (new account) or rotate (existing active Super Admin)
- PROVISION_ADMIN_NAME, PROVISION_ADMIN_EMAIL
- PROVISION_ADMIN_PASSWORD: strong unique secret, 16-128 characters

Run npm run admin:provision -w server from the repository root. The command deliberately does not load .env. It rejects local, mismatched, pooled and non-TLS targets. Create refuses to overwrite an existing account. Rotate preserves ID, name, role and account status; it revokes sessions and records a credential-free audit event. It does not reactivate disabled users. Remove provisioning secrets immediately afterward. Neither passwords nor full connection strings are printed.

## Authorization and session boundaries

All existing permissions stay in place. Super Admin manages users; project managers are limited by project management/membership; employees cannot self-promote. Existing independent approval and financial ownership checks remain authoritative on the server. Document access and notifications are scoped to current user/project/task permissions. Password changes are current-user-only.

Cookies remain HttpOnly, eight-hour absolute lifetime, host-only (no Domain), and Secure in production. COOKIE_SAME_SITE defaults to lax for same-site frontend/backend subdomains. none is an explicit HTTPS-only option for cross-site testing and may still fail when a browser blocks third-party cookies. Test actual hosted URLs before enabling access. Do not disable CSRF, broaden CORS to wildcard or store session tokens in localStorage.

TRUST_PROXY=1 is only appropriate when the application is reachable through the approved single trusted proxy path; do not expose a bypass path. Login attempts are rate limited, user status is checked on protected requests, session IDs rotate after login, and logout invalidates the store record.

## Release gates

- Review current dependency audit and CI results.
- Confirm backend routes require authentication and applicable resource permission.
- Confirm no real secrets or private uploads are tracked by Git or included in Vite variables.
- Configure dedicated production session secret and role-appropriate database credentials.
- Provision/rotate administrator, then remove provisioning secrets.
- Confirm durable private storage and restore procedure.
- Verify real HTTPS login, refresh, logout, disabled-user revocation, nested routes and sockets.
- Enable private access only after these checks; never publish company data as demo data.
