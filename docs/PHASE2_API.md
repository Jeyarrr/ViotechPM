# Phase 2 API and authorization

All endpoints retain the existing authenticated PostgreSQL session, active-account lookup, and CSRF/origin protections. Responses use `{ data }` or `{ error: { code, message, fields? } }`. Validation errors return 422; duplicate codes or state conflicts return 409; unauthorized roles return 403. IDs are UUIDs.

## Clients — checkpoint 2.1

| Endpoint                        | Access                       | Behavior                                                |
| ------------------------------- | ---------------------------- | ------------------------------------------------------- |
| `GET /api/clients`              | Super Admin, Project Manager | Search, filters, stable sorting, pagination             |
| `GET /api/clients/:id`          | Super Admin, Project Manager | Current or archived client details                      |
| `POST /api/clients`             | Super Admin                  | Validated create with unique normalized code            |
| `PATCH /api/clients/:id`        | Super Admin                  | Partial update; archived records must be restored first |
| `DELETE /api/clients/:id`       | Super Admin                  | Archive only; no destructive deletion                   |
| `POST /api/clients/:id/restore` | Super Admin                  | Restore without replacing the record or history         |

Client directory access is organization-wide for Super Admins and Project Managers. Employee, Developer, and IT Support roles cannot browse clients or access client detail URLs. Project Managers may select existing clients for their authorized projects; client master-data maintenance is reserved for Super Admins.

List query parameters: `q`, `status=ACTIVE|INACTIVE`, `archived=false|true`, `sort=name|code|createdAt|updatedAt`, `direction=asc|desc`, `page` (default 1), `pageSize` (default 20, maximum 100). Pagination returns `{ items, total, page, pageSize, pages }`. Archived records are excluded by default. Codes are uppercase and remain reserved after archiving.

Create/update/archive/restore and audit writes run in the same transaction. Updates and archive transitions lock the target row. Database foreign keys use restrictive deletion for the creator. Subsequent project migrations will preserve client references during archiving.

## Browser test isolation

`npm run test:e2e` starts an API on port 4001 and frontend on port 5174. The launcher requires a distinct `TEST_DATABASE_URL` ending in `_test`, applies migrations, and bootstraps the configured administrator only in that test database. It never changes `.env` or resets a database. Browser fixtures retain their audit history and are archived in the test database. The normal application remains on ports 4000/5173.
