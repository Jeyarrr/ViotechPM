import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { queryString } from '@/hooks/use-core';
import { api } from '@/services/api';
import { currency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/shared/feedback';
import { RecordDialog, RecordTable, StatusBadge, Notice } from '@/components/shared/crud';
import { PostExpenseDialog, ReverseExpenseDialog } from '@/components/shared/expense-controls';
import { CsvExport } from '@/components/shared/csv-export';
import type { PageResult } from '@/types/core';
import type { ExpenseRecord, ExpenseSummary, FinanceOptions } from '@/types/finance';

const FinanceCharts = lazy(() => import('@/components/dashboard/finance-charts'));
export function ExpensesPage() {
  const [search] = useSearchParams();
  const [filters, setFilters] = useState({
    q: '',
    projectId: search.get('projectId') ?? '',
    clientId: '',
    category: '',
    dateFrom: '',
    dateTo: '',
    projectState: 'all',
    sort: 'expenseDate',
    direction: 'desc',
    page: 1,
    pageSize: 20,
    projectPage: 1,
  });
  const [posting, setPosting] = useState(false),
    [reversing, setReversing] = useState<ExpenseRecord | null>(null),
    [detail, setDetail] = useState<ExpenseRecord | null>(null),
    [notice, setNotice] = useState('');
  const options = useQuery({
    queryKey: ['core', 'finance-options'],
    queryFn: async () => {
      const projects: FinanceOptions['projects']['items'] = [];
      let categories: string[] = [],
        page = 1,
        pages = 1;
      do {
        const data = await api.get<FinanceOptions>(`/expenses/options?page=${page}&pageSize=100`);
        projects.push(...data.projects.items);
        categories = data.categories;
        pages = data.projects.pages;
        page++;
      } while (page <= pages);
      return { projects, categories };
    },
  });
  const list = useQuery({
    queryKey: ['core', 'expenses', filters],
    queryFn: () => api.get<PageResult<ExpenseRecord>>(`/expenses?${queryString(filters)}`),
  });
  const summary = useQuery({
    queryKey: ['core', 'expense-summary', filters],
    queryFn: () => api.get<ExpenseSummary>(`/expenses/summary?${queryString(filters)}`),
  });
  const update = (key: string, value: string) =>
    setFilters((v) => ({ ...v, [key]: value, page: 1, projectPage: 1 }));
  const clients = [
    ...new Map(options.data?.projects.map((p) => [p.client.id, p.client]) ?? []).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="crud-page">
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">PROJECT FINANCIAL CONTROL</div>
          <h1>Budget & expenses</h1>
          <p>Follow authorized allocations, posted costs, and recorded reversals.</p>
        </div>
        <div className="heading-actions">
          <CsvExport kind="expenses" filters={filters} />
          <Button onClick={() => setPosting(true)}>Post approved expense</Button>
        </div>
      </div>
      <Notice message={notice} dismiss={() => setNotice('')} />
      <Card>
        <div className="crud-toolbar">
          <input
            className="input crud-search"
            aria-label="Search expenses"
            placeholder="Search reference, description, or category…"
            value={filters.q}
            onChange={(e) => update('q', e.target.value)}
          />
          <select
            className="input"
            aria-label="Expense project filter"
            value={filters.projectId}
            onChange={(e) => update('projectId', e.target.value)}
          >
            <option value="">All authorized projects</option>
            {options.data?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archivedAt ? ' (archived)' : ''}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Expense client filter"
            value={filters.clientId}
            onChange={(e) => update('clientId', e.target.value)}
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Expense category filter"
            value={filters.category}
            onChange={(e) => update('category', e.target.value)}
          >
            <option value="">All expense categories</option>
            {options.data?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Financial project state"
            value={filters.projectState}
            onChange={(e) => update('projectState', e.target.value)}
          >
            <option value="all">Current + archived projects</option>
            <option value="current">Current projects</option>
            <option value="archived">Archived projects</option>
          </select>
          <div className="toolbar-date">
            <label htmlFor="expense-from">From</label>
            <input
              className="input"
              type="date"
              id="expense-from"
              value={filters.dateFrom}
              onChange={(e) => update('dateFrom', e.target.value)}
            />
          </div>
          <div className="toolbar-date">
            <label htmlFor="expense-to">To</label>
            <input
              className="input"
              type="date"
              id="expense-to"
              value={filters.dateTo}
              onChange={(e) => update('dateTo', e.target.value)}
            />
          </div>
          <select
            className="input"
            aria-label="Expense sort"
            value={filters.sort}
            onChange={(e) => update('sort', e.target.value)}
          >
            <option value="expenseDate">Expense date</option>
            <option value="createdAt">Recorded date</option>
            <option value="amount">Amount</option>
            <option value="category">Category</option>
          </select>
          <select
            className="input"
            aria-label="Expense sort direction"
            value={filters.direction}
            onChange={(e) => update('direction', e.target.value)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </Card>
      {options.isError && (
        <ErrorState message={options.error.message} retry={() => void options.refetch()} />
      )}
      {summary.isError ? (
        <ErrorState message={summary.error.message} retry={() => void summary.refetch()} />
      ) : summary.isPending ? (
        <div className="crud-loading" role="status">
          Loading financial summary…
        </div>
      ) : (
        <>
          <div className="finance-kpis">
            {[
              ['Total project budget', currency(summary.data.totals.budget ?? '0')],
              ['Net recorded expenses', currency(summary.data.totals.totalExpenses)],
              [
                'Remaining budget',
                summary.data.totals.remainingBudget === null
                  ? 'Not allocated'
                  : currency(summary.data.totals.remainingBudget),
              ],
              [
                'Budget utilization',
                summary.data.totals.utilization === null
                  ? 'Not allocated'
                  : `${summary.data.totals.utilization}%`,
              ],
              ['Filtered expenses', currency(summary.data.filteredExpenses)],
            ].map(([label, value]) => (
              <Card className="finance-kpi" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </Card>
            ))}
          </div>
          <p className="field-hint">
            Lifetime balances follow project, client, and archive filters. Search, dates, and
            category filters apply to ledger entries and filtered expenses.{' '}
            {summary.data.unbudgetedProjects} projects have no positive allocation.
          </p>
          <Suspense
            fallback={
              <div className="crud-loading" role="status">
                Loading financial charts…
              </div>
            }
          >
            <FinanceCharts summary={summary.data} />
          </Suspense>
          <Card>
            <div className="section-heading">
              <h2 className="card-title">Project budget breakdown</h2>
              <p className="field-hint">Lifetime posted balances · PHP</p>
            </div>
            <RecordTable
              data={summary.data.projects}
              onPage={(projectPage) => setFilters((v) => ({ ...v, projectPage }))}
              columns={[
                {
                  label: 'Project',
                  render: (p) => (
                    <Link className="record-link" to={`/projects/${p.id}`}>
                      <strong>{p.name}</strong>
                      <small>
                        {p.client.name}
                        {p.archivedAt ? ' · Archived' : ''}
                      </small>
                    </Link>
                  ),
                },
                {
                  label: 'Budget',
                  render: (p) => (p.budget === null ? 'Not allocated' : currency(p.budget)),
                },
                { label: 'Expenses', render: (p) => currency(p.totalExpenses) },
                {
                  label: 'Remaining',
                  render: (p) =>
                    p.remainingBudget === null ? 'Not allocated' : currency(p.remainingBudget),
                },
                {
                  label: 'Utilization',
                  render: (p) => (p.utilization === null ? 'Not allocated' : `${p.utilization}%`),
                },
              ]}
            />
          </Card>
        </>
      )}
      <Card>
        <div className="section-heading">
          <h2 className="card-title">Expense ledger</h2>
          <p className="field-hint">Original postings and exact reversals are retained.</p>
        </div>
        {list.isError ? (
          <ErrorState message={list.error.message} retry={() => void list.refetch()} />
        ) : (
          <RecordTable
            data={list.data}
            loading={list.isPending}
            onPage={(page) => setFilters((v) => ({ ...v, page }))}
            columns={[
              {
                label: 'Reference / Description',
                render: (e) => (
                  <div>
                    <strong>
                      {e.transaction?.reference ??
                        e.reversalOf?.transaction?.reference ??
                        e.id.slice(0, 8)}
                    </strong>
                    <small>{e.description}</small>
                  </div>
                ),
              },
              {
                label: 'Project / Category',
                render: (e) => (
                  <div>
                    {e.project.name}
                    <small>{e.category}</small>
                  </div>
                ),
              },
              { label: 'Amount', render: (e) => currency(e.amount) },
              { label: 'Date', render: (e) => e.expenseDate.slice(0, 10) },
              {
                label: 'Entry',
                render: (e) => <StatusBadge value={e.reversedBy ? 'REVERSED' : e.kind} />,
              },
              { label: 'Recorded by', render: (e) => e.recordedBy.name },
              {
                label: 'Actions',
                render: (e) => (
                  <div className="row-actions">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(e)}>
                      View
                    </Button>
                    {e.canReverse && (
                      <Button size="sm" variant="outline" onClick={() => setReversing(e)}>
                        Reverse
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
      {posting && (
        <PostExpenseDialog
          onClose={() => setPosting(false)}
          onSaved={() => setNotice('Approved expense posted.')}
        />
      )}
      {reversing && (
        <ReverseExpenseDialog
          expense={reversing}
          onClose={() => setReversing(null)}
          onSaved={() => {
            setNotice('Reversal recorded. The original expense is preserved.');
          }}
        />
      )}
      {detail && (
        <RecordDialog
          title="Expense entry"
          description={detail.project.name}
          onClose={() => setDetail(null)}
        >
          <dl className="record-details">
            {[
              ['Entry ID', detail.id],
              ['Category', detail.category],
              ['Description', detail.description],
              ['Amount', currency(detail.amount)],
              ['Entry type', detail.kind],
              ['Expense date', detail.expenseDate.slice(0, 10)],
              ['Recorded by', detail.recordedBy.name],
              ['Recorded at', new Date(detail.createdAt).toLocaleString('en-PH')],
              [
                'Reversal reason',
                detail.reversalReason ?? detail.reversedBy?.reversalReason ?? 'Not applicable',
              ],
              [
                'Reversal reference',
                detail.reversalOfId ?? detail.reversedBy?.id ?? 'Not applicable',
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {(detail.transaction || detail.reversalOf?.transaction) && (
            <Button asChild variant="outline" size="sm">
              <Link
                to={`/transactions/${detail.transaction?.id ?? detail.reversalOf?.transaction?.id}`}
              >
                View transaction history
              </Link>
            </Button>
          )}
        </RecordDialog>
      )}
    </div>
  );
}
