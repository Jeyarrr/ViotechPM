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

## Transactions, approvals, expenses, and reports

Pending the following checkpoints. No financial or workflow functionality is claimed complete yet.
