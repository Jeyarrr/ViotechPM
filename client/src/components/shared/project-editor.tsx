import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useCoreMutation, useLookup } from '@/hooks/use-core';
import { api } from '@/services/api';
import type { Lookup, ProjectRecord } from '@/types/core';
import { RecordForm, RecordDialog, type FormField, StatusBadge } from './crud';
import { Button } from '@/components/ui/button';
import { ErrorState } from './feedback';

export function ProjectEditor({
  project,
  onClose,
  onSaved,
}: {
  project?: ProjectRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: user } = useAuth();
  const clients = useLookup('clients'),
    managers = useLookup('managers'),
    categories = useLookup('categories'),
    departments = useLookup('departments');
  const save = useCoreMutation((values: Record<string, string>) =>
    project ? api.patch(`/projects/${project.id}`, values) : api.post('/projects', values),
  );
  const options = (rows: Lookup[] | undefined, current?: Lookup | null) => {
    const all = [...(rows ?? [])];
    if (current && !all.some((row) => row.id === current.id)) all.push(current);
    return all.map((row) => ({
      value: row.id,
      label: row.code ? `${row.code} · ${row.name}` : row.name,
    }));
  };
  const fields: FormField[] = [
    { name: 'code', label: 'Project code', required: true, max: 40 },
    { name: 'name', label: 'Project name', required: true, max: 180 },
    {
      name: 'clientId',
      label: 'Client',
      type: 'select',
      required: true,
      options: options(clients.data, project?.client),
    },
    {
      name: 'categoryId',
      label: 'Category',
      type: 'select',
      required: true,
      options: options(categories.data, project?.category),
    },
    {
      name: 'managerId',
      label: 'Project manager',
      type: 'select',
      required: true,
      options: options(managers.data, project?.manager),
    },
    {
      name: 'departmentId',
      label: 'Department',
      type: 'select',
      options: options(departments.data, project?.department),
    },
    { name: 'startDate', label: 'Start date', type: 'date', required: true },
    { name: 'targetDate', label: 'Target completion date', type: 'date', required: true },
    {
      name: 'budget',
      label: 'Project budget (PHP)',
      type: 'number',
      hint: 'Optional; up to two decimal places.',
    },
    {
      name: 'priority',
      label: 'Priority',
      type: 'select',
      required: true,
      options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => ({
        value,
        label: value.replaceAll('_', ' '),
      })),
    },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      options: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'].map((value) => ({
        value,
        label: value.replaceAll('_', ' '),
      })),
      hint: 'Completion requires at least one task and all current tasks completed.',
    },
    { name: 'description', label: 'Description', type: 'textarea', max: 4000 },
  ];
  const queries = [clients, managers, categories, departments];
  const failed = queries.find((query) => query.isError);
  if (failed || queries.some((query) => query.isPending))
    return (
      <RecordDialog
        title={project ? 'Edit project' : 'Add project'}
        description="Loading available clients, managers, and categories."
        onClose={onClose}
      >
        {failed ? (
          <ErrorState
            message={failed.error?.message ?? 'Unable to load options.'}
            retry={() => void Promise.all(queries.map((query) => query.refetch()))}
          />
        ) : (
          <div role="status" className="crud-loading">
            Loading project options…
          </div>
        )}
      </RecordDialog>
    );
  const initial = project
    ? Object.fromEntries(
        fields.map((field) => [
          field.name,
          String(project[field.name as keyof ProjectRecord] ?? '').slice(
            0,
            field.type === 'date' ? 10 : undefined,
          ),
        ]),
      )
    : { priority: 'MEDIUM', status: 'PLANNING', managerId: user?.id ?? '' };
  return (
    <RecordForm
      title={project ? 'Edit project' : 'Add project'}
      fields={fields}
      initial={initial}
      onClose={onClose}
      onSave={async (values) => {
        await save.mutateAsync(values);
        onSaved();
      }}
    />
  );
}

export function CategoryManager({ onClose }: { onClose: () => void }) {
  const categories = useLookup('categories', true, true);
  const [editing, setEditing] = useState<Lookup | 'new' | null>(null);
  const save = useCoreMutation((values: Record<string, string>) =>
    editing && editing !== 'new'
      ? api.patch(`/project-categories/${editing.id}`, {
          name: values.name,
          active: values.active === 'true',
        })
      : api.post('/project-categories', { name: values.name, active: values.active === 'true' }),
  );
  if (editing)
    return (
      <RecordForm
        title={editing === 'new' ? 'Add category' : 'Edit category'}
        fields={[
          { name: 'name', label: 'Category name', required: true, max: 120 },
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
        onSave={(values) => save.mutateAsync(values)}
      />
    );
  return (
    <RecordDialog
      title="Project categories"
      description="Configure service categories. Disabling a category preserves existing projects."
      onClose={onClose}
    >
      <Button size="sm" onClick={() => setEditing('new')}>
        Add category
      </Button>
      {categories.isError ? (
        <ErrorState message={categories.error.message} />
      ) : (
        <ul className="data-list">
          {categories.data?.map((category) => (
            <li key={category.id}>
              <span>{category.name}</span>
              <StatusBadge value={category.active ? 'ACTIVE' : 'INACTIVE'} />
              <Button size="sm" variant="ghost" onClick={() => setEditing(category)}>
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}
    </RecordDialog>
  );
}
