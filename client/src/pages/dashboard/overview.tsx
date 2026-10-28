import { lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import {
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  CheckCheck,
  Circle,
  Clock3,
  FolderKanban,
  Layers3,
  ListTodo,
  UsersRound,
  Wallet,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/shared/feedback';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/services/api';
import { currency } from '@/lib/utils';
import type { OverviewData } from '@/types/api';

const BudgetPlot = lazy(() => import('@/components/dashboard/budget-plot'));

function BudgetChart({ data, code }: { data: OverviewData['budgetSeries']; code: string }) {
  if (!data.length)
    return (
      <div className="budget-empty">
        <div className="chart-scale" aria-hidden="true">
          <span>₱ 100k</span>
          <span>₱ 75k</span>
          <span>₱ 50k</span>
          <span>₱ 25k</span>
          <span>₱ 0</span>
        </div>
        <div className="chart-grid" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="chart-empty-message">
          <Wallet size={22} strokeWidth={1.4} />
          <strong>Your financial picture starts here</strong>
          <span>Budget and expense data will appear with your projects.</span>
        </div>
        <div className="chart-axis" aria-hidden="true">
          <span>Jan</span>
          <span>Feb</span>
          <span>Mar</span>
          <span>Apr</span>
          <span>May</span>
          <span>Jun</span>
        </div>
        <span className="chart-empty-label">Illustrative scale · No data</span>
      </div>
    );
  return (
    <Suspense
      fallback={
        <div className="budget-live" role="status">
          Loading chart…
        </div>
      }
    >
      <BudgetPlot data={data} code={code} />
    </Suspense>
  );
}

export function OverviewPage() {
  const { data: user } = useAuth();
  const overview = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<OverviewData>('/dashboard'),
  });
  if (overview.isPending)
    return (
      <div className="dashboard-skeleton" role="status" aria-label="Loading dashboard">
        <div />
        <div />
        <div />
      </div>
    );
  if (overview.isError)
    return <ErrorState message={overview.error.message} retry={() => void overview.refetch()} />;
  const data = overview.data;
  const date = new Intl.DateTimeFormat('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(new Date());
  const hour = Number(
    new Intl.DateTimeFormat('en', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Asia/Manila',
    }).format(new Date()),
  );
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const cards = [
    {
      title: 'Total Projects',
      value: data.metrics.totalProjects,
      icon: FolderKanban,
      caption: 'Across your workspace',
    },
    {
      title: 'Active Projects',
      value: data.metrics.activeProjects,
      icon: Layers3,
      caption: 'Currently in progress',
    },
    {
      title: 'Pending Tasks',
      value: data.metrics.pendingTasks,
      icon: ListTodo,
      caption: 'Waiting to be completed',
    },
    {
      title: 'Completed Projects',
      value: data.metrics.completedProjects,
      icon: CheckCheck,
      caption: 'Successfully delivered',
    },
    {
      title: 'Total Project Budget',
      value: currency(data.metrics.totalBudget, data.currency),
      icon: Wallet,
      caption: 'Allocated project budget',
    },
  ];
  return (
    <motion.div
      className="overview-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">
            <span className="status-dot" />
            WORKSPACE OVERVIEW
          </div>
          <h1>
            {greeting}, {user?.name.split(' ')[0]}
            <span className="greeting-period">.</span>
          </h1>
          <p>Here’s a clear view of your projects, people, and progress.</p>
        </div>
        <div className="heading-actions">
          <div className="date-chip">
            <CalendarDays size={15} />
            {date}
          </div>
          {user?.permissions.includes('projects:read') && (
            <Button asChild size="sm">
              <Link to="/projects">
                <FolderKanban size={15} />
                View projects
                <ArrowRight size={14} />
              </Link>
            </Button>
          )}
        </div>
      </div>
      <div className="kpi-grid">
        {cards.map((card) => (
          <Card className="kpi-card" key={card.title}>
            <div className="kpi-top">
              <span>{card.title}</span>
              <span className="kpi-icon">
                <card.icon size={17} strokeWidth={1.7} />
              </span>
            </div>
            <strong className="kpi-value">{card.value}</strong>
            <div className="kpi-caption">
              <span className="neutral-dash">—</span>
              {card.caption}
            </div>
          </Card>
        ))}
      </div>
      <div className="dashboard-workspace-grid">
        <Card className="activity-card">
          <CardHeader>
            <div>
              <CardTitle>Recent project activity</CardTitle>
              <p>The latest updates from your workspace</p>
            </div>
            <span className="card-header-icon">
              <Clock3 size={17} />
            </span>
          </CardHeader>
          {data.recentActivity.length ? (
            <ul className="data-list">
              {data.recentActivity.map((item) => (
                <li key={item.id}>
                  {item.description}
                  <time>{new Date(item.occurredAt).toLocaleDateString('en-PH')}</time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={FolderKanban}
              title="Your project story starts here"
              description="No project activity yet. Updates will appear as work begins."
            />
          )}
        </Card>
        <Card className="budget-card">
          <CardHeader>
            <div>
              <CardTitle>Budget vs expenses</CardTitle>
              <p>A clearer picture of project finances</p>
            </div>
            <span className="subtle-pill">{data.currency}</span>
          </CardHeader>
          <div className="budget-summary">
            <div>
              <span>
                <i className="legend-primary" />
                Total budget
              </span>
              <strong>{currency(data.metrics.totalBudget, data.currency)}</strong>
            </div>
            <div>
              <span>
                <i className="legend-muted" />
                Total expenses
              </span>
              <strong>
                {currency(
                  data.budgetSeries.reduce((sum, row) => sum + row.expenses, 0),
                  data.currency,
                )}
              </strong>
            </div>
            <span className="no-data-label">No financial data yet</span>
          </div>
          <BudgetChart data={data.budgetSeries} code={data.currency} />
        </Card>
        <Card className="workload-card">
          <CardHeader>
            <div>
              <CardTitle>Team workload</CardTitle>
              <p>A balanced view of your people</p>
            </div>
            <span className="card-header-icon">
              <UsersRound size={17} />
            </span>
          </CardHeader>
          {data.teamWorkload.length ? (
            <ul className="data-list">
              {data.teamWorkload.map((item) => (
                <li key={item.userId}>
                  {item.name}
                  <span>{item.assignedTasks} assigned</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={UsersRound}
              title="Great work is a team effort"
              description="Team assignments and capacity will be visible as projects get underway."
            />
          )}
        </Card>
        <Card className="deadlines-card">
          <CardHeader>
            <div>
              <CardTitle>Upcoming deadlines</CardTitle>
              <p>Keep your next steps in sight</p>
            </div>
            <span className="card-header-icon">
              <CalendarDays size={17} />
            </span>
          </CardHeader>
          {data.deadlines.length ? (
            <ul className="data-list">
              {data.deadlines.map((item) => (
                <li key={item.id}>
                  {item.title}
                  <time>{new Date(item.dueAt).toLocaleDateString('en-PH')}</time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="A clear calendar"
              description="Upcoming tasks and milestones will appear here once scheduled."
            />
          )}
        </Card>
        <Card className="status-card">
          <CardHeader>
            <div>
              <CardTitle>Project status overview</CardTitle>
              <p>Every project, at a glance</p>
            </div>
            <span className="subtle-pill">All projects</span>
          </CardHeader>
          <div className="status-breakdown">
            <div className="status-visual">
              <svg viewBox="0 0 200 200" className="status-ring" aria-hidden="true">
                <circle
                  cx="100"
                  cy="100"
                  r="79"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="16"
                />
                <circle
                  cx="100"
                  cy="100"
                  r="79"
                  fill="none"
                  stroke="var(--primary)"
                  strokeOpacity=".8"
                  strokeWidth="16"
                  strokeDasharray="3 494"
                  transform="rotate(-90 100 100)"
                />
              </svg>
              <div className="ring-label">
                <strong>{data.metrics.totalProjects}</strong>
                <span>Total projects</span>
              </div>
            </div>
            <div className="status-legend">
              {[
                { label: 'In progress', color: 'legend-primary' },
                { label: 'Completed', color: 'legend-neutral' },
                { label: 'On hold', color: 'legend-crimson' },
                { label: 'Not started', color: 'legend-muted' },
              ].map((status) => (
                <div key={status.label}>
                  <span className={status.color} />
                  <span>{status.label}</span>
                  <strong>
                    {data.projectStatus.find((row) => row.status === status.label)?.count ?? 0}
                  </strong>
                </div>
              ))}
            </div>
          </div>
          <div className="card-footnote">
            <Circle size={11} />
            No projects yet. Your portfolio starts here.
          </div>
        </Card>
      </div>
      <div className="dashboard-note">
        <span>
          <span className="status-dot" />
          Live workspace · No sample project data
        </span>
        <span>
          <ArrowDownRight size={13} />
          Made for what’s next.
        </span>
      </div>
    </motion.div>
  );
}
