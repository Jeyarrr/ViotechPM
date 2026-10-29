# Phase 4 progress

## Current checkpoint

Checkpoints 4.1 and 4.2 implemented and verified; checkpoint 4.3 next. Phase 4 is not complete.

## Preserved starting state

- Branch `main`, local and remote HEAD `89f1e11`; latest GitHub CI succeeded.
- Nine existing Prisma migrations applied; application database schema up to date.
- Preserve uncommitted user-requested fullscreen login/workspace, centered sidebar logo, sidebar controls, local admin login alias, loopback origin support, README and server command alias.
- Preserve current administrator identity and password, database records, environment, logo, login design and theme.
- Existing audit service, project/task/financial scopes, session store, CRUD components and Recharts are reusable. No existing Socket.IO/notification implementation found.

## Baseline verification

- Initial backend run: 77 passed, one outdated CORS expectation failed after the user's local-origin fix. Updated to expect no allow-origin header for an untrusted origin.
- Browser selectors updated for the user-requested `Email or username` label. Baseline reruns: 78 backend tests and desktop sign-in/browser regression passed.

## Checkpoints

1. 4.1: persistent notifications, authenticated Socket.IO and notification UI — pending.
2. 4.2: scoped audit timeline, task discussion and mentions — pending.
3. 4.3: private document storage and deduplicated Manila deadline scheduler — pending.
4. 4.4: operational analytics, integration, regression and final report — pending.

## Verification and delivery policy

Use isolated `viotechpm_test` for tests. Apply additive migrations only. Record actual results and commit/push each verified checkpoint without rewriting history. Do not deploy. Production requires a persistent Node service for sockets and scheduling, plus private persistent file storage.

## Checkpoint 4.1 verification (2026-10-30)

- Added Notification model; additive migration 20261029000700_notifications applied to both databases. Existing tables/data retained.
- Existing session middleware shared with Socket.IO. Exact allowed origin plus CSRF handshake, fixed session lifetime, current active identity, authorized project/task rooms, room revalidation and account revocation.
- PostgreSQL NOTIFY delivers ID-only hints after commit; notifications remain in PostgreSQL across reconnects. Listener retries database interruptions.
- Assignment/task/milestone/transaction/approval notifications are created atomically from the existing audit integration; unique recipient/event keys prevent retry duplicates. Current scopes apply on reads, counts and delivery.
- GET /api/notifications, GET /unread-count, PATCH /:id/read and PATCH /read-all; paginated filters and own-record access.
- Added notification bell/dropdown, /notifications and linked /tasks/:id details. Scoped query invalidation is batched at 250 ms.
- 84 backend tests passed (78 regression + six notification/socket authorization cases). Four responsive notification checks passed. Four responsive login/navigation/logout regressions passed after resolving same-origin polling Origin omission by using WebSocket transport.
- Final types, lint and formatting passed. Both builds passed; the subsequent small task detail route also passed type/lint checks.
- Development Vite occasionally reports ECONNABORTED during page reload/socket teardown; browser regressions pass without console errors. No production deployment.
- WebSocket-capable persistent Node hosting and direct PostgreSQL LISTEN connectivity are required. API records remain authoritative if realtime delivery is interrupted.
- Reference: https://socket.io/how-to/use-with-express-session

## Checkpoint 4.2 verification (2026-10-30)

- TaskComment and TaskCommentMention added by 20261030000100_task_comments; both databases migrated without resets.
- GET/POST /api/tasks/:id/comments; PATCH/DELETE /:commentId; GET /mention-options. Existing task scope is mandatory. Authors edit/delete within 24 hours; project managers/admins may moderate deletes. Deleted content stays in the database but is hidden from API responses. Mentions are explicit eligible user IDs, fixed at creation and deduplicated.
- Project activity uses existing AuditLog records with safe presentation, scoped task/transaction links, actor/type/Manila-date filters and server pagination; GET /api/projects/:id/activities. No metadata or financial details in public project timeline payloads.
- Task detail page and task modal have discussions. Project Details has the activity timeline. Socket invalidation refreshes authorized discussion viewers after commit.
- 31 focused backend tests passed (core CRUD plus eight collaboration/security cases); four browser cases passed across all viewports, including two-viewer realtime updates, edits, refresh persistence and timeline filtering. Types/lint/format passed.
- Checkpoint 4.1 commit: 40a8c75; push succeeded and GitHub CI run 40910081233 passed.
