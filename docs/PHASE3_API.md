# Phase 3 API and business rules

Existing authenticated sessions, per-request active-user checks, strict Zod validation, JSON envelopes, CSRF/origin checks, and project scopes apply to every Phase 3 endpoint. Unknown/inaccessible record IDs return the same 404. Mutations and their audit events are atomic.

## Milestones — checkpoint 3.1

- `GET /api/milestones`, `GET /api/milestones/:id`: all five roles, limited to authorized projects. Detail includes up to ten authorized related tasks and twenty milestone audit events.
- `POST /api/milestones`, `DELETE /api/milestones/:id`, `POST /api/milestones/:id/restore`: Super Admin or the assigned Project Manager. Archive preserves task links and history. Archived projects block milestone writes.
- `PATCH /api/milestones/:id`: project management can edit full milestone information. Assigned Developer/IT Support may send **only** a status field. Employee has read access only. Project association and completion timestamp are server controlled.
- List filters: `q`, `projectId`, `responsibleId`, `status`, `priority`, `overdue=true|false`, `archived`, `page`, `pageSize` (maximum 100), `sort=title|dueDate|startDate|displayOrder|createdAt|updatedAt`, `direction`.
- Statuses: Not Started, In Progress, In Review, Completed, Delayed. Overdue is separately derived from the Asia/Manila calendar date and unfinished status; ordinary reads never modify status or timestamps.
- Due must be on/after start. Display order is a non-negative integer. New responsibility assignments require active project members. Unfinished milestone responsibility blocks membership removal and account deactivation until reassigned/unassigned.
- All current linked tasks are required. A milestone with unfinished current linked tasks cannot be completed. Empty milestones can be completed manually by management. Completion timestamps survive ordinary completed edits and clear on reopening.
- Progress is completed/current linked tasks, or 100% for a manually completed empty milestone, otherwise 0%. Task assignment or reopening that introduces unfinished linked work automatically reopens a completed milestone, with audit history. Task archiving/unlinking does not auto-complete milestones.
- Current unfinished milestones block project completion. Adding/reopening/restoring unfinished milestone work reopens a completed project and clears actual completion. The Phase 2 task completion requirements remain in force; milestones do not replace task-based project progress.
- Restore retains historical responsibility and links. If linked work changed while archived, a restored completed milestone is reconciled to In Progress before returning it. Management can reassign historical responsibility after restoration.
- Tasks accept optional `milestoneId` on create/edit; null unlinks. Existing tasks remain valid and unlinked. `GET /api/tasks?milestoneId=...` filters within existing task scope. A composite foreign key and backend checks prevent cross-project links. New links require current milestones; existing archived links remain readable.

## Transactions and approvals — checkpoint 3.2

- `GET /api/transactions`, `GET /api/transactions/:id`, `GET /api/transactions/:id/history`: Super Admin sees all; Project Manager sees managed-project records and personal requests; other roles see personal requests only. Personal history remains readable after membership removal. Same-department affiliation never grants access to another project's requests.
- `POST /api/transactions`: all existing roles may create personal requests in a current authorized project. The server assigns the unique reference, requester, PHP currency, Draft status, and department from the project or requester's account. Those identity/workflow fields cannot be supplied or changed by clients.
- `PATCH /api/transactions/:id`: requester only, Draft or Returned for Revision only, with current project access. Project association is immutable. Requested amount is a positive decimal string, up to twelve integer digits and two decimal places; no exponent, negative, zero, or over-precision input. Persisted amounts are `DECIMAL(16,2)`.
- `POST /api/transactions/:id/submit`: requester only, eligible Draft/Returned request, current project access, project not archived. Each submission creates a fresh workflow attempt with the exact request snapshot and independently assigned stages. Earlier decisions and snapshots remain unchanged after revision.
- `POST /api/transactions/:id/cancel`: reason required. Requesters can cancel Draft, Submitted, Under Review, or Returned requests; Super Admin may also cancel an Approved unposted request. Rejected/Cancelled are final. Cancellation preserves workflow decisions and cancels undecided stages. Expense posting/reversal safeguards are integrated in checkpoint 3.3.
- List accepts `q`, `projectId`, `typeId`, `requesterId`, `departmentId`, `status`, inclusive `dateFrom`/`dateTo`, page/pageSize (maximum 100), direction, and `sort=reference|title|transactionDate|requestedAmount|createdAt|updatedAt`. Filters always intersect the access scope. History is independently paginated.
- Configurable request types start with Equipment Purchase, Software Purchase, Project Expense, Service Expense, Reimbursement, and Other. `GET /api/lookups/transaction-types` supplies options. `POST /api/transaction-types` and `PATCH /api/transaction-types/:id` require Super Admin. Inactivation preserves existing references; new assignments require active types.

### Review configuration and lifecycle

Default review requires **two independent reviewers**: the current project manager (or an eligible independent Super Admin fallback), followed by a distinct active Super Admin. The requester cannot occupy either stage. If eligible independent reviewers are unavailable, submission fails with configuration guidance; no review is silently bypassed.

`GET /api/projects/:id/approval-policy` is restricted to project management. `PATCH` requires Super Admin and can configure primary/final reviewers or explicitly select a single project-review stage. Primary reviewers must be the current project manager or a Super Admin; final reviewers must be Super Admin. Policy changes are audited and affect future submissions only. Single-stage policy still forbids self-review.

- `GET /api/approvals`, `GET /api/approvals/pending`, `GET /api/approvals/:id`: existing approval roles, within transaction/project scope. IDs refer to transactions. Queue filters include q, project, transaction status, `mine=true|false`, sort, direction, and pagination. Future waiting stages are excluded from the pending queue until activated.
- `POST /api/approvals/:id/approve`, `/reject`, `/return`: only the assigned currently eligible reviewer for the active stage. Approve accepts optional comment; reject/return require at least three trimmed characters. No requester may review their own request. A completed decision cannot be replaced or repeated.
- Primary approval advances to the next configured stage and Under Review. Only successful completion of all required stages sets Approved and approval timestamp. Reject ends the attempt and records Rejected; Return ends the attempt and permits requester revision/resubmission. Ordinary reads do not advance workflow.
- `POST /api/approvals/:id/reassign`: Super Admin, with stepId, eligible independent approverId, and reason. Only Pending/Waiting stages can be reassigned; reviewers remain distinct. Completed decisions are never reassigned or edited. Reassign pending project reviews to a Super Admin before handing management to another employee. Pending assignments block account deactivation/role changes until safely reassigned.
- Review actions lock the project and transaction in a consistent order. Unique workflow/sequence, workflow/reviewer, and decision/step constraints plus locks prevent duplicate or conflicting decisions. Request snapshots and decisions have no update/delete endpoints. Rejected self/unauthorized review attempts produce safe audit events outside the rolled-back mutation.

## Expenses and reports

Pending checkpoints 3.3/3.4. Approval alone does not yet post spending; expense functionality is not claimed complete at checkpoint 3.2.
