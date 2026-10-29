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
- No known checkpoint 3.1 blockers. Checkpoint is ready for commit and push before starting 3.2.

## 3.2 — Transactions and approvals

Next: draft/revision lifecycle, immutable multi-stage decisions, reviewer assignment/configuration, self-approval denial, and concurrency tests. Initial policy will require two independent reviewers (project review then Super Admin final review), with explicit Super Admin configuration. Submission must reject unavailable/self reviewers rather than bypass review. Each resubmission will preserve prior workflow snapshots and decisions.

## 3.3 — Budgets and expenses

Pending. Includes controlled unique posting, decimal-safe summaries, overrun prevention, immutable reversal history, and financial UI/tests.

## 3.4 — Reporting and integration

Pending. Includes authorized audit viewer, filtered CSV exports with formula protection, dashboard additions, responsive acceptance, documentation, final tests, and report.
