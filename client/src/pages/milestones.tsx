import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { Plus, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCoreMutation, useLookup, queryString } from '@/hooks/use-core';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/shared/feedback';
import {
  RecordTable,
  StatusBadge,
  Notice,
  ConfirmAction,
  RecordForm,
} from '@/components/shared/crud';
import { MilestoneEditor } from '@/components/shared/milestone-editor';
import { CsvExport } from '@/components/shared/csv-export';
import { milestoneStatuses, milestoneLabel } from '@/lib/milestones';
import type { MilestoneRecord, PageResult } from '@/types/core';

export function MilestonesPage() {
  const { data: user } = useAuth(),
    [search] = useSearchParams();
  const [filters, setFilters] = useState({
    q: '',
    projectId: search.get('projectId') ?? '',
    status: '',
    priority: '',
    responsibleId: '',
    overdue: '',
    archived: 'false',
    sort: 'displayOrder',
    direction: 'asc',
    page: 1,
    pageSize: 20,
  });
  const [editing, setEditing] = useState<MilestoneRecord | 'new' | null>(null),
    [confirm, setConfirm] = useState<MilestoneRecord | null>(null),
    [statusEditing, setStatusEditing] = useState<MilestoneRecord | null>(null),
    [notice, setNotice] = useState('');
  const projects = useLookup('projects'),
    assignees = useLookup('assignees');
  const list = useQuery({
    queryKey: ['core', 'milestones', filters],
    queryFn: () => api.get<PageResult<MilestoneRecord>>(`/milestones?${queryString(filters)}`),
  });
  const archive = useCoreMutation((m: MilestoneRecord) =>
    m.archivedAt ? api.post(`/milestones/${m.id}/restore`) : api.delete(`/milestones/${m.id}`),
  );
  const change = useCoreMutation((values: Record<string, string>) =>
    api.patch(`/milestones/${statusEditing!.id}`, values),
  );
  const update = (key: string, value: string) =>
    setFilters((v) => ({ ...v, [key]: value, page: 1 }));
  return (
    <div className="crud-page">
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">PROJECT OBJECTIVES</div>
          <h1>Milestones</h1>
          <p>Track deliverables, responsibility, and the work needed to reach them.</p>
        </div>
        <CsvExport kind="milestones" filters={filters} />
        {user?.permissions.includes('projects:write') && (
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} />
            Add milestone
          </Button>
        )}
      </div>
      <Notice message={notice} dismiss={() => setNotice('')} />
      <Card>
        <div className="crud-toolbar">
          <input
            className="input crud-search"
            aria-label="Search milestones"
            placeholder="Search title or description…"
            value={filters.q}
            onChange={(e) => update('q', e.target.value)}
          />
          <select
            className="input"
            aria-label="Milestone project filter"
            value={filters.projectId}
            onChange={(e) => update('projectId', e.target.value)}
          >
            <option value="">All projects</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Milestone status filter"
            value={filters.status}
            onChange={(e) => update('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {milestoneStatuses.map((s) => (
              <option key={s} value={s}>
                {milestoneLabel(s)}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Milestone priority filter"
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
            aria-label="Responsible employee filter"
            value={filters.responsibleId}
            onChange={(e) => update('responsibleId', e.target.value)}
          >
            <option value="">All responsible employees</option>
            {assignees.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Overdue milestone filter"
            value={filters.overdue}
            onChange={(e) => update('overdue', e.target.value)}
          >
            <option value="">All due dates</option>
            <option value="true">Overdue</option>
            <option value="false">Current / completed</option>
          </select>
          <select
            className="input"
            aria-label="Archived milestones"
            value={filters.archived}
            onChange={(e) => update('archived', e.target.value)}
          >
            <option value="false">Current milestones</option>
            <option value="true">Archived milestones</option>
          </select>
          <select
            className="input"
            aria-label="Sort milestones"
            value={filters.sort}
            onChange={(e) => update('sort', e.target.value)}
          >
            <option value="displayOrder">Display order</option>
            <option value="dueDate">Due date</option>
            <option value="title">Title</option>
            <option value="createdAt">Created date</option>
          </select>
          <select
            className="input"
            aria-label="Milestone sort direction"
            value={filters.direction}
            onChange={(e) => update('direction', e.target.value)}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
        {list.isError ? (
          <ErrorState message={list.error.message} retry={() => void list.refetch()} />
        ) : (
          <RecordTable
            data={list.data}
            loading={list.isPending}
            onPage={(page) => setFilters((v) => ({ ...v, page }))}
            columns={[
              {
                label: 'Milestone',
                render: (m) => (
                  <Link className="record-link" to={`/milestones/${m.id}`}>
                    <strong>{m.title}</strong>
                    <small>{m.project.name}</small>
                  </Link>
                ),
              },
              { label: 'Responsible', render: (m) => m.responsible?.name ?? 'Unassigned' },
              {
                label: 'Status',
                render: (m) => (
                  <div>
                    <StatusBadge value={m.archivedAt ? 'ARCHIVED' : m.status} />
                    {m.overdue && !m.archivedAt && <small className="field-error">Overdue</small>}
                  </div>
                ),
              },
              { label: 'Priority', render: (m) => <StatusBadge value={m.priority} /> },
              {
                label: 'Due / Progress',
                render: (m) => (
                  <div>
                    {m.dueDate.slice(0, 10)}
                    <small>
                      {m.progress}% · {m.completedTasks}/{m.totalTasks} tasks
                    </small>
                  </div>
                ),
              },
              {
                label: 'Actions',
                render: (m) => (
                  <div className="row-actions">
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/milestones/${m.id}`}>View</Link>
                    </Button>
                    {m.canManage && !m.archivedAt && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>
                        Edit
                      </Button>
                    )}
                    {m.canUpdateStatus && !m.canManage && (
                      <Button size="sm" variant="ghost" onClick={() => setStatusEditing(m)}>
                        Update status
                      </Button>
                    )}
                    {m.canManage && (
                      <Button size="sm" variant="outline" onClick={() => setConfirm(m)}>
                        {m.archivedAt ? 'Restore' : 'Archive'}
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
      {editing && (
        <MilestoneEditor
          milestone={editing === 'new' ? undefined : editing}
          projectId={filters.projectId || undefined}
          onClose={() => setEditing(null)}
          onSaved={() => setNotice('Milestone saved.')}
        />
      )}
      {confirm && (
        <ConfirmAction
          title={`${confirm.archivedAt ? 'Restore' : 'Archive'} ${confirm.title}?`}
          description="Milestone history and linked task associations are preserved."
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await archive.mutateAsync(confirm);
            setNotice(confirm.archivedAt ? 'Milestone restored.' : 'Milestone archived.');
          }}
        />
      )}
      {statusEditing && (
        <RecordForm
          title="Update milestone status"
          fields={[
            {
              name: 'status',
              label: 'Status',
              type: 'select',
              required: true,
              options: milestoneStatuses.map((s) => ({ value: s, label: milestoneLabel(s) })),
            },
          ]}
          initial={{ status: statusEditing.status }}
          onClose={() => setStatusEditing(null)}
          onSave={async (v) => {
            await change.mutateAsync(v);
            setNotice('Milestone status saved.');
          }}
        />
      )}
    </div>
  );
}

export function MilestoneDetailsPage() {
  const { id } = useParams();
  const [editing, setEditing] = useState(false),
    [notice, setNotice] = useState('');
  const query = useQuery({
    queryKey: ['core', 'milestone', id],
    queryFn: () => api.get<MilestoneRecord>(`/milestones/${id}`),
  });
  if (query.isPending)
    return (
      <div className="crud-loading" role="status">
        Loading milestone…
      </div>
    );
  if (query.isError)
    return <ErrorState message={query.error.message} retry={() => void query.refetch()} />;
  const m = query.data;
  return (
    <div className="crud-page">
      <Button asChild variant="ghost" size="sm">
        <Link to={`/milestones?projectId=${m.projectId}`}>
          <ArrowLeft size={15} />
          All milestones
        </Link>
      </Button>
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">{m.project.code}</div>
          <h1>{m.title}</h1>
          <p>
            <Link className="record-link" to={`/projects/${m.projectId}`}>
              {m.project.name}
            </Link>
          </p>
        </div>
        {m.canManage && !m.archivedAt && !m.project.archivedAt && (
          <Button onClick={() => setEditing(true)}>Edit milestone</Button>
        )}
      </div>
      <Notice message={notice} dismiss={() => setNotice('')} />
      <div className="project-detail-grid">
        <Card className="detail-panel">
          <div className="row-actions">
            <StatusBadge value={m.archivedAt ? 'ARCHIVED' : m.status} />
            <StatusBadge value={m.priority} />
            {m.overdue && <span className="field-error">Overdue</span>}
          </div>
          <p className="project-description">{m.description || 'No description recorded.'}</p>
          <dl className="record-details">
            {[
              ['Responsible employee', m.responsible?.name ?? 'Unassigned'],
              ['Start date', m.startDate.slice(0, 10)],
              ['Due date', m.dueDate.slice(0, 10)],
              [
                'Completed',
                m.completedAt ? new Date(m.completedAt).toLocaleString('en-PH') : 'Not completed',
              ],
              ['Display order', String(m.displayOrder)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="detail-panel">
          <h2 className="card-title">Milestone progress</h2>
          <strong className="project-progress-value">{m.progress}%</strong>
          <progress
            className="project-progress"
            max={100}
            value={m.progress}
            aria-label="Milestone progress"
          />
          <p className="field-hint">
            {m.completedTasks} completed / {m.totalTasks} current linked tasks
          </p>
          <p className="field-hint">
            Milestones without linked tasks can be completed manually by a project manager.
          </p>
        </Card>
      </div>
      <Card className="detail-panel">
        <h2 className="card-title">Related tasks</h2>
        <Button asChild size="sm" variant="outline">
          <Link to={`/tasks?projectId=${m.projectId}&milestoneId=${m.id}`}>View linked tasks</Link>
        </Button>
        {m.tasks?.length ? (
          <ul className="data-list">
            {m.tasks.map((t) => (
              <li key={t.id}>
                <span>
                  {t.title}
                  <small>
                    {t.assignee?.name ?? 'Unassigned'} · {t.dueDate.slice(0, 10)}
                  </small>
                </span>
                <StatusBadge value={t.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="field-hint">
            No authorized tasks linked. Edit a task in this project to select its milestone.
          </p>
        )}
      </Card>
      <Card className="detail-panel">
        <h2 className="card-title">Activity history</h2>
        <ul className="data-list">
          {m.activity?.map((event) => (
            <li key={event.id}>
              <span>
                {event.action.replaceAll('.', ' ').replaceAll('_', ' ')}
                <small>{event.actor?.name ?? 'System'}</small>
              </span>
              <time>{new Date(event.timestamp).toLocaleString('en-PH')}</time>
            </li>
          ))}
        </ul>
      </Card>
      {editing && (
        <MilestoneEditor
          milestone={m}
          onClose={() => setEditing(false)}
          onSaved={() => setNotice('Milestone saved.')}
        />
      )}
    </div>
  );
}
