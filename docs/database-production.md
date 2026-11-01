# Database production operations

## Compatibility and connection separation

Prisma 7.10.1 uses `@prisma/adapter-pg`. Keep the existing PostgreSQL adapter; a Neon-specific SDK is unnecessary. Configure the provider-issued pooled URL as DATABASE_URL and direct URL as DIRECT_DATABASE_URL. Prisma CLI reads the direct URL in `server/prisma.config.ts`. Socket.IO's PostgreSQL LISTEN connection uses REALTIME_DATABASE_URL, falling back to DIRECT_DATABASE_URL. All must point to the same database/branch. Never construct credentials manually.

Neon's transaction pool does not support LISTEN; use its direct endpoint for the event listener. Runtime currently permits up to 10 ORM connections, 10 session connections and one listener per process, plus migration/admin connections. Budget capacity before adding replicas. Current release is operated as one backend instance: process-local rate limiters require a shared limiter before scaling.

References: [Neon Prisma guide](https://neon.com/docs/guides/prisma), [pooling restrictions](https://neon.com/docs/connect/connection-pooling).

## Schema and integrity

Existing migrations remain authoritative. Monetary amounts use PostgreSQL NUMERIC(16,2), with decimal-safe application calculations. Foreign keys and unique keys protect relationships and identifiers. Approval, expense and membership operations retain transactions and row locks. No extra PostgreSQL extension is required by the current migration SQL. Existing task/project/status, assignee/deadline, approval, financial, audit and notification indexes are retained. Do not add redundant indexes without representative EXPLAIN evidence.

The local application database is preserved. Tests use only a separate database whose name ends in `_test`. Local empty business tables are not a representative production load benchmark.

## Reviewed migration procedure

1. Create or identify an isolated private-testing Neon branch. Confirm owner, region, endpoint, branch and database in the dashboard. Inspect existing records before changing it.
2. Store provider-issued URLs in the administrative shell's environment; do not paste credentials into chat, source, command arguments or logs. Never copy local `.env` to a hosted environment.
3. Review every pending `server/prisma/migrations/*/migration.sql`. Arrange a verified recovery point before applying changes.
4. From repository root, run `npm ci`, `npm run db:generate`, then `npm exec -w server prisma -- migrate status`. Confirm the reported target privately.
5. Run `npm run db:migrate` (Prisma migrate deploy). Do not run migrate reset or development seed on production. Migration is an explicit release operation, never a web-server startup side effect.
6. Recheck migration status and schema, foreign keys, monetary precision and expected record counts. Provision the initial administrator using the security guide.
7. Record migration names, release commit and recovery point without secrets. Deploy only the corresponding verified application revision.

## Backup, restore and rollback

Use Neon recovery/branch facilities available on the approved plan, and an encrypted off-host PostgreSQL custom-format backup where required. Verify current provider retention before relying on it. For CLI backups, use a protected libpq service/password configuration or temporary PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE/PGSSLMODE environment, sourced securely. Do not put connection strings/passwords in command arguments. Use a direct endpoint and a PostgreSQL client compatible with the server.

With these environment values configured, `pg_dump --format=custom --file=<protected-backup-path>` writes the selected database. Restrict access and encrypt the destination. Never commit or attach a backup. Remove temporary credentials afterward.

Restore into a newly created, explicitly confirmed isolated database using `pg_restore --exit-on-error --no-owner --no-acl --dbname=<confirmed-isolated-database> <protected-backup-path>`. Never use `--clean` against a live database. Verify migrations, counts, foreign keys, administrator access and document references before any planned cutover. Test recovery before calling a hosted environment operational. Database backups do not include uploaded file bytes: back up private storage consistently too.

Application rollback uses a previous verified commit. Do not automatically reverse migrations or delete new columns/data. If compatibility prevents an application rollback, restore to an isolated branch and plan a reviewed cutover. No live backup, restore or Neon migration has been executed during this preparation.

## Data transfer

No local company data is authorized for export. Private testing starts with isolated fictional data and separately provisioned credentials. Any later transfer needs explicit source/target approval, protected backup, identifier preservation, deduplication and relationship/count verification.
