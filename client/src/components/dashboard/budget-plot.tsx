import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { currency } from '@/lib/utils';
import type { OverviewData } from '@/types/api';

// Loaded only when authorized projects have recorded budgets.
export default function BudgetPlot({
  data,
  code,
}: {
  data: OverviewData['budgetSeries'];
  code: string;
}) {
  return (
    <div className="budget-live">
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="month" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
          <YAxis
            stroke="var(--text-muted)"
            width={72}
            tick={{ fontSize: 11 }}
            tickFormatter={(value: number) => currency(value, code, true)}
          />
          <Tooltip
            formatter={(value) => currency(Number(value), code)}
            contentStyle={{
              background: 'var(--surface)',
              color: 'var(--foreground)',
              border: '1px solid var(--input-border)',
              borderRadius: 8,
            }}
          />
          <Area
            type="monotone"
            dataKey="budget"
            name="Allocated budget"
            dot={{ r: 4, fill: 'var(--chart-budget)' }}
            isAnimationActive={false}
            stroke="var(--chart-budget)"
            fill="var(--chart-budget)"
            fillOpacity={0.12}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
