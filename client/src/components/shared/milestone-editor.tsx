import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCoreMutation, useLookup } from '@/hooks/use-core';
import { api } from '@/services/api';
import { RecordDialog, RecordForm, type FormField } from './crud';
import { ErrorState } from './feedback';
import { Button } from '@/components/ui/button';
import { milestoneStatuses, milestoneLabel } from '@/lib/milestones';
import type { MilestoneRecord, MemberRecord, PageResult } from '@/types/core';

export function MilestoneEditor({
  milestone,
  projectId: initialProject,
  onClose,
  onSaved,
}: {
  milestone?: MilestoneRecord;
  projectId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState(milestone?.projectId ?? initialProject ?? '');
  const projects = useLookup('projects', !projectId);
  const members = useQuery({
    queryKey: ['core', 'member-options', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const items: MemberRecord[] = [];
      let page = 1,
        pages = 1;
      do {
        const result = await api.get<PageResult<MemberRecord>>(
          `/projects/${projectId}/members?page=${page}&pageSize=100`,
        );
        items.push(...result.items);
        pages = result.pages;
        page++;
      } while (page <= pages);
      return items;
    },
  });
  const save = useCoreMutation((values: Record<string, string>) =>
    milestone
      ? api.patch(`/milestones/${milestone.id}`, values)
      : api.post('/milestones', { ...values, projectId }),
  );
  if (!projectId)
    return (
      <RecordDialog
        title="Choose a project"
        description="Select the project for this milestone."
        onClose={onClose}
      >
        {projects.isError ? (
          <ErrorState message={projects.error.message} retry={() => void projects.refetch()} />
        ) : (
          <div className="project-picker">
            {projects.data?.map((p) => (
              <Button key={p.id} variant="outline" onClick={() => setProjectId(p.id)}>
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
  if (!members.data)
    return (
      <RecordDialog
        title="Milestone"
        description="Loading eligible project members."
        onClose={onClose}
      >
        {members.isError ? (
          <ErrorState message={members.error.message} retry={() => void members.refetch()} />
        ) : (
          <p role="status">Loading…</p>
        )}
      </RecordDialog>
    );
  const options = members.data
    .filter((m) => m.user.status === 'ACTIVE')
    .map((m) => ({ value: m.userId, label: m.user.name }));
  if (milestone?.responsible && !options.some((m) => m.value === milestone.responsibleId))
    options.push({
      value: milestone.responsible.id,
      label: `${milestone.responsible.name} (historical assignment)`,
    });
  const fields: FormField[] = [
    { name: 'title', label: 'Milestone title', required: true, max: 180 },
    {
      name: 'responsibleId',
      label: 'Responsible employee',
      type: 'select',
      options,
      hint: 'Leave blank to keep responsibility unassigned.',
    },
    { name: 'startDate', label: 'Start date', type: 'date', required: true },
    { name: 'dueDate', label: 'Due date', type: 'date', required: true },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      options: milestoneStatuses.map((s) => ({ value: s, label: milestoneLabel(s) })),
    },
    {
      name: 'priority',
      label: 'Priority',
      type: 'select',
      required: true,
      options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => ({
        value: s,
        label: milestoneLabel(s),
      })),
    },
    {
      name: 'displayOrder',
      label: 'Display order',
      type: 'number',
      required: true,
      hint: 'Whole number, 0 or greater.',
    },
    { name: 'description', label: 'Description', type: 'textarea', max: 4000 },
  ];
  return (
    <RecordForm
      title={milestone ? 'Edit milestone' : 'Add milestone'}
      fields={fields}
      initial={
        milestone
          ? {
              title: milestone.title,
              responsibleId: milestone.responsibleId ?? '',
              startDate: milestone.startDate.slice(0, 10),
              dueDate: milestone.dueDate.slice(0, 10),
              status: milestone.status,
              priority: milestone.priority,
              displayOrder: String(milestone.displayOrder),
              description: milestone.description ?? '',
            }
          : { status: 'NOT_STARTED', priority: 'MEDIUM', displayOrder: '0' }
      }
      onClose={onClose}
      onSave={async (values) => {
        await save.mutateAsync(values);
        onSaved();
      }}
    />
  );
}
