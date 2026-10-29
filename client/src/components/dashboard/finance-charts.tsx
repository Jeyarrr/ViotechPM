import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { currency } from '@/lib/utils';
import type { ExpenseSummary } from '@/types/finance';

export default function FinanceCharts({ summary }: { summary: ExpenseSummary }) {
  const projects = summary.projects.items.map((p) => ({
    name: p.name,
    code: p.code,
    budget: p.budget === null ? 0 : Number(p.budget),
    expenses: Number(p.totalExpenses),
    utilization: p.utilization === null ? null : Number(p.utilization),
  }));
  const categories = summary.categories.map((c) => ({
    category: c.category,
    amount: Number(c.amount),
  }));
  const tooltip = {
    background: 'var(--surface)',
    color: 'var(--foreground)',
    border: '1px solid var(--input-border)',
    borderRadius: 6,
  };
  return (
    <div className="finance-chart-grid">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Budget vs expenses</CardTitle>
            <p>Lifetime balances for this breakdown page</p>
          </div>
        </CardHeader>
        {projects.length ? (
          <div className="finance-chart">
            <ResponsiveContainer width="100%" height={Math.max(220, projects.length * 44)}>
              <BarChart data={projects} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  stroke="var(--text-muted)"
                  tickFormatter={(n: number) => currency(n, 'PHP', true)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={95}
                  tick={{ fontSize: 10 }}
                  stroke="var(--text-muted)"
                  tickFormatter={(s: string) => (s.length > 14 ? `${s.slice(0, 13)}…` : s)}
                />
                <Tooltip formatter={(v) => currency(Number(v))} contentStyle={tooltip} />
                <Bar
                  dataKey="budget"
                  name="Allocated budget"
                  fill="var(--primary)"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="expenses"
                  name="Net posted expenses"
                  fill="var(--text-secondary)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="chart-no-data">No authorized projects match these filters.</p>
        )}
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Expenses by category</CardTitle>
            <p>Net ledger amounts matching the current filters</p>
          </div>
        </CardHeader>
        {categories.length ? (
          <div className="finance-chart">
            <ResponsiveContainer width="100%" height={Math.max(220, categories.length * 36)}>
              <BarChart data={categories} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[(n: number) => Math.min(0, n), (n: number) => Math.max(0, n)]}
                  tick={{ fontSize: 10 }}
                  stroke="var(--text-muted)"
                  tickFormatter={(n: number) => currency(n, 'PHP', true)}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={110}
                  tick={{ fontSize: 10 }}
                  stroke="var(--text-muted)"
                  tickFormatter={(s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s)}
                />
                <ReferenceLine x={0} stroke="var(--text-muted)" />
                <Tooltip formatter={(v) => currency(Number(v))} contentStyle={tooltip} />
                <Bar
                  dataKey="amount"
                  name="Net expenses"
                  fill="var(--primary)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="chart-no-data">No posted expenses match these filters.</p>
        )}
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Project budget utilization</CardTitle>
            <p>Allocated projects on this breakdown page</p>
          </div>
        </CardHeader>
        {projects.some((p) => p.utilization !== null) ? (
          <div className="finance-chart">
            <ResponsiveContainer width="100%" height={Math.max(220, projects.length * 36)}>
              <BarChart
                data={projects.filter((p) => p.utilization !== null)}
                layout="vertical"
                margin={{ left: 0, right: 20 }}
              >
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 'auto']}
                  tick={{ fontSize: 10 }}
                  stroke="var(--text-muted)"
                  tickFormatter={(n: number) => `${n}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={95}
                  tick={{ fontSize: 10 }}
                  stroke="var(--text-muted)"
                  tickFormatter={(s: string) => (s.length > 14 ? `${s.slice(0, 13)}…` : s)}
                />
                <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} contentStyle={tooltip} />
                <Bar
                  dataKey="utilization"
                  name="Utilization"
                  fill="var(--crimson)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="chart-no-data">Set project budgets to display utilization.</p>
        )}
      </Card>
    </div>
  );
}
