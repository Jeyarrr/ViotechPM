import { useState } from 'react';
import { useCoreMutation, useLookup } from '@/hooks/use-core';
import { api } from '@/services/api';
import { RecordDialog, RecordForm, type FormField } from './crud';
import { ErrorState } from './feedback';
import { Button } from '@/components/ui/button';
import type { TransactionRecord } from '@/types/operations';

export function TransactionEditor({
  transaction,
  projectId: initialProject,
  onClose,
  onSaved,
}: {
  transaction?: TransactionRecord;
  projectId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState(transaction?.projectId ?? initialProject ?? '');
  const projects = useLookup('projects', !projectId),
    types = useLookup('transaction-types');
  const save = useCoreMutation((values: Record<string, string>) =>
    transaction
      ? api.patch(`/transactions/${transaction.id}`, values)
      : api.post('/transactions', { ...values, projectId }),
  );
  if (!projectId)
    return (
      <RecordDialog
        title="Choose a project"
        description="Select the project for your request."
        onClose={onClose}
      >
        {projects.isError ? (
          <ErrorState message={projects.error.message} retry={() => void projects.refetch()} />
        ) : (
          <div className="project-picker">
            {projects.data?.map((p) => (
              <Button variant="outline" key={p.id} onClick={() => setProjectId(p.id)}>
                {p.code} · {p.name}
              </Button>
            ))}
            {projects.isPending ? (
              <p role="status">Loading projects…</p>
            ) : (
              !projects.data?.length && <p>No current projects available.</p>
            )}
          </div>
        )}
      </RecordDialog>
    );
  if (!types.data)
    return (
      <RecordDialog
        title="Transaction request"
        description="Loading request types."
        onClose={onClose}
      >
        {types.isError ? (
          <ErrorState message={types.error.message} retry={() => void types.refetch()} />
        ) : (
          <p role="status">Loading…</p>
        )}
      </RecordDialog>
    );
  const options = types.data.map((t) => ({ value: t.id, label: t.name }));
  if (transaction && !options.some((o) => o.value === transaction.typeId))
    options.push({
      value: transaction.typeId,
      label: `${transaction.type.name} (historical type)`,
    });
  const fields: FormField[] = [
    { name: 'title', label: 'Transaction title', required: true, max: 180 },
    { name: 'typeId', label: 'Transaction type', type: 'select', required: true, options },
    {
      name: 'requestedAmount',
      label: 'Requested amount (PHP)',
      type: 'number',
      required: true,
      hint: 'Positive amount, at most two decimal places.',
    },
    { name: 'transactionDate', label: 'Transaction date', type: 'date', required: true },
    { name: 'description', label: 'Description', type: 'textarea', max: 4000 },
    { name: 'notes', label: 'Supporting notes', type: 'textarea', max: 4000 },
  ];
  return (
    <RecordForm
      title={transaction ? 'Edit transaction request' : 'Create transaction request'}
      fields={fields}
      initial={
        transaction
          ? {
              title: transaction.title,
              typeId: transaction.typeId,
              requestedAmount: transaction.requestedAmount,
              transactionDate: transaction.transactionDate.slice(0, 10),
              description: transaction.description ?? '',
              notes: transaction.notes ?? '',
            }
          : {}
      }
      onClose={onClose}
      onSave={async (values) => {
        await save.mutateAsync(values);
        onSaved();
      }}
    />
  );
}

export function TransactionTypeManager({ onClose }: { onClose: () => void }) {
  const types = useLookup('transaction-types', true, true);
  const [editing, setEditing] = useState<
    { id: string; name: string; active?: boolean } | 'new' | null
  >(null);
  const save = useCoreMutation((v: Record<string, string>) => {
    const data = { name: v.name, active: v.active === 'true' };
    return editing && editing !== 'new'
      ? api.patch(`/transaction-types/${editing.id}`, data)
      : api.post('/transaction-types', data);
  });
  if (editing)
    return (
      <RecordForm
        title={editing === 'new' ? 'Add transaction type' : 'Edit transaction type'}
        fields={[
          { name: 'name', label: 'Type name', required: true, max: 100 },
          {
            name: 'active',
            label: 'Availability',
            type: 'select',
            required: true,
            options: [
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ],
          },
        ]}
        initial={
          editing === 'new'
            ? { active: 'true' }
            : { name: editing.name, active: String(editing.active) }
        }
        onClose={() => setEditing(null)}
        onSave={async (values) => {
          await save.mutateAsync(values);
        }}
      />
    );
  return (
    <RecordDialog
      title="Transaction types"
      description="Maintain request categories. Historical requests retain their type."
      onClose={onClose}
    >
      <Button size="sm" onClick={() => setEditing('new')}>
        Add type
      </Button>
      {types.isError ? (
        <ErrorState message={types.error.message} retry={() => void types.refetch()} />
      ) : types.isPending ? (
        <p role="status">Loading types…</p>
      ) : (
        <ul className="data-list">
          {types.data.map((type) => (
            <li key={type.id}>
              <span>
                {type.name}
                <small>{type.active ? 'Active' : 'Inactive'}</small>
              </span>
              <Button size="sm" variant="ghost" onClick={() => setEditing(type)}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}
    </RecordDialog>
  );
}
