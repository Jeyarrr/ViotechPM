import { useState } from 'react';
import { TaskDiscussion } from '@/components/collaboration';
import { DeadlineIndicator } from '@/components/deadline-indicator';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Plus, LayoutGrid, List } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCoreMutation, useLookup, queryString } from '@/hooks/use-core';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/shared/feedback';
import {
  RecordDialog,
  RecordTable,
  StatusBadge,
  ConfirmAction,
  Notice,
} from '@/components/shared/crud';
import { TaskEditor } from '@/components/shared/task-editor';
import { taskStatuses, taskLabel } from '@/lib/tasks';
import type { TaskRecord, PageResult } from '@/types/core';

function TaskStatusControl({ task, saved }: { task: TaskRecord; saved: () => void }) {
  const change = useCoreMutation((status: string) =>
    api.patch(`/tasks/${task.id}/status`, { status }),
  );
  return (
    <div>
      <select
        className="input task-status-control"
        aria-label={`Status for ${task.title}`}
        value={task.status}
        disabled={!task.canUpdateStatus || change.isPending}
        onChange={(e) => {
          change.mutate(e.target.value, { onSuccess: saved });
        }}
      >
        {taskStatuses.map((s) => (
          <option key={s} value={s}>
            {taskLabel(s)}
          </option>
        ))}
      </select>
      {change.isError && (
        <p className="field-error" role="alert">
          {change.error.message}
        </p>
      )}
    </div>
  );
}
export function TasksPage() {
  const { data: user } = useAuth();
  const canCreate = !!user?.permissions.includes('projects:write');
  const [search] = useSearchParams();
  const [filters, setFilters] = useState({
    q: '',
    projectId: search.get('projectId') ?? '',
    milestoneId: search.get('milestoneId') ?? '',
    status: '',
    assigneeId: '',
    priority: '',
    deadline: '',
    mine: search.has('projectId') || search.get('view') === 'all' ? 'false' : 'true',
    archived: 'false',
    sort: 'dueDate',
    direction: 'asc',
    page: 1,
    pageSize: 20,
  });
  const [board, setBoard] = useState(false),
    [editing, setEditing] = useState<TaskRecord | 'new' | null>(null),
    [detail, setDetail] = useState<TaskRecord | null>(null),
    [confirm, setConfirm] = useState<TaskRecord | null>(null),
    [notice, setNotice] = useState('');
  const projects = useLookup('projects'),
    assignees = useLookup('assignees');
  const list = useQuery({
    queryKey: ['core', 'tasks', filters],
    queryFn: () => api.get<PageResult<TaskRecord>>(`/tasks?${queryString(filters)}`),
  });
  const archive = useCoreMutation((id: string) => api.delete(`/tasks/${id}`));
  const update = (key: string, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  const actions = (r: TaskRecord) => (
    <div className="row-actions">
      <Button size="sm" variant="ghost" onClick={() => setDetail(r)}>
        View
      </Button>
      {r.canManage && !r.archivedAt && !r.project.archivedAt && (
        <>
          <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
            Edit
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirm(r)}>
            Archive
          </Button>
        </>
      )}
    </div>
  );
  const saved = () => setNotice('Task status saved.');
  return (
    <div className="crud-page">
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">DELIVERY & EXECUTION</div>
          <h1>{filters.mine === 'true' ? 'My tasks' : 'Tasks'}</h1>
          <p>Keep responsibilities, deadlines, and progress connected.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} />
            Add task
          </Button>
        )}
      </div>
      <Notice message={notice} dismiss={() => setNotice('')} />
      {filters.milestoneId && (
        <div className="row-actions">
          <span className="field-hint">Showing tasks linked to the selected milestone.</span>
          <Button size="sm" variant="ghost" onClick={() => update('milestoneId', '')}>
            Clear milestone filter
          </Button>
        </div>
      )}
      <Card>
        <div className="crud-toolbar">
          <input
            className="input crud-search"
            aria-label="Search tasks"
            placeholder="Search title or code…"
            value={filters.q}
            onChange={(e) => update('q', e.target.value)}
          />
          <select
            className="input"
            aria-label="Task ownership"
            value={filters.mine}
            onChange={(e) => update('mine', e.target.value)}
          >
            <option value="true">My assigned tasks</option>
            <option value="false">All authorized tasks</option>
          </select>
          <select
            className="input"
            aria-label="Project filter"
            value={filters.projectId}
            onChange={(e) => update('projectId', e.target.value)}
          >
            <option value="">All projects</option>
            {projects.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Task status filter"
            value={filters.status}
            onChange={(e) => update('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {taskStatuses.map((s) => (
              <option key={s} value={s}>
                {taskLabel(s)}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Task priority filter"
            value={filters.priority}
            onChange={(e) => update('priority', e.target.value)}
          >
            <option value="">All priorities</option>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Assignee filter"
            disabled={filters.mine === 'true'}
            value={filters.assigneeId}
            onChange={(e) => update('assigneeId', e.target.value)}
          >
            <option value="">All assignees</option>
            {assignees.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Deadline filter"
            value={filters.deadline}
            onChange={(e) => update('deadline', e.target.value)}
          >
            <option value="">All deadlines</option>
            <option value="upcoming">Upcoming (7 days)</option>
            <option value="overdue">Overdue</option>
          </select>
          <select
            className="input"
            aria-label="Archived tasks"
            value={filters.archived}
            onChange={(e) => update('archived', e.target.value)}
          >
            <option value="false">Current tasks</option>
            <option value="true">Archived tasks</option>
          </select>
          <select
            className="input"
            aria-label="Task sort order"
            value={filters.direction}
            onChange={(e) => update('direction', e.target.value)}
          >
            <option value="asc">Due: earliest first</option>
            <option value="desc">Due: latest first</option>
          </select>
          <div className="row-actions">
            <Button
              variant={!board ? 'outline' : 'ghost'}
              size="sm"
              aria-pressed={!board}
              onClick={() => setBoard(false)}
            >
              <List size={16} />
              List
            </Button>
            <Button
              variant={board ? 'outline' : 'ghost'}
              size="sm"
              aria-pressed={board}
              onClick={() => setBoard(true)}
            >
              <LayoutGrid size={16} />
              Board
            </Button>
          </div>
        </div>
        {list.isError ? (
          <ErrorState message={list.error.message} retry={() => void list.refetch()} />
        ) : board && !list.isPending ? (
          <>
            <p className="field-hint board-caption">
              {list.data?.total ?? 0} matching tasks · Board shows page {filters.page} of{' '}
              {list.data?.pages ?? 1}.
            </p>
            <div className="kanban-board">
              {taskStatuses.map((s) => (
                <section className="kanban-column" key={s}>
                  <h2>
                    {taskLabel(s)}{' '}
                    <span>{list.data?.items.filter((r) => r.status === s).length ?? 0}</span>
                  </h2>
                  {list.data?.items
                    .filter((r) => r.status === s)
                    .map((r) => (
                      <article className="kanban-task" key={r.id}>
                        <small>{r.code}</small>
                        <h3>{r.title}</h3>
                        <Link to={`/projects/${r.projectId}`} className="record-link">
                          {r.project.name}
                        </Link>
                        <p>
                          {r.assignee?.name ?? 'Unassigned'} · {r.dueDate.slice(0, 10)}
                        </p>
                        <StatusBadge value={r.priority} />
                        <TaskStatusControl task={r} saved={saved} />
                        {actions(r)}
                      </article>
                    ))}
                  {!list.data?.items.some((r) => r.status === s) && (
                    <p className="field-hint">No tasks on this page.</p>
                  )}
                </section>
              ))}
            </div>
            <div className="crud-pagination">
              <Button
                variant="outline"
                disabled={filters.page <= 1}
                onClick={() => setFilters((v) => ({ ...v, page: v.page - 1 }))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={!list.data || filters.page >= list.data.pages}
                onClick={() => setFilters((v) => ({ ...v, page: v.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </>
        ) : (
          <RecordTable
            data={list.data}
            loading={list.isPending}
            onPage={(page) => setFilters((prev) => ({ ...prev, page }))}
            columns={[
              {
                label: 'Task',
                render: (r) => (
                  <div>
                    <strong>{r.title}</strong>
                    <small>{r.code}</small>
                  </div>
                ),
              },
              {
                label: 'Project',
                render: (r) => (
                  <Link className="record-link" to={`/projects/${r.projectId}`}>
                    {r.project.name}
                  </Link>
                ),
              },
              {
                label: 'Milestone',
                render: (r) =>
                  r.milestone ? (
                    <Link className="record-link" to={`/milestones/${r.milestone.id}`}>
                      {r.milestone.title}
                    </Link>
                  ) : (
                    'Not linked'
                  ),
              },
              { label: 'Assignee', render: (r) => r.assignee?.name ?? 'Unassigned' },
              { label: 'Priority', render: (r) => <StatusBadge value={r.priority} /> },
              {
                label: 'Status',
                render: (r) =>
                  r.archivedAt ? (
                    <StatusBadge value="ARCHIVED" />
                  ) : (
                    <TaskStatusControl task={r} saved={saved} />
                  ),
              },
              {
                label: 'Due',
                render: (r) => (
                  <span>
                    {r.dueDate.slice(0, 10)}
                    <DeadlineIndicator
                      dueDate={r.dueDate}
                      status={r.status}
                      archived={!!r.archivedAt}
                    />
                  </span>
                ),
              },
              { label: 'Actions', render: actions },
            ]}
          />
        )}
      </Card>
      {editing && (
        <TaskEditor
          task={editing === 'new' ? undefined : editing}
          projectId={filters.projectId || undefined}
          onClose={() => setEditing(null)}
          onSaved={() => setNotice('Task saved.')}
        />
      )}
      {detail && (
        <RecordDialog
          title={detail.title}
          description={detail.code}
          onClose={() => setDetail(null)}
        >
          <p className="project-description">{detail.description || 'No description recorded.'}</p>
          <dl className="record-details">
            {[
              ['Project', detail.project.name],
              ['Milestone', detail.milestone?.title ?? 'Not linked'],
              ['Assignee', detail.assignee?.name ?? 'Unassigned'],
              ['Status', taskLabel(detail.status)],
              ['Priority', taskLabel(detail.priority)],
              ['Start date', detail.startDate.slice(0, 10)],
              ['Due date', detail.dueDate.slice(0, 10)],
              [
                'Completed',
                detail.completedAt
                  ? new Date(detail.completedAt).toLocaleString('en-PH')
                  : 'Not completed',
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <TaskDiscussion
            taskId={detail.id}
            readOnly={!!detail.archivedAt || !!detail.project.archivedAt}
          />
          <Link to={`/tasks/${detail.id}`}>Open full task discussion</Link>
        </RecordDialog>
      )}
      {confirm && (
        <ConfirmAction
          title={`Archive ${confirm.title}?`}
          description="Task history is preserved. Project progress will be recalculated."
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await archive.mutateAsync(confirm.id);
            setNotice('Task archived.');
          }}
        />
      )}
    </div>
  );
}
