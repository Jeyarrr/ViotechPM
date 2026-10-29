import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '@/services/api';
import { useLookup, queryString } from '@/hooks/use-core';
import { useAuth } from '@/hooks/use-auth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { currency } from '@/lib/utils';
import type { PageResult } from '@/types/core';

type Analytics = {
  asOf: string;
  health: {
    total: number;
    active: number;
    completed: number;
    overdue: number;
    upcoming: number;
    approachingBudget: number;
  };
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    overdue: number;
    priorities: { name: string; count: number }[];
    trend: { date: string; count: number }[];
  };
  milestones: {
    total: number;
    completed: number;
    overdue: number;
    upcoming: number;
    completionRate: number;
  };
  workload: PageResult<{
    id: string;
    name: string;
    assigned: number;
    inProgress: number;
    completed: number;
    overdue: number;
  }>;
  financial: {
    budget: string;
    totalExpenses: string;
    remainingBudget: string;
    utilization: string | null;
    projects: PageResult<{
      id: string;
      name: string;
      budget: string | null;
      totalExpenses: string;
      remainingBudget: string | null;
      utilization: string | null;
    }>;
  };
};
function AnalyticsChart({
  title,
  rows,
  nameKey = 'name',
}: {
  title: string;
  rows: { count: number; name?: string; date?: string }[];
  nameKey?: string;
}) {
  return (
    <Card className="detail-panel">
      <h3>{title}</h3>
      {rows.length ? (
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={rows}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey={nameKey} stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} stroke="var(--text-muted)" width={35} />
            <Tooltip
              contentStyle={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
            />
            <Bar dataKey="count" name="Tasks" fill="var(--primary)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="notification-empty">No records in this period.</p>
      )}
    </Card>
  );
}
export default function AdvancedAnalytics({ compact = false }: { compact?: boolean }) {
  const { data: user } = useAuth();
  const allowed = !!user?.permissions.includes('analytics:read');
  const [filters, setFilters] = useState({
    projectId: '',
    status: '',
    taskStatus: '',
    dateFrom: '',
    dateTo: '',
    page: 1,
  });
  const projects = useLookup('projects', allowed && !compact);
  const query = useQuery({
    queryKey: ['analytics', filters],
    queryFn: () => api.get<Analytics>(`/analytics?${queryString(filters)}`),
    enabled: allowed,
  });
  if (!allowed) return null;
  const change = (key: string, value: string) =>
    setFilters((previous) => ({ ...previous, [key]: value, page: 1 }));
  const data = query.data;
  return (
    <section className="advanced-analytics" aria-label="Operational analytics">
      <div className="notification-heading">
        <div>
          <h2>Operational analytics</h2>
          <p className="muted">Authorized project health and workload · Asia/Manila</p>
        </div>
        {compact && <Link to="/analytics">Explore analytics</Link>}
      </div>
      {!compact && (
        <div className="crud-toolbar">
          <label>
            Analytics project
            <select
              className="input"
              value={filters.projectId}
              onChange={(e) => change('projectId', e.target.value)}
            >
              <option value="">All authorized projects</option>
              {projects.data?.map((project) => (
                <option value={project.id} key={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project status
            <select
              className="input"
              value={filters.status}
              onChange={(e) => change('status', e.target.value)}
            >
              <option value="">All statuses</option>
              {['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Task status
            <select
              className="input"
              value={filters.taskStatus}
              onChange={(e) => change('taskStatus', e.target.value)}
            >
              <option value="">All task statuses</option>
              {['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BLOCKED'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Analytics from
            <input
              className="input"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => change('dateFrom', e.target.value)}
            />
          </label>
          <label>
            Analytics to
            <input
              className="input"
              type="date"
              value={filters.dateTo}
              onChange={(e) => change('dateTo', e.target.value)}
            />
          </label>
        </div>
      )}
      {query.isPending && <p role="status">Loading analytics…</p>}
      {query.isError && <p role="alert">{query.error.message}</p>}
      {data && (
        <>
          <div className="analytics-summary">
            {[
              ['Active projects', data.health.active],
              ['Completed projects', data.health.completed],
              ['Overdue projects', data.health.overdue],
              ['Upcoming projects', data.health.upcoming],
              ['Budget ≥ 80%', data.health.approachingBudget],
              ['Milestone completion', `${data.milestones.completionRate}%`],
            ].map(([label, value]) => (
              <Card className="detail-panel" key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </Card>
            ))}
          </div>
          {!compact && (
            <>
              <p className="muted">
                Date filters use project target dates and task/milestone due dates. Completion
                trends use completion dates (last 30 days by default).
              </p>
              <div className="analytics-summary">
                {[
                  ['Tasks', data.tasks.total],
                  ['Completed tasks', data.tasks.completed],
                  ['In-progress tasks', data.tasks.inProgress],
                  ['Overdue tasks', data.tasks.overdue],
                  ['Milestones', data.milestones.total],
                  ['Completed milestones', data.milestones.completed],
                  ['Overdue milestones', data.milestones.overdue],
                  ['Upcoming milestones', data.milestones.upcoming],
                ].map(([label, value]) => (
                  <Card className="detail-panel" key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </Card>
                ))}
              </div>
              <div className="analytics-charts">
                <AnalyticsChart title="Tasks by priority" rows={data.tasks.priorities} />
                <AnalyticsChart
                  title="Task completion trend"
                  rows={data.tasks.trend}
                  nameKey="date"
                />
              </div>
              <Card className="detail-panel">
                <h3>Team workload</h3>
                <p className="muted">
                  Descriptive task counts, not employee performance ratings. Unassigned tasks are
                  excluded.
                </p>
                <div className="analytics-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Team member</th>
                        <th>Assigned</th>
                        <th>In progress</th>
                        <th>Completed</th>
                        <th>Overdue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.workload.items.map((row) => (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td>{row.assigned}</td>
                          <td>{row.inProgress}</td>
                          <td>{row.completed}</td>
                          <td>{row.overdue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!data.workload.total && <p>No assigned tasks match these filters.</p>}
              </Card>
              <Card className="detail-panel">
                <h3>Financial overview</h3>
                <div className="analytics-summary">
                  {[
                    ['Authorized budgets', data.financial.budget],
                    ['Posted expenses', data.financial.totalExpenses],
                    ['Remaining budgets', data.financial.remainingBudget],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <small>{label}</small>
                      <strong>{currency(value)}</strong>
                    </div>
                  ))}
                </div>
                <p className="muted">
                  Utilization:{' '}
                  {data.financial.utilization === null
                    ? 'No allocated budget'
                    : `${data.financial.utilization}%`}
                  . Lifetime posted expenses, including reversals.
                </p>
                <ul className="data-list">
                  {data.financial.projects.items.map((project) => (
                    <li key={project.id}>
                      <Link to={`/projects/${project.id}`}>{project.name}</Link>
                      <span>
                        {project.utilization === null
                          ? 'No allocated budget'
                          : `${project.utilization}% used`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
              <div className="notification-heading">
                <Button
                  variant="outline"
                  disabled={filters.page <= 1}
                  onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                >
                  Previous summaries
                </Button>
                <span>Page {filters.page}</span>
                <Button
                  variant="outline"
                  disabled={
                    filters.page >= Math.max(data.workload.pages, data.financial.projects.pages)
                  }
                  onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                >
                  Next summaries
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
