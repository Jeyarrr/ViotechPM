import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { TaskRecord } from '@/types/core';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/crud';

export function TaskDetailsPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['core', 'task', id],
    queryFn: () => api.get<TaskRecord>(`/tasks/${id}`),
  });
  if (query.isPending) return <p role="status">Loading task…</p>;
  if (query.isError) return <p role="alert">{query.error.message}</p>;
  const task = query.data;
  return (
    <section>
      <Link to={`/tasks?projectId=${task.projectId}`}>Back to project tasks</Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{task.code}</span>
          <h1>{task.title}</h1>
          <p>{task.project.name}</p>
        </div>
        <StatusBadge value={task.status} />
      </div>
      <Card className="detail-panel">
        <p>{task.description || 'No description recorded.'}</p>
        <dl className="record-details">
          {[
            ['Assignee', task.assignee?.name ?? 'Unassigned'],
            ['Priority', task.priority],
            ['Due date', task.dueDate.slice(0, 10)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}
