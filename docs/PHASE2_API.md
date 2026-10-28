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

- `GET /api/projects`, `GET /api/projects/:id`: Super Admin sees all records; other roles see managed projects or projects with an explicit membership. Unknown or unauthorized IDs return the same 404 response.
- `POST /api/projects`, `PATCH /api/projects/:id`, `DELETE /api/projects/:id`, `POST /api/projects/:id/restore`: Super Admin or the assigned Project Manager. Project Managers may create projects only with themselves as manager; only Super Admin may hand management to another eligible account.
- Lists accept the standard search/page/direction/archive parameters plus `clientId`, `managerId`, `categoryId`, `priority`, and `status`. Sort fields: `name`, `code`, `createdAt`, `updatedAt`, `targetDate`, `budget`.
- Project codes are normalized uppercase and unique even after archive. Money is stored in `DECIMAL(16,2)` and transferred as decimal strings. Input permits up to 12 integer digits and two fractional digits; negative, over-precision, and exponential values are rejected. The centralized frontend formatter displays Philippine pesos with cents.
- Start and target dates are validated calendar dates. Target must be on/after start. Actual completion is server-controlled; clients cannot supply it. Completion rules are documented below.
- New client relationships require active, unarchived clients. New manager assignments require active Super Admin or Project Manager accounts. Existing relationships remain readable if a client is later archived. Project archive/restore never deletes historical associations.
- Transactional mutations lock the project; new client/manager/category references receive shared row locks while eligibility is checked. Project changes and status changes are audited atomically.

## Lookup and category endpoints

- `GET /api/lookups/:kind` supplies paginated options for `clients`, `managers`, `departments`, `categories`, `roles`, `employees`, `assignees`, or `projects`. It supports `q`, `page`, and `pageSize` (maximum 100). Forms traverse pages without silently truncating the option directory. Assignees are limited to members of authorized projects (Employee sees only self).
- Client/manager/employee selection is restricted to project administrators; role selection and `includeInactive=true` require Super Admin. Project options are scoped to authorized projects. Responses select only the public fields needed by each selector.
- `POST /api/project-categories` and `PATCH /api/project-categories/:id` require Super Admin and audit changes. The UI supports create, rename, and activation/deactivation. Existing projects retain inactive categories; new assignments require active categories. Categories are never destructively deleted.

## Employees, memberships, and tasks — checkpoint 2.3

| Action                                                     | Super Admin | Project Manager                             | Developer / IT Support | Employee                              |
| ---------------------------------------------------------- | ----------- | ------------------------------------------- | ---------------------- | ------------------------------------- |
| Employee directory and details                             | All         | Public directory; project references scoped | No                     | No                                    |
| Create/edit employee, role/department, activate/deactivate | Yes         | No                                          | No                     | No                                    |
| Read project and membership                                | All         | Managed or member projects                  | Member projects        | Member projects                       |
| Assign/remove member, full task CRUD                       | All         | Managed projects only                       | No                     | No                                    |
| Read tasks                                                 | All         | Authorized projects                         | Member projects        | Own assigned tasks in member projects |
| Change task status                                         | All         | Managed projects or own assigned task       | Own assigned task      | Own assigned task                     |

- `GET /api/employees`, `GET /api/employees/:id`; `POST /api/employees`; `PATCH /api/employees/:id`; `PATCH /api/employees/:id/status`. Existing Users/Roles/Departments are reused. Directory supports `q`, `status`, `roleId`, `departmentId`, `sort=name|email|createdAt`, direction, and pagination.
- Account creation requires a 14–128-character initial password and uses the existing Argon2id options. Passwords and hashes are never returned or audited. Profile editing does not accept password or hash fields. Emails are normalized lowercase and unique.
- Administrator changes are serialized with a transaction-scoped advisory lock. The actor is rechecked inside the transaction and the last active Super Admin cannot be demoted or deactivated. Non-admin role changes are always forbidden. Deactivation deletes that user's sessions; existing per-request active-user lookup also denies access immediately. Open projects must receive another manager, and current unfinished tasks must be reassigned/unassigned, before deactivation. Role changes that would make an open project's manager ineligible require handoff first.
- `GET /api/projects/:id/members` supports search and pagination; `POST` accepts `userId` and a responsibility label `role`; `DELETE /api/projects/:id/members/:userId` removes the relationship while retaining its audit history. New members must be active. A unique project/user constraint prevents duplicate assignments.
- Managers automatically become members, including an additive migration backfill for existing projects. Handoff adds the new manager and retains the old manager as a regular member. Change manager before removing the manager's membership. Remove/reassign all unfinished current task responsibilities before removing another member; completed and archived task history retains its assignee.
- `GET /api/tasks`, `GET /api/tasks/:id`, `POST /api/tasks`, `PATCH /api/tasks/:id`, `PATCH /api/tasks/:id/status`, `DELETE /api/tasks/:id`. List supports `q`, `projectId`, `assigneeId`, `priority`, `status`, `mine`, `deadline=overdue|upcoming`, `archived`, pagination, `sort=title|code|createdAt|updatedAt|dueDate`, and direction. `mine=true` restricts to the signed-in employee. Upcoming means today through seven days ahead; overdue is before today. Calendar boundaries use Asia/Manila. Archived projects are excluded from task lists; historical task detail remains available within authorized scope.
- Task code is unique and normalized uppercase. Due date must be on/after start; task dates may extend beyond project estimates. Project assignment is immutable after creation. The assignee must be an active project member, or null. A completed historical task may retain a former/inactive member until reopening, which requires an eligible assignee or unassignment first.
- Status-only requests reject unrelated fields. Regular employees cannot edit titles, assignments, dates, priorities, or archive tasks. Task status and permission flags are confirmed by the backend; the UI only announces success after the transaction completes. Kanban provides persisted status selectors and explicitly paginates the displayed cards.
- All task and membership changes lock the project before checking eligibility, so member removal, project completion, and task changes are serialized. Relevant task changes, reassignments, status transitions, completions, archives, and membership changes have atomic audit entries.

### Completion and archive rules

Progress is completed non-archived tasks / all non-archived tasks × 100, rounded to the nearest whole percent; zero tasks means 0%. Project completion requires at least one current task and every current task completed. Completion is an explicit manager/admin action; 100% task progress alone does not change project status. The server records the actual completion calendar date in Asia/Manila.

Task completion timestamps are set by the server, preserved on edits while completed, and cleared when reopened. Adding/reopening unfinished work in a completed project automatically changes the project to Active and clears actual completion, with an audit event. Archiving its last current task also reopens it, preserving the rule that a completed project cannot have zero tasks. Cancelled and On Hold projects permit task cleanup and edits without automatically changing those project statuses. Archived projects block task/team edits until restored.

Client, project, and task archive operations retain records, foreign keys, and audits. Project restoration restores access to retained memberships and tasks; it does not unarchive individually archived tasks. Task archive is final in this phase (no task restore endpoint was requested).
