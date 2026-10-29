import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from './feedback';
import { Notice, StatusBadge } from './crud';
import { MilestoneEditor } from './milestone-editor';
import type { MilestoneRecord, PageResult, ProjectRecord } from '@/types/core';

export function ProjectMilestones({ project }: { project: ProjectRecord }) {
  const [adding, setAdding] = useState(false),
    [notice, setNotice] = useState('');
  const list = useQuery({
    queryKey: ['core', 'project-milestones', project.id],
    queryFn: () =>
      api.get<PageResult<MilestoneRecord>>(`/milestones?projectId=${project.id}&pageSize=5`),
  });
  return (
    <Card className="detail-panel">
      <h2 className="card-title">Project milestones</h2>
      <Notice message={notice} dismiss={() => setNotice('')} />
      <div className="row-actions">
        <Button asChild variant="outline" size="sm">
          <Link to={`/milestones?projectId=${project.id}`}>View all milestones</Link>
        </Button>
        {project.canManage && !project.archivedAt && (
          <Button size="sm" onClick={() => setAdding(true)}>
            Add milestone
          </Button>
        )}
      </div>
      {list.isError ? (
        <ErrorState message={list.error.message} retry={() => void list.refetch()} />
      ) : list.isPending ? (
        <p className="field-hint" role="status">
          Loading milestones…
        </p>
      ) : list.data.items.length ? (
        <ul className="data-list">
          {list.data.items.map((m) => (
            <li key={m.id}>
              <span>
                <Link className="record-link" to={`/milestones/${m.id}`}>
                  {m.title}
                </Link>
                <small>
                  {m.dueDate.slice(0, 10)} · {m.progress}%{m.overdue ? ' · Overdue' : ''}
                </small>
              </span>
              <StatusBadge value={m.status} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">No current milestones recorded.</p>
      )}
      {adding && (
        <MilestoneEditor
          projectId={project.id}
          onClose={() => setAdding(false)}
          onSaved={() => setNotice('Milestone saved.')}
        />
      )}
    </Card>
  );
}
