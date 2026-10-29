# Phase 3 progress

## Baseline — 2026-10-29

- Existing Phase 1/2 architecture, permissions, CRUD services, schema/migrations, tests, UI tokens, and reports inspected. No unfinished Phase 2 feature blocks Phase 3.
- Clean `main` tracks `origin/main` at `bd69759`; private repository `Jeyarrr/ViotechPM`. Four existing migrations are deployed. No user changes were present.
- Reuse existing sessions, Argon2id, active-user authorization, CSRF/origin protection, project scopes, audit log, decimal budgets, shared CRUD dialogs, and crimson/black tokens. Preserve login, logo, environment, records, and migration history.
- Additive migrations only; isolated `_test` fixtures only. Checkpoint commits will be pushed after successful applicable checks; no history rewriting.

## 3.1 — Milestone management

Completed and verified on 2026-10-29.

- Applied additive migration `20261029000200_milestones` to application and isolated test databases. Added Milestone and nullable Task milestone link; composite foreign key prevents cross-project links. Existing tasks and records remain intact.
- Implemented six milestone CRUD/detail/archive/restore endpoints, server-side search/filter/order/page, responsible-member validation, derived overdue indicator, completion timestamps, actual progress, and atomic audit events.
- Management can maintain milestones; assigned Developer/IT Support can update status only. Empty milestones require manager/admin manual completion. Unfinished linked work blocks completion and safely reopens completed milestones/projects. Responsibility blocks unsafe member removal/deactivation.
- Added responsive milestone directory/details/editor, project milestone panel, task milestone selector/filter, related-task navigation, and status controls using unchanged tokens/components.
- Verification: 46 backend tests passed; all 20 browser cases passed across four viewports (including existing Phase 1/2 flows). Typecheck, lint, formatting, full build, and original-record/environment/login/logo/palette preservation comparison passed. Desktop screenshot reviewed. Existing upstream build/deprecation notices remain non-blocking.
- Committed and pushed as `42bc232`; GitHub CI passed. No known checkpoint 3.1 blockers.

## 3.2 — Transactions and approvals

Completed and verified on 2026-10-29.

- Applied additive migration `20261029000300_transactions_approvals` to the application and isolated test databases. Added configurable request types, ProjectTransaction, ApprovalPolicy, ApprovalWorkflow, ApprovalStep, and ApprovalDecision with restrictive relations, unique reference/stage/decision constraints, positive decimal/PHP checks, and requested default type rows.
- Implemented scoped transaction create/list/details/edit/submit/cancel/history APIs; only requester Draft/Returned records are editable. Server controls reference, identity, department, currency, and status. Each submission preserves its exact snapshot and prior decision attempts.
- Implemented independent reviewer resolution, default two-stage policy, explicit Super Admin configuration, approve/reject/return, required feedback, pending/history queues, safe reassignment, self-approval denial, atomic decisions, duplicate/concurrent decision protection, and pending-account/manager-handoff safeguards.
- Added transaction directory/editor/details/history, approval queue tabs and decision dialogs, request type administration, project approval configuration, and reviewer reassignment, using existing design tokens and controls.
- Verification: all 55 backend tests passed (including Phase 1/2 and milestone tests); eight transaction/auth/navigation browser cases passed across desktop, laptop, tablet, and mobile. Typecheck, lint, formatting, full build, migration status, and original-record/environment/login/logo/palette preservation passed. Desktop screenshot reviewed; no known checkpoint 3.2 blockers.
- Ready for checkpoint commit/push. Expense posting is intentionally pending checkpoint 3.3; approval alone has not been counted as spending.

## 3.3 — Budgets and expenses

Next. Implement controlled unique posting, decimal-safe summaries, overrun prevention, immutable reversal history, and financial UI/tests. Keep the existing Project budget as source of truth. Pending/rejected/approved-unposted requests must not affect expenses. Expense category snapshots should reflect the approved submission; finalized values cannot be edited. Adjustments will use a recorded reversal and a new approved request.

## 3.4 — Reporting and integration

Pending. Includes authorized audit viewer, filtered CSV exports with formula protection, dashboard additions, responsive acceptance, documentation, final tests, and report.
