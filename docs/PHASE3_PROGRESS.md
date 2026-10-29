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
- Committed and pushed as `a58e645`; GitHub CI passed. Approval alone does not count as spending.

## 3.3 — Budgets and expenses

Completed and verified on 2026-10-29.

- Applied additive migrations `20261029000400_expenses` and `20261029000500_expense_reason_guard`. Reused the existing Project budget. Expense posting has a unique transaction link; signed posting/reversal constraints preserve financial history.
- Implemented controlled approved-snapshot posting, project-level serialization, exact decimal summaries, budget overrun and allocation-reduction protection, and Super Admin reversals with required reason. Original expenses cannot be edited, deleted, or reposted.
- Added Budget & Expenses with project/client/date/category/archive/search filters, lifetime versus filtered totals, project breakdown, real charts, controlled posting and reversals; linked financial panels in project and transaction details.
- All 63 backend tests passed, including eight financial integrity cases. Eight expense/transaction browser cases passed across all four viewports. TypeScript, ESLint, formatting, full builds, migration deployment and preservation checks passed. Desktop financial screenshot reviewed; existing dependency notices are non-blocking. Committed and pushed as `a6904e5`; GitHub CI passed.

## 3.4 — Reporting and integration

Completed and verified on 2026-10-29.

- Applied additive migration `20261029000600_audit_project_scope`: nullable indexed project link and canonical backfill; existing audit values remain unchanged.
- Added read-only scoped audit viewer, actor/action/project/Manila-date filters and details, sensitive-event restrictions, and recursive credential-key redaction.
- Added three paginated reports and full-filter CSV exports using operational scope builders, explicit 10,000-row bound and formula protection. Added reports screen and CSV buttons on operational directories.
- Added live approval/milestone/financial metrics, charts and widgets to the existing dashboard, preserving original sections and metric contracts. Financial data is restricted to actual management scope, and allocation sums use Decimal before presentation conversion.
- All 78 backend tests and all 32 final browser cases passed. TypeScript, ESLint, formatting, frontend/backend builds, nine-migration status, schema comparison, and preservation checks passed. Desktop audit and mobile reports screenshots reviewed. Initial final-browser startup encountered a stopped local database; safely restarting the existing cluster resolved it and the full rerun passed.
- Final checkpoint is published with this report through a normal main-branch commit/push; see the repository history. No known Phase 3 blocker. Full details and remaining out-of-scope work are in [PHASE3_REPORT.md](PHASE3_REPORT.md).
