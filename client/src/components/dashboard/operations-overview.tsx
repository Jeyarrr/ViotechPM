import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { currency } from '@/lib/utils';
import { operationLabel } from '@/lib/operations';
import type { OverviewData, DashboardMilestone } from '@/types/api';

const OperationsCharts = lazy(() => import('./operations-charts'));
type Operations = OverviewData['operations'];
export function OperationsKpis({ data }: { data: Operations }) {
  return (
    <div className="operations-kpis">
      <Card className="finance-kpi">
        <span>Pending Approvals</span>
        <strong>{data.pendingCount}</strong>
        <p className="field-hint">Current stages assigned to you</p>
      </Card>
      {data.financial && (
        <Card className="finance-kpi">
          <span>Total Expenses</span>
          <strong>{currency(data.financial.totals.totalExpenses)}</strong>
          <p className="field-hint">Net costs · current managed projects</p>
        </Card>
      )}
      <Card className="finance-kpi">
        <span>Upcoming Milestones</span>
        <strong>{data.upcomingCount}</strong>
        <p className="field-hint">Unfinished deliverables · next 30 days</p>
      </Card>
    </div>
  );
}
function MilestonesWidget({ title, items }: { title: string; items: DashboardMilestone[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {items.length ? (
        <ul className="operation-widget-list">
          {items.map((m) => (
            <li key={m.id}>
              <Link className="record-link" to={`/milestones/${m.id}`}>
                {m.title}
              </Link>
              <span>
                {m.project.name} · {m.dueDate.slice(0, 10)}
              </span>
              <small>
                {m.responsible?.name ?? 'Unassigned'} · {operationLabel(m.status)}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="chart-no-data">No {title.toLowerCase()} in your current projects.</p>
      )}
    </Card>
  );
}
export function OperationsOverview({ data }: { data: Operations }) {
  return (
    <>
      <Suspense
        fallback={
          <p role="status" className="field-hint">
            Loading operations charts…
          </p>
        }
      >
        <OperationsCharts data={data} />
      </Suspense>
      <div className="operations-widgets">
        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
          </CardHeader>
          {data.recentTransactions.length ? (
            <ul className="operation-widget-list">
              {data.recentTransactions.map((t) => (
                <li key={t.id}>
                  <Link className="record-link" to={`/transactions/${t.id}`}>
                    {t.reference}
                  </Link>
                  <span>
                    {t.title} · {currency(t.requestedAmount)}
                  </span>
                  <small>
                    {t.project.name} · {operationLabel(t.status)}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="chart-no-data">No authorized transactions in current projects.</p>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pending approvals</CardTitle>
          </CardHeader>
          {data.pendingApprovals.length ? (
            <ul className="operation-widget-list">
              {data.pendingApprovals.map((t) => (
                <li key={t.id}>
                  <Link className="record-link" to={`/transactions/${t.id}`}>
                    {t.reference}
                  </Link>
                  <span>
                    {t.requester.name} · {currency(t.requestedAmount)}
                  </span>
                  <small>{t.project.name}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="chart-no-data">No current review stages assigned to you.</p>
          )}
        </Card>
        <MilestonesWidget title="Upcoming milestones" items={data.upcoming} />
        <MilestonesWidget title="Overdue milestones" items={data.overdue} />
      </div>
    </>
  );
}
