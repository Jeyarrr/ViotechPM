import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { Plus, ArrowLeft, FolderKanban } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCoreMutation, useLookup, queryString } from '@/hooks/use-core';
import { api } from '@/services/api';
import { currency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, EmptyState } from '@/components/shared/feedback';
import { RecordTable, ConfirmAction, StatusBadge, Notice } from '@/components/shared/crud';
import { ProjectEditor, CategoryManager } from '@/components/shared/project-editor';
import { ProjectTeam } from '@/components/shared/project-team';
import { TaskEditor } from '@/components/shared/task-editor';
import { ProjectMilestones } from '@/components/shared/project-milestones';
import { ProjectFinance } from '@/components/shared/project-finance';
import { ApprovalPolicyEditor } from '@/components/shared/approval-controls';
import type { ProjectRecord, PageResult } from '@/types/core';

export function ProjectsPage() {
  const { data: user } = useAuth();
  const canWrite = !!user?.permissions.includes('projects:write');
  const admin = user?.role.key === 'super_admin';
  const [filters, setFilters] = useState({
    q: '',
    status: '',
    priority: '',
    clientId: '',
    managerId: '',
    categoryId: '',
    archived: 'false',
    sort: 'createdAt',
    direction: 'desc',
    page: 1,
    pageSize: 20,
  });
  const [editing, setEditing] = useState<ProjectRecord | 'new' | null>(null);
  const [confirm, setConfirm] = useState<ProjectRecord | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const clients = useLookup('clients', canWrite),
    managers = useLookup('managers', canWrite),
    categories = useLookup('categories');
  const list = useQuery({
    queryKey: ['core', 'projects', filters],
    queryFn: () => api.get<PageResult<ProjectRecord>>(`/projects?${queryString(filters)}`),
  });
  const archive = useCoreMutation((row: ProjectRecord) =>
    row.archivedAt ? api.post(`/projects/${row.id}/restore`) : api.delete(`/projects/${row.id}`),
  );
  const update = (key: string, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  return (
    <div className="crud-page">
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">PROJECT DELIVERY</div>
          <h1>Projects</h1>
          <p>Plan, organize, and track your authorized client engagements.</p>
        </div>
        <div className="row-actions">
          {admin && (
            <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
              Categories
            </Button>
          )}
          {canWrite && (
            <Button onClick={() => setEditing('new')}>
              <Plus size={16} />
              Add project
            </Button>
          )}
        </div>
      </div>
      <Notice message={notice} dismiss={() => setNotice('')} />
      <Card>
        <div className="crud-toolbar">
          <input
            className="input crud-search"
            aria-label="Search projects"
            placeholder="Search project name or code…"
            value={filters.q}
            onChange={(e) => update('q', e.target.value)}
          />
          <select
            className="input"
            aria-label="Project status filter"
            value={filters.status}
            onChange={(e) => update('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'].map((v) => (
              <option key={v} value={v}>
                {v.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Project priority filter"
            value={filters.priority}
            onChange={(e) => update('priority', e.target.value)}
          >
            <option value="">All priorities</option>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          {canWrite && (
            <>
              <select
                className="input"
                aria-label="Client filter"
                value={filters.clientId}
                onChange={(e) => update('clientId', e.target.value)}
              >
                <option value="">All clients</option>
                {clients.data?.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              <select
                className="input"
                aria-label="Manager filter"
                value={filters.managerId}
                onChange={(e) => update('managerId', e.target.value)}
              >
                <option value="">All managers</option>
                {managers.data?.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <select
            className="input"
            aria-label="Category filter"
            value={filters.categoryId}
            onChange={(e) => update('categoryId', e.target.value)}
          >
            <option value="">All categories</option>
            {categories.data?.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Archived projects"
            value={filters.archived}
            onChange={(e) => update('archived', e.target.value)}
          >
            <option value="false">Current projects</option>
            <option value="true">Archived projects</option>
          </select>
          <select
            className="input"
            aria-label="Sort projects"
            value={filters.sort}
            onChange={(e) => update('sort', e.target.value)}
          >
            {['createdAt', 'name', 'code', 'targetDate', 'budget'].map((v) => (
              <option key={v} value={v}>
                Sort: {v === 'createdAt' ? 'Created' : v === 'targetDate' ? 'Target date' : v}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Sort direction"
            value={filters.direction}
            onChange={(e) => update('direction', e.target.value)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
        {list.isError ? (
          <ErrorState message={list.error.message} retry={() => void list.refetch()} />
        ) : (
          <RecordTable
            data={list.data}
            loading={list.isPending}
            onPage={(page) => setFilters((prev) => ({ ...prev, page }))}
            columns={[
              {
                label: 'Project',
                render: (row) => (
                  <Link className="record-link" to={`/projects/${row.id}`}>
                    <strong>{row.name}</strong>
                    <small>{row.code}</small>
                  </Link>
                ),
              },
              {
                label: 'Client / Manager',
                render: (row) => (
                  <div>
                    {row.client.name}
                    <small>{row.manager.name}</small>
                  </div>
                ),
              },
              {
                label: 'Status',
                render: (row) => <StatusBadge value={row.archivedAt ? 'ARCHIVED' : row.status} />,
              },
              { label: 'Priority', render: (row) => <StatusBadge value={row.priority} /> },
              {
                label: 'Budget',
                render: (row) => (row.budget === null ? 'Not set' : currency(row.budget)),
              },
              { label: 'Target', render: (row) => row.targetDate.slice(0, 10) },
              {
                label: 'Actions',
                render: (row) => (
                  <div className="row-actions">
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/projects/${row.id}`}>View</Link>
                    </Button>
                    {canWrite && (admin || row.managerId === user?.id) && (
                      <>
                        {!row.archivedAt && (
                          <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                            Edit
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => setConfirm(row)}>
                          {row.archivedAt ? 'Restore' : 'Archive'}
                        </Button>
                      </>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
      {editing && (
        <ProjectEditor
          project={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => setNotice('Project saved successfully.')}
        />
      )}
      {categoriesOpen && <CategoryManager onClose={() => setCategoriesOpen(false)} />}
      {confirm && (
        <ConfirmAction
          title={`${confirm.archivedAt ? 'Restore' : 'Archive'} ${confirm.name}?`}
          description="The project history, tasks, and team associations will be preserved."
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await archive.mutateAsync(confirm);
            setNotice(confirm.archivedAt ? 'Project restored.' : 'Project archived.');
          }}
        />
      )}
    </div>
  );
}

export function ProjectDetailsPage() {
  const { id } = useParams();
  const { data: currentUser } = useAuth();
  const [approvalPolicyOpen, setApprovalPolicyOpen] = useState(false);
  const [editing, setEditing] = useState(false),
    [notice, setNotice] = useState('');
  const [teamOpen, setTeamOpen] = useState(false),
    [taskOpen, setTaskOpen] = useState(false);
  const query = useQuery({
    queryKey: ['core', 'project', id],
    queryFn: () => api.get<ProjectRecord>(`/projects/${id}`),
  });
  if (query.isPending)
    return (
      <div className="crud-loading" role="status">
        Loading project…
      </div>
    );
  if (query.isError)
    return <ErrorState message={query.error.message} retry={() => void query.refetch()} />;
  const project = query.data;
  return (
    <div className="crud-page">
      <Button asChild variant="ghost" size="sm" className="back-link">
        <Link to="/projects">
          <ArrowLeft size={15} />
          All projects
        </Link>
      </Button>
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">{project.code}</div>
          <h1>{project.name}</h1>
          <p>{project.category.name}</p>
        </div>
        {project.canManage && !project.archivedAt && (
          <Button onClick={() => setEditing(true)}>Edit project</Button>
        )}
      </div>
      <Notice message={notice} dismiss={() => setNotice('')} />
      <div className="row-actions">
        <Button asChild variant="outline" size="sm">
          <Link to={`/transactions?projectId=${project.id}`}>Project transactions</Link>
        </Button>
        {currentUser?.role.key === 'super_admin' && !project.archivedAt && (
          <Button variant="outline" size="sm" onClick={() => setApprovalPolicyOpen(true)}>
            Approval policy
          </Button>
        )}
      </div>
      <div className="project-detail-grid">
        <Card className="detail-panel">
          <div className="row-actions">
            <StatusBadge value={project.archivedAt ? 'ARCHIVED' : project.status} />
            <StatusBadge value={project.priority} />
          </div>
          <p className="project-description">{project.description || 'No description recorded.'}</p>
          <dl className="record-details">
            {[
              ['Client', `${project.client.code} · ${project.client.name}`],
              [
                'Client contact',
                [project.client.contactPerson, project.client.email, project.client.phone]
                  .filter(Boolean)
                  .join(' · ') || 'Not recorded',
              ],
              ['Project manager', project.manager.name],
              ['Department', project.department?.name ?? 'Not assigned'],
              ['Start date', project.startDate.slice(0, 10)],
              ['Target completion', project.targetDate.slice(0, 10)],
              ['Actual completion', project.actualCompletionDate?.slice(0, 10) ?? 'Not completed'],
              ['Project budget', project.budget === null ? 'Not set' : currency(project.budget)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="detail-panel">
          <h2 className="card-title">Task progress</h2>
          <strong className="project-progress-value">{project.progress}%</strong>
          <progress
            className="project-progress"
            max={100}
            value={project.progress}
            aria-label="Project task progress"
          />
          <p className="field-hint">
            {project.completedTasks} completed / {project.totalTasks} current tasks
          </p>
          <h2 className="card-title detail-subheading">Project team</h2>
          <ul className="data-list">
            {project.members?.slice(0, 5).map((member) => (
              <li key={member.id}>
                <span>
                  {member.user.name}
                  <small>{member.role}</small>
                </span>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" onClick={() => setTeamOpen(true)}>
            View project team
          </Button>
        </Card>
      </div>
      <Card className="detail-panel">
        <h2 className="card-title">Related tasks</h2>
        <div className="row-actions">
          <Button asChild variant="outline" size="sm">
            <Link to={`/tasks?projectId=${project.id}`}>View all tasks</Link>
          </Button>
          {project.canManage && !project.archivedAt && (
            <Button size="sm" onClick={() => setTaskOpen(true)}>
              Add task
            </Button>
          )}
        </div>
        {project.tasks?.length ? (
          <ul className="data-list">
            {project.tasks.map((task) => (
              <li key={task.id}>
                <span>
                  {task.title}
                  <small>
                    {task.assignee?.name ?? 'Unassigned'} · {task.dueDate.slice(0, 10)}
                  </small>
                </span>
                <StatusBadge value={task.status} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={FolderKanban}
            title="No tasks yet"
            description="Project tasks will appear here when work is assigned."
          />
        )}
      </Card>
      <ProjectMilestones project={project} />
      <ProjectFinance project={project} />
      <Card className="detail-panel">
        <h2 className="card-title">Recent activity</h2>
        <ul className="data-list">
          {project.activity?.map((item) => (
            <li key={item.id}>
              <span>
                {item.action.replaceAll('.', ' ').replaceAll('_', ' ')}
                <small>{item.actor?.name ?? 'System'}</small>
              </span>
              <time>{new Date(item.timestamp).toLocaleString('en-PH')}</time>
            </li>
          ))}
        </ul>
      </Card>
      {editing && (
        <ProjectEditor
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => setNotice('Project updated.')}
        />
      )}
      {teamOpen && <ProjectTeam project={project} onClose={() => setTeamOpen(false)} />}
      {taskOpen && (
        <TaskEditor
          projectId={project.id}
          onClose={() => setTaskOpen(false)}
          onSaved={() => setNotice('Task saved.')}
        />
      )}
      {approvalPolicyOpen && (
        <ApprovalPolicyEditor
          projectId={project.id}
          onClose={() => setApprovalPolicyOpen(false)}
          onSaved={() => setNotice('Approval policy saved.')}
        />
      )}
    </div>
  );
}
