import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCoreMutation, useLookup } from '@/hooks/use-core';
import { api } from '@/services/api';
import { RecordDialog, RecordForm, type FormField } from './crud';
import { ErrorState } from './feedback';
import { Button } from '@/components/ui/button';
import type { TaskRecord, MemberRecord, PageResult, MilestoneRecord } from '@/types/core';

import { taskStatuses, taskLabel } from '@/lib/tasks';
export function TaskEditor({
  task,
  projectId: initialProject,
  onClose,
  onSaved,
}: {
  task?: TaskRecord;
  projectId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState(task?.projectId ?? initialProject ?? '');
  const projects = useLookup('projects', !projectId);
  const milestones = useQuery({
    queryKey: ['core', 'milestone-options', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const items: MilestoneRecord[] = [];
      let page = 1,
        pages = 1;
      do {
        const result = await api.get<PageResult<MilestoneRecord>>(
          `/milestones?projectId=${projectId}&page=${page}&pageSize=100`,
        );
        items.push(...result.items);
        pages = result.pages;
        page++;
      } while (page <= pages);
      return items;
    },
  });
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
    task ? api.patch(`/tasks/${task.id}`, values) : api.post('/tasks', { ...values, projectId }),
  );
  if (!projectId)
    return (
      <RecordDialog
        title="Choose a project"
        description="Select the project for this task."
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
  if (!members.data || !milestones.data)
    return (
      <RecordDialog title="Task" description="Loading eligible project members." onClose={onClose}>
        {members.isError || milestones.isError ? (
          <ErrorState
            message={
              members.error?.message ?? milestones.error?.message ?? 'Unable to load task options.'
            }
            retry={() => {
              void members.refetch();
              void milestones.refetch();
            }}
          />
        ) : (
          <p role="status">Loading…</p>
        )}
      </RecordDialog>
    );
  const assignees = members.data
    .filter((r) => r.user.status === 'ACTIVE')
    .map((r) => ({ value: r.userId, label: r.user.name }));
  if (task?.assignee && !assignees.some((r) => r.value === task.assigneeId))
    assignees.push({
      value: task.assignee.id,
      label: `${task.assignee.name} (historical assignment)`,
    });
  const fields: FormField[] = [
    { name: 'code', label: 'Task code', required: true, max: 40 },
    { name: 'title', label: 'Task title', required: true, max: 180 },
    {
      name: 'milestoneId',
      label: 'Milestone',
      type: 'select',
      options: [
        ...milestones.data.map((m) => ({ value: m.id, label: m.title })),
        ...(task?.milestone && !milestones.data.some((m) => m.id === task.milestoneId)
          ? [{ value: task.milestone.id, label: `${task.milestone.title} (archived)` }]
          : []),
      ],
      hint: 'Optional. Link this task to a deliverable in the same project.',
    },
    {
      name: 'assigneeId',
      label: 'Assignee',
      type: 'select',
      options: assignees,
      hint: 'Leave blank to keep the task unassigned.',
    },
    {
      name: 'priority',
      label: 'Priority',
      type: 'select',
      required: true,
      options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((v) => ({
        value: v,
        label: taskLabel(v),
      })),
    },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      options: taskStatuses.map((v) => ({ value: v, label: taskLabel(v) })),
    },
    { name: 'startDate', label: 'Start date', type: 'date', required: true },
    { name: 'dueDate', label: 'Due date', type: 'date', required: true },
    { name: 'description', label: 'Description', type: 'textarea', max: 4000 },
  ];
  return (
    <RecordForm
      title={task ? 'Edit task' : 'Add task'}
      fields={fields}
      initial={
        task
          ? {
              code: task.code,
              title: task.title,
              milestoneId: task.milestoneId ?? '',
              assigneeId: task.assigneeId ?? '',
              priority: task.priority,
              status: task.status,
              startDate: task.startDate.slice(0, 10),
              dueDate: task.dueDate.slice(0, 10),
              description: task.description ?? '',
            }
          : { status: 'TODO', priority: 'MEDIUM' }
      }
      onClose={onClose}
      onSave={async (values) => {
        await save.mutateAsync(values);
        onSaved();
      }}
    />
  );
}
