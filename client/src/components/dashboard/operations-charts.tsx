import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import FinanceCharts from './finance-charts';
import { operationLabel } from '@/lib/operations';
import type { OverviewData } from '@/types/api';
export default function OperationsCharts({ data }: { data: OverviewData['operations'] }) {
  const milestones = data.milestoneStatus.map((m) => ({ ...m, name: operationLabel(m.status) }));
  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Milestone completion overview</CardTitle>
            <p>Current milestones in authorized projects</p>
          </div>
        </CardHeader>
        {milestones.some((m) => m.count) ? (
          <div className="finance-chart">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={milestones} margin={{ right: 20 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  stroke="var(--text-muted)"
                  interval={0}
                />
                <YAxis
                  allowDecimals={false}
                  width={30}
                  tick={{ fontSize: 10 }}
                  stroke="var(--text-muted)"
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    borderColor: 'var(--border)',
                    color: 'var(--foreground)',
                  }}
                />
                <Bar
                  dataKey="count"
                  name="Milestones"
                  fill="var(--primary)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="chart-no-data">No current milestones are recorded in your projects.</p>
        )}
      </Card>
      {data.financial && <FinanceCharts summary={data.financial} />}
    </>
  );
}
