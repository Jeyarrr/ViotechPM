import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '@/services/api';
import { currency } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorState } from './feedback';
import type { BudgetNumbers } from '@/types/finance';
import type { ProjectRecord } from '@/types/core';
export function ProjectFinance({ project }: { project: ProjectRecord }) {
  const query = useQuery({
    queryKey: ['core', 'project-budget', project.id],
    enabled: !!project.canManage,
    queryFn: () => api.get<BudgetNumbers>(`/projects/${project.id}/budget-summary`),
  });
  if (!project.canManage) return null;
  return (
    <Card className="detail-panel">
      <h2 className="card-title">Budget & posted expenses</h2>
      {query.isError ? (
        <ErrorState message={query.error.message} retry={() => void query.refetch()} />
      ) : query.isPending ? (
        <p role="status">Loading project balances…</p>
      ) : (
        <dl className="record-details">
          {[
            [
              'Authorized budget',
              query.data.budget === null ? 'Not allocated' : currency(query.data.budget),
            ],
            ['Net expenses', currency(query.data.totalExpenses)],
            [
              'Remaining budget',
              query.data.remainingBudget === null
                ? 'Not allocated'
                : currency(query.data.remainingBudget),
            ],
            [
              'Utilization',
              query.data.utilization === null ? 'Not allocated' : `${query.data.utilization}%`,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <Button asChild variant="outline" size="sm">
        <Link to={`/expenses?projectId=${project.id}`}>View budget & expenses</Link>
      </Button>
    </Card>
  );
}
