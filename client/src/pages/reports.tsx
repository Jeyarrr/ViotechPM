import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useLookup, queryString } from '@/hooks/use-core';
import { api } from '@/services/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RecordTable } from '@/components/shared/crud';
import { ErrorState } from '@/components/shared/feedback';
import { CsvExport } from '@/components/shared/csv-export';
import { transactionStatuses, operationLabel } from '@/lib/operations';
import type { PageResult } from '@/types/core';

type Kind = 'milestones' | 'transactions' | 'expenses';
export function ReportsPage() {
  const [kind, setKind] = useState<Kind>('milestones');
  const [filters, setFilters] = useState({
    q: '',
    projectId: '',
    dateFrom: '',
    dateTo: '',
    status: '',
    category: '',
    clientId: '',
    typeId: '',
    page: 1,
    pageSize: 20,
  });
  const projects = useLookup('projects'),
    clients = useLookup('clients'),
    types = useLookup('transaction-types');
  const queryFilters = {
    q: filters.q,
    projectId: filters.projectId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    page: filters.page,
    pageSize: filters.pageSize,
    ...(kind !== 'expenses'
      ? { status: filters.status }
      : { category: filters.category, clientId: filters.clientId }),
    ...(kind === 'transactions' ? { typeId: filters.typeId } : {}),
  };
  const query = useQuery({
    queryKey: ['core', 'report', kind, queryFilters],
    queryFn: () =>
      api.get<PageResult<Record<string, string> & { id: string }> & { columns: string[] }>(
        `/reports/${kind}?${queryString(queryFilters)}`,
      ),
  });
  const update = (key: string, value: string) =>
    setFilters((v) => ({ ...v, [key]: value, page: 1 }));
  return (
    <div className="crud-page">
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">OPERATIONAL REPORTING</div>
          <h1>Reports & analytics</h1>
          <p>Review authorized records and export the same filters to CSV.</p>
        </div>
        <CsvExport kind={kind} filters={queryFilters} />
      </div>
      <div className="operation-tabs" aria-label="Report type">
        {(['milestones', 'transactions', 'expenses'] as const).map((type) => (
          <Button
            key={type}
            variant={kind === type ? 'default' : 'outline'}
            size="sm"
            aria-pressed={kind === type}
            onClick={() => {
              setKind(type);
              setFilters((v) => ({ ...v, status: '', page: 1 }));
            }}
          >
            {operationLabel(type)}
          </Button>
        ))}
      </div>
      <Card>
        <div className="crud-toolbar">
          <input
            className="input crud-search"
            aria-label="Search report"
            placeholder="Search report records…"
            value={filters.q}
            onChange={(e) => update('q', e.target.value)}
          />
          <select
            className="input"
            aria-label="Report project"
            value={filters.projectId}
            onChange={(e) => update('projectId', e.target.value)}
          >
            <option value="">All authorized projects</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {kind !== 'expenses' && (
            <select
              className="input"
              aria-label="Report status"
              value={filters.status}
              onChange={(e) => update('status', e.target.value)}
            >
              <option value="">All statuses</option>
              {(kind === 'milestones'
                ? ['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'DELAYED']
                : transactionStatuses
              ).map((s) => (
                <option key={s} value={s}>
                  {operationLabel(s)}
                </option>
              ))}
            </select>
          )}
          {kind === 'transactions' && (
            <select
              className="input"
              aria-label="Report transaction type"
              value={filters.typeId}
              onChange={(e) => update('typeId', e.target.value)}
            >
              <option value="">All request types</option>
              {types.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {kind === 'expenses' && (
            <>
              <input
                className="input"
                aria-label="Report expense category"
                placeholder="Exact expense category"
                value={filters.category}
                onChange={(e) => update('category', e.target.value)}
              />
              <select
                className="input"
                aria-label="Report client"
                value={filters.clientId}
                onChange={(e) => update('clientId', e.target.value)}
              >
                <option value="">All clients</option>
                {clients.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <div className="toolbar-date">
            <label htmlFor="report-from">From</label>
            <input
              className="input"
              id="report-from"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => update('dateFrom', e.target.value)}
            />
          </div>
          <div className="toolbar-date">
            <label htmlFor="report-to">To</label>
            <input
              className="input"
              id="report-to"
              type="date"
              value={filters.dateTo}
              onChange={(e) => update('dateTo', e.target.value)}
            />
          </div>
        </div>
        <p className="report-note">
          Dates filter{' '}
          {kind === 'milestones'
            ? 'milestone due dates'
            : kind === 'transactions'
              ? 'transaction dates'
              : 'expense dates'}
          . CSV includes all matching rows, up to 10,000; formula-like values are protected for
          spreadsheet use. Amounts are PHP.
        </p>
        {query.isError ? (
          <ErrorState message={query.error.message} retry={() => void query.refetch()} />
        ) : (
          <RecordTable
            data={query.data}
            loading={query.isPending}
            onPage={(page) => setFilters((v) => ({ ...v, page }))}
            columns={
              query.data?.columns.map((label) => ({
                label,
                render: (row: Record<string, string> & { id: string }) => row[label] || '—',
              })) ?? []
            }
          />
        )}
      </Card>
      <Button asChild size="sm" variant="outline">
        <Link to="/expenses">Project financial summaries</Link>
      </Button>
    </div>
  );
}
