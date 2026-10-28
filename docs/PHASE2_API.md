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

The isolated frontend proxies `/api` to port 4001. Each browser case receives a distinct simulated client address through that proxy; only the test launcher enables trust of this single hop. This prevents a batch of independent acceptance cases from sharing one rate-limit bucket. Normal application proxy settings and request limits are unchanged. Backend integration tests separately exercise CSRF, allowed origins, and rate limiting.

## Projects — checkpoint 2.2

- `GET /api/projects`, `GET /api/projects/:id`: Super Admin sees all records; Project Manager sees their managed projects. Other roles receive no projects until assigned through the membership module in checkpoint 2.3. Unknown or unauthorized IDs return the same 404 response.
- `POST /api/projects`, `PATCH /api/projects/:id`, `DELETE /api/projects/:id`, `POST /api/projects/:id/restore`: Super Admin or the assigned Project Manager. Project Managers may create projects only with themselves as manager; only Super Admin may hand management to another eligible account.
- Lists accept the standard search/page/direction/archive parameters plus `clientId`, `managerId`, `categoryId`, `priority`, and `status`. Sort fields: `name`, `code`, `createdAt`, `updatedAt`, `targetDate`, `budget`.
- Project codes are normalized uppercase and unique even after archive. Money is stored in `DECIMAL(16,2)` and transferred as decimal strings. Input permits up to 12 integer digits and two fractional digits; negative, over-precision, and exponential values are rejected. The centralized frontend formatter displays Philippine pesos with cents.
- Start and target dates are validated calendar dates. Target must be on/after start. Actual completion is server-controlled; clients cannot supply it. Empty projects cannot be marked Completed. Task-based completion/reopening rules are added with checkpoint 2.3.
- New client relationships require active, unarchived clients. New manager assignments require active Super Admin or Project Manager accounts. Existing relationships remain readable if a client is later archived. Project archive/restore never deletes historical associations.
- Transactional mutations lock the project; new client/manager/category references receive shared row locks while eligibility is checked. Project changes and status changes are audited atomically.

## Lookup and category endpoints

- `GET /api/lookups/:kind` supplies paginated options for `clients`, `managers`, `departments`, `categories`, `roles`, `employees`, or `projects`. It supports `q`, `page`, and `pageSize` (maximum 100). Forms traverse pages without silently truncating the option directory.
- Client/manager/employee selection is restricted to project administrators; role selection and `includeInactive=true` require Super Admin. Project options are scoped to authorized projects. Responses select only the public fields needed by each selector.
- `POST /api/project-categories` and `PATCH /api/project-categories/:id` require Super Admin and audit changes. The UI supports create, rename, and activation/deactivation. Existing projects retain inactive categories; new assignments require active categories. Categories are never destructively deleted.
