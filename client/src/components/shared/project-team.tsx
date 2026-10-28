import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCoreMutation, useLookup } from '@/hooks/use-core';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { RecordDialog, RecordForm, RecordTable, ConfirmAction, StatusBadge, Notice } from './crud';
import { ErrorState } from './feedback';
import type { MemberRecord, PageResult, ProjectRecord } from '@/types/core';

export function ProjectTeam({ project, onClose }: { project: ProjectRecord; onClose: () => void }) {
  const [page, setPage] = useState(1),
    [adding, setAdding] = useState(false),
    [removing, setRemoving] = useState<MemberRecord | null>(null),
    [notice, setNotice] = useState('');
  const writable = !!project.canManage && !project.archivedAt;
  const employees = useLookup('employees', writable);
  const members = useQuery({
    queryKey: ['core', 'members', project.id, page],
    queryFn: () =>
      api.get<PageResult<MemberRecord>>(`/projects/${project.id}/members?page=${page}&pageSize=20`),
  });
  const add = useCoreMutation((values: Record<string, string>) =>
    api.post(`/projects/${project.id}/members`, values),
  );
  const remove = useCoreMutation((userId: string) =>
    api.delete(`/projects/${project.id}/members/${userId}`),
  );
  if (adding)
    return (
      <RecordForm
        title="Assign project member"
        fields={[
          {
            name: 'userId',
            label: 'Employee',
            type: 'select',
            required: true,
            options: employees.data?.map((r) => ({ value: r.id, label: r.name })) ?? [],
          },
          { name: 'role', label: 'Project responsibility', required: true, max: 80 },
        ]}
        initial={{ role: 'Member' }}
        onClose={() => setAdding(false)}
        onSave={async (values) => {
          await add.mutateAsync(values);
          setNotice('Member assigned.');
        }}
      />
    );
  return (
    <RecordDialog title="Project team" description={project.name} onClose={onClose}>
      <Notice message={notice} dismiss={() => setNotice('')} />
      {writable && (
        <Button disabled={!employees.data} onClick={() => setAdding(true)}>
          Assign member
        </Button>
      )}
      {employees.isError && (
        <ErrorState message={employees.error.message} retry={() => void employees.refetch()} />
      )}
      {members.isError ? (
        <ErrorState message={members.error.message} retry={() => void members.refetch()} />
      ) : (
        <RecordTable
          data={members.data}
          loading={members.isPending}
          onPage={setPage}
          columns={[
            {
              label: 'Member',
              render: (r) => (
                <div>
                  <strong>{r.user.name}</strong>
                  <small>{r.user.email}</small>
                </div>
              ),
            },
            { label: 'Responsibility', render: (r) => r.role },
            { label: 'Account', render: (r) => <StatusBadge value={r.user.status} /> },
            {
              label: 'Actions',
              render: (r) =>
                writable && r.userId !== project.managerId ? (
                  <Button size="sm" variant="outline" onClick={() => setRemoving(r)}>
                    Remove
                  </Button>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      )}
      {removing && (
        <ConfirmAction
          title={`Remove ${removing.user.name}?`}
          description="Reassign or unassign unfinished tasks first. Completed task history will be retained."
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await remove.mutateAsync(removing.userId);
            setNotice('Member removed.');
          }}
        />
      )}
    </RecordDialog>
  );
}
