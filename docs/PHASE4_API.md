# Phase 4 API and deployment notes

## Session and realtime security

Socket.IO shares the existing PostgreSQL session middleware. The WebSocket handshake requires an allowed Origin, the authenticated session cookie and its current CSRF token. Identity and roles come from the database. Project/task subscriptions accept only a UUID and resource kind, are limited to ten resource rooms, and require existing resource authorization. Sessions and rooms are revalidated before delivery, on subscription and every 30 seconds. Logout, expiry and inactive accounts lose socket access. REST reads always revalidate authorization.

PostgreSQL triggers publish only IDs with `NOTIFY`, delivered after commit. Notification rows are inserted inside the business transaction. Events contain cache-invalidation hints, never audit metadata or financial values. Reconnect refetches authoritative API records; notification history survives missed events. The LISTEN connection retries interruptions every five seconds. Multi-instance operation requires each API instance to retain its own direct PostgreSQL LISTEN connection. Transaction-pooling proxies cannot replace that connection.

## Notifications

- `GET /api/notifications`: page, pageSize (max 50), unread, type.
- `GET /api/notifications/unread-count`.
- `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`: empty JSON body and CSRF token.

Only the recipient can read or change rows. Current project/task/transaction scope also applies, so revoked memberships cannot reveal historical restricted notifications. Unique `(recipient_id, dedupe_key)` prevents duplicate delivery records for the same event. Assignment and workflow events exclude the actor. Completion emits one task completion notification rather than a duplicate status notification.

## Task discussions and project activity

- `GET/POST /api/tasks/:id/comments`.
- `PATCH/DELETE /api/tasks/:id/comments/:commentId`.
- `GET /api/tasks/:id/mention-options`.
- `GET /api/projects/:id/activities`: page, pageSize, type, actorId, dateFrom, dateTo.

Comments require current task access; ordinary employees can only access their assigned tasks. Archived projects/tasks are read-only. Content is plain text, 1–4,000 characters, rendered as text by React. Authors can edit/delete for 24 hours; project management can moderate deletion at any time. Soft-deleted content is retained for history but omitted from API results. Mentions are explicit eligible project user IDs, fixed when creating the comment; changing text does not resend mentions. At most 20 mentions and 30 comment writes/minute per IP.

Timeline records come from the existing AuditLog. Presentation excludes metadata, authentication/denied events and unauthorized task/transaction records. Date filters represent inclusive Asia/Manila calendar dates; timestamps remain UTC in PostgreSQL.

## Private documents

- `GET /api/projects/:id/documents`: page, pageSize, optional taskId.
- `POST /api/projects/:id/documents`: `application/octet-stream`, URI-encoded `X-File-Name`, optional taskId query parameter, authenticated cookie, Origin and `X-CSRF-Token`.
- `GET /api/documents/:id/download`.
- `DELETE /api/documents/:id`: archive, empty JSON body.

Current project members/management can upload; task attachments additionally require task access. Only the uploader or project management can archive. Each download is reauthorized and returned as an attachment with nosniff/sandbox headers. Archived files and files in archived projects/tasks cannot be downloaded. Project/task composite foreign keys prevent cross-project attachment metadata.

Supported formats: PDF, PNG, JPEG, WebP, UTF-8 TXT and CSV. Binary formats are inspected for identifying signatures; PDF requires an EOF marker. Extension and client MIME alone are not trusted. Executables, HTML, SVG, archives and Office documents are not supported in this phase. Path components/control characters in filenames are rejected. Size defaults to 10 MiB, configurable by `UPLOAD_MAX_BYTES` (maximum 50 MiB). Ten uploads/minute per IP. Upload progress uses XMLHttpRequest.

The `PrivateStorage` interface supports a future private object-storage adapter. Local files use generated UUID keys under `UPLOAD_DIRECTORY`, defaulting to `../.local/uploads` relative to the server working directory. The directory is not statically served and is ignored by Git. File metadata and SHA-256 are stored in PostgreSQL; bytes are not. Failed writes do not commit metadata; failed metadata transactions attempt cleanup. A process crash between file writing and metadata commit can leave an orphan file: future operations should reconcile object keys against metadata before removing orphans. Archived bytes are retained; no irreversible file deletion endpoint is exposed.

Signature checks are **not antivirus scanning** or full format validation. No malware scanning service is configured. Production needs private persistent storage, backup/retention policy, a scanner/quarantine pipeline and a least-privileged storage identity. Do not use a Vercel frontend filesystem for files. No cloud provider or paid service has been provisioned.

## Deadline automation

The persistent Node backend runs the scheduler at startup and every five minutes, outside browser timers. It is disabled for test mode and when `REMINDERS_ENABLED=false`. Settings:

| Variable              | Default | Purpose                                           |
| --------------------- | ------- | ------------------------------------------------- |
| REMINDER_DAYS         | 3,1,0   | Calendar days before due date                     |
| REMINDER_OVERDUE_DAYS | 1       | Interval in days, beginning the first overdue day |
| REMINDER_INTERVAL_MS  | 300000  | Backend scheduler interval, minimum one minute    |

The business day is Asia/Manila. Existing date-only due dates are compared as calendar dates; notification timestamps are UTC. Task/milestone assignees and project managers are notified only while active and authorized. Completed work, archived tasks/milestones and completed/cancelled/archived parent projects are excluded. Project target dates are monitored too.

A PostgreSQL advisory transaction lock prevents concurrent scheduler runs. Notification dedupe keys include entity, due date, recipient and business day. Failed transactions retry on the next tick; restarts cannot duplicate a committed reminder. A due-date change produces a new delivery key. Missed historical thresholds are not replayed in bulk; the next run evaluates the current day and current overdue interval. Due/overdue indicators are also shown in tasks, milestones and project details.

Production requires a continuously running Node process (or a separately deployed worker using the same service). A serverless frontend alone cannot host Socket.IO or this scheduler. Configure process supervision, database connectivity, persistent storage and monitoring in Phase 5.

## Advanced analytics

Authenticated users with analytics:read (Super Admin and Project Manager) can use GET /api/analytics, /api/analytics/projects, /tasks, /milestones, /workload and /project-health. The full endpoint returns the consistent summary; suffix endpoints return the corresponding section.

Filters: projectId, status (project), taskStatus, dateFrom, dateTo, page and pageSize (maximum 100). Project scope requires management or explicit membership. Financial scope additionally requires ownership as manager or Super Admin. Archived records are excluded. Empty scopes return zero totals and empty lists.

Dates filter project target dates and task/milestone due dates. Completion trends use completedAt in Asia/Manila, defaulting to the last 30 days. Financial totals use lifetime posted expenses and reversals for the selected projects, reusing Phase 3 decimal calculations. Budget proximity means utilization >=80%. Workload excludes unassigned tasks and is descriptive, not a performance rating. Results use a repeatable-read transaction.

The existing Analytics page retains report tabs and adds project/status/date filters, cards, charts and paginated workload/financial summaries. Dashboard health cards are lazy loaded. Events batch affected query prefixes at 250 ms and skip data refreshed after the event; initial connection does not duplicate mount queries. Reconnect and successful local mutations refresh analytics. Chart animation is disabled. No periodic frontend polling is added.

Scale boundary: summary aggregation currently reads authorized project IDs and grouped workload/completion data before paginating output. Phase 5 should benchmark realistic large datasets and move daily aggregation/paging further into SQL if needed; no large-scale throughput claim is made.
