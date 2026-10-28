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

// Loaded only when future modules supply real financial data.
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
          <XAxis dataKey="month" stroke="var(--text-muted)" />
          <YAxis
            stroke="var(--text-muted)"
            tickFormatter={(value: number) => currency(value, code)}
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
            stroke="var(--chart-budget)"
            fill="var(--chart-budget)"
            fillOpacity={0.12}
          />
          <Area
            type="monotone"
            dataKey="expenses"
            stroke="var(--chart-expenses)"
            fill="var(--chart-expenses)"
            fillOpacity={0.04}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
