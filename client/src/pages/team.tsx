import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCoreMutation, useLookup, queryString } from '@/hooks/use-core';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/shared/feedback';
import {
  RecordForm,
  RecordDialog,
  RecordTable,
  StatusBadge,
  ConfirmAction,
  Notice,
  type FormField,
} from '@/components/shared/crud';
import type { EmployeeRecord, PageResult } from '@/types/core';

function EmployeeEditor({
  employee,
  onClose,
  onSaved,
}: {
  employee?: EmployeeRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const roles = useLookup('roles'),
    departments = useLookup('departments');
  const queryClient = useQueryClient();
  const { data: currentUser } = useAuth();
  const save = useCoreMutation((values: Record<string, string>) =>
    employee ? api.patch(`/employees/${employee.id}`, values) : api.post('/employees', values),
  );
  if (!roles.data || !departments.data)
    return (
      <RecordDialog
        title="Employee account"
        description="Loading account options."
        onClose={onClose}
      >
        {roles.isError || departments.isError ? (
          <ErrorState
            message="Unable to load account options."
            retry={() => {
              void roles.refetch();
              void departments.refetch();
            }}
          />
        ) : (
          <p role="status">Loading…</p>
        )}
      </RecordDialog>
    );
  const fields: FormField[] = [
    { name: 'name', label: 'Full name', required: true, max: 150 },
    { name: 'email', label: 'Email address', type: 'email', required: true, max: 254 },
    {
      name: 'roleId',
      label: 'Role',
      type: 'select',
      required: true,
      options: roles.data.map((r) => ({ value: r.id, label: r.name })),
    },
    {
      name: 'departmentId',
      label: 'Department',
      type: 'select',
      options: departments.data.map((r) => ({ value: r.id, label: r.name })),
    },
    ...(!employee
      ? [
          {
            name: 'password',
            label: 'Initial password',
            type: 'password' as const,
            required: true,
            max: 128,
            hint: 'Use 14–128 characters. Share securely with the employee.',
          },
        ]
      : []),
  ];
  return (
    <RecordForm
      title={employee ? 'Edit employee' : 'Create employee'}
      fields={fields}
      initial={
        employee
          ? {
              name: employee.name,
              email: employee.email,
              roleId: employee.roleId,
              departmentId: employee.departmentId ?? '',
            }
          : { roleId: roles.data.find((r) => r.key === 'employee')?.id ?? '' }
      }
      onClose={onClose}
      onSave={async (values) => {
        await save.mutateAsync(values);
        if (employee?.id === currentUser?.id)
          await queryClient.invalidateQueries({ queryKey: ['auth'] });
        onSaved();
      }}
    />
  );
}
export function TeamPage() {
  const { data: user } = useAuth();
  const queryClient = useQueryClient();
  const admin = user?.role.key === 'super_admin';
  const [filters, setFilters] = useState({
    q: '',
    status: '',
    departmentId: '',
    sort: 'name',
    direction: 'asc',
    page: 1,
    pageSize: 20,
  });
  const [editing, setEditing] = useState<EmployeeRecord | 'new' | null>(null),
    [detail, setDetail] = useState<EmployeeRecord | null>(null),
    [confirm, setConfirm] = useState<EmployeeRecord | null>(null),
    [notice, setNotice] = useState('');
  const departments = useLookup('departments');
  const list = useQuery({
    queryKey: ['core', 'employees', filters],
    queryFn: () => api.get<PageResult<EmployeeRecord>>(`/employees?${queryString(filters)}`),
  });
  const status = useCoreMutation((row: EmployeeRecord) =>
    api.patch(`/employees/${row.id}/status`, {
      status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
    }),
  );
  const update = (key: string, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  return (
    <div className="crud-page">
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">PEOPLE & RESPONSIBILITIES</div>
          <h1>Team members</h1>
          <p>Manage employee accounts and see their project assignments.</p>
        </div>
        {admin && (
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} />
            Add employee
          </Button>
        )}
      </div>
      <Notice message={notice} dismiss={() => setNotice('')} />
      <Card>
        <div className="crud-toolbar">
          <input
            className="input crud-search"
            aria-label="Search employees"
            placeholder="Search name or email…"
            value={filters.q}
            onChange={(e) => update('q', e.target.value)}
          />
          <select
            className="input"
            aria-label="Account status filter"
            value={filters.status}
            onChange={(e) => update('status', e.target.value)}
          >
            <option value="">All statuses</option>
            <option>ACTIVE</option>
            <option>INACTIVE</option>
          </select>
          <select
            className="input"
            aria-label="Department filter"
            value={filters.departmentId}
            onChange={(e) => update('departmentId', e.target.value)}
          >
            <option value="">All departments</option>
            {departments.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Sort employees"
            value={filters.sort}
            onChange={(e) => update('sort', e.target.value)}
          >
            <option value="name">Name</option>
            <option value="email">Email</option>
            <option value="createdAt">Created date</option>
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
                label: 'Employee',
                render: (r) => (
                  <div className="employee-identity">
                    <span className="employee-avatar">
                      {r.profileImage ? (
                        <img src={r.profileImage} alt="" />
                      ) : (
                        r.name.slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <div>
                      <strong>{r.name}</strong>
                      <small>{r.email}</small>
                    </div>
                  </div>
                ),
              },
              {
                label: 'Role / Department',
                render: (r) => (
                  <div>
                    {r.role.name}
                    <small>{r.department?.name ?? 'No department'}</small>
                  </div>
                ),
              },
              { label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
              {
                label: 'Projects',
                render: (r) => (
                  <span>{r.memberships.filter((m) => !m.project.archivedAt).length} current</span>
                ),
              },
              {
                label: 'Actions',
                render: (r) => (
                  <div className="row-actions">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(r)}>
                      View
                    </Button>
                    {admin && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirm(r)}>
                          {r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
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
        <EmployeeEditor
          employee={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => setNotice('Employee account saved.')}
        />
      )}
      {detail && (
        <RecordDialog
          title={detail.name}
          description={detail.email}
          onClose={() => setDetail(null)}
        >
          <dl className="record-details">
            <div>
              <dt>Role</dt>
              <dd>{detail.role.name}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>{detail.department?.name ?? 'Not assigned'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge value={detail.status} />
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{new Date(detail.createdAt).toLocaleDateString('en-PH')}</dd>
            </div>
          </dl>
          <h3>Assigned projects</h3>
          {detail.memberships.length ? (
            <ul className="data-list">
              {detail.memberships.map(({ project }) => (
                <li key={project.id}>
                  <Link className="record-link" to={`/projects/${project.id}`}>
                    {project.name}
                  </Link>
                  {project.archivedAt && <StatusBadge value="ARCHIVED" />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-hint">No authorized project assignments.</p>
          )}
        </RecordDialog>
      )}
      {confirm && (
        <ConfirmAction
          title={`${confirm.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${confirm.name}?`}
          description="Deactivation ends access immediately. Open project responsibilities must be reassigned first."
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await status.mutateAsync(confirm);
            if (confirm.id === user?.id)
              await queryClient.invalidateQueries({ queryKey: ['auth'] });
            setNotice('Account status updated.');
          }}
        />
      )}
    </div>
  );
}
