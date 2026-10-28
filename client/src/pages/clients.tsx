import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCoreMutation, queryString } from '@/hooks/use-core';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/shared/feedback';
import {
  RecordForm,
  RecordDialog,
  RecordTable,
  ConfirmAction,
  StatusBadge,
  Notice,
  type FormField,
} from '@/components/shared/crud';
import type { ClientRecord, PageResult } from '@/types/core';

const fields: FormField[] = [
  {
    name: 'code',
    label: 'Client code',
    required: true,
    max: 40,
    hint: 'Unique code, such as CLI-001.',
  },
  { name: 'name', label: 'Client or company name', required: true, max: 180 },
  {
    name: 'type',
    label: 'Client type',
    type: 'select',
    required: true,
    options: [
      { value: 'BUSINESS', label: 'Business' },
      { value: 'INDIVIDUAL', label: 'Individual' },
    ],
  },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    required: true,
    options: [
      { value: 'ACTIVE', label: 'Active' },
      { value: 'INACTIVE', label: 'Inactive' },
    ],
  },
  { name: 'contactPerson', label: 'Contact person', max: 150 },
  { name: 'email', label: 'Email address', type: 'email', max: 254 },
  { name: 'phone', label: 'Contact number', max: 50 },
  { name: 'industry', label: 'Industry or category', max: 120 },
  { name: 'address', label: 'Business address', type: 'textarea', max: 500 },
  { name: 'notes', label: 'Notes', type: 'textarea', max: 4000 },
];
export function ClientsPage() {
  const { data: user } = useAuth();
  const [filters, setFilters] = useState({
    q: '',
    status: '',
    archived: 'false',
    sort: 'createdAt',
    direction: 'desc',
    page: 1,
    pageSize: 20,
  });
  const [editing, setEditing] = useState<ClientRecord | 'new' | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ClientRecord | null>(null);
  const [notice, setNotice] = useState('');
  const canRead = !!user?.permissions.includes('clients:read'),
    canWrite = !!user?.permissions.includes('clients:write');
  const list = useQuery({
    queryKey: ['core', 'clients', filters],
    queryFn: () => api.get<PageResult<ClientRecord>>(`/clients?${queryString(filters)}`),
    enabled: canRead,
  });
  const detail = useQuery({
    queryKey: ['core', 'client', details],
    queryFn: () => api.get<ClientRecord>(`/clients/${details}`),
    enabled: !!details && canRead,
  });
  const save = useCoreMutation((values: Record<string, string>) =>
    editing && editing !== 'new'
      ? api.patch(`/clients/${editing.id}`, values)
      : api.post('/clients', values),
  );
  const archive = useCoreMutation((row: ClientRecord) =>
    row.archivedAt ? api.post(`/clients/${row.id}/restore`) : api.delete(`/clients/${row.id}`),
  );
  const updateFilter = (key: string, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  if (!canRead) return <ErrorState message="Your role does not have access to clients." />;
  return (
    <div className="crud-page">
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">CLIENT RELATIONSHIPS</div>
          <h1>Clients</h1>
          <p>Your customers, contacts, and company relationships.</p>
        </div>
        {canWrite && (
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} />
            Add client
          </Button>
        )}
      </div>
      <Notice message={notice} dismiss={() => setNotice('')} />
      <Card>
        <div className="crud-toolbar">
          <input
            className="input crud-search"
            aria-label="Search clients"
            placeholder="Search name, code, or contact…"
            value={filters.q}
            onChange={(e) => updateFilter('q', e.target.value)}
          />
          <select
            className="input"
            aria-label="Filter by status"
            value={filters.status}
            onChange={(e) => updateFilter('status', e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <select
            className="input"
            aria-label="Archived clients"
            value={filters.archived}
            onChange={(e) => updateFilter('archived', e.target.value)}
          >
            <option value="false">Current clients</option>
            <option value="true">Archived clients</option>
          </select>
          <select
            className="input"
            aria-label="Sort clients"
            value={filters.sort}
            onChange={(e) => updateFilter('sort', e.target.value)}
          >
            <option value="createdAt">Created date</option>
            <option value="name">Name</option>
            <option value="code">Code</option>
            <option value="updatedAt">Updated date</option>
          </select>
          <select
            className="input"
            aria-label="Sort direction"
            value={filters.direction}
            onChange={(e) => updateFilter('direction', e.target.value)}
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
                label: 'Client',
                render: (row) => (
                  <button className="record-link" onClick={() => setDetails(row.id)}>
                    <strong>{row.name}</strong>
                    <small>{row.code}</small>
                  </button>
                ),
              },
              {
                label: 'Contact',
                render: (row) => (
                  <>
                    <span>{row.contactPerson ?? '—'}</span>
                    <small>{row.email ?? 'No email recorded'}</small>
                  </>
                ),
              },
              {
                label: 'Type',
                render: (row) => (row.type === 'BUSINESS' ? 'Business' : 'Individual'),
              },
              {
                label: 'Status',
                render: (row) => <StatusBadge value={row.archivedAt ? 'ARCHIVED' : row.status} />,
              },
              {
                label: 'Actions',
                render: (row) => (
                  <div className="row-actions">
                    <Button size="sm" variant="ghost" onClick={() => setDetails(row.id)}>
                      View
                    </Button>
                    {canWrite && (
                      <>
                        {!row.archivedAt && (
                          <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                            Edit
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setConfirm(row)}>
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
        <RecordForm
          title={editing === 'new' ? 'Add client' : 'Edit client'}
          fields={fields}
          initial={
            editing === 'new'
              ? { type: 'BUSINESS', status: 'ACTIVE' }
              : Object.fromEntries(
                  fields.map((field) => [
                    field.name,
                    String(editing[field.name as keyof ClientRecord] ?? ''),
                  ]),
                )
          }
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            await save.mutateAsync(values);
            setNotice('Client saved successfully.');
          }}
        />
      )}
      {confirm && (
        <ConfirmAction
          title={`${confirm.archivedAt ? 'Restore' : 'Archive'} ${confirm.name}?`}
          description={
            confirm.archivedAt
              ? 'This client will return to the current client directory.'
              : 'The client will be hidden from current records. Historical project associations will be preserved.'
          }
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await archive.mutateAsync(confirm);
            setNotice(confirm.archivedAt ? 'Client restored.' : 'Client archived.');
          }}
        />
      )}
      {details && (
        <RecordDialog
          title="Client details"
          description="Contact information and account details."
          onClose={() => setDetails(null)}
        >
          {detail.isError ? (
            <ErrorState message={detail.error.message} />
          ) : detail.data ? (
            <dl className="record-details">
              {fields.map((field) => (
                <div key={field.name}>
                  <dt>{field.label}</dt>
                  <dd>{String(detail.data[field.name as keyof ClientRecord] ?? '—')}</dd>
                </div>
              ))}
              <div>
                <dt>Created</dt>
                <dd>{new Date(detail.data.createdAt).toLocaleDateString('en-PH')}</dd>
              </div>
            </dl>
          ) : (
            <div role="status" className="crud-loading">
              Loading client…
            </div>
          )}
        </RecordDialog>
      )}
    </div>
  );
}
