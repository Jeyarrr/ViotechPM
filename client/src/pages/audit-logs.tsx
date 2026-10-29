import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryString } from '@/hooks/use-core';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RecordTable, RecordDialog } from '@/components/shared/crud';
import { ErrorState } from '@/components/shared/feedback';
import type { PageResult, Lookup } from '@/types/core';
interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  timestamp: string;
  metadata: unknown;
  actor: Lookup | null;
  project: (Lookup & { code: string }) | null;
}
export function AuditLogsPage() {
  const [filters, setFilters] = useState({
      q: '',
      actorId: '',
      action: '',
      projectId: '',
      dateFrom: '',
      dateTo: '',
      page: 1,
      pageSize: 20,
    }),
    [detail, setDetail] = useState<AuditEvent | null>(null);
  const options = useQuery({
    queryKey: ['core', 'audit-options'],
    queryFn: async () => {
      const actors: Lookup[] = [];
      const projects: (Lookup & { archivedAt: string | null })[] = [];
      let actions: string[] = [],
        page = 1,
        pages = 1;
      do {
        const r = await api.get<{
          actors: PageResult<Lookup>;
          actions: string[];
          projects: PageResult<Lookup & { archivedAt: string | null }>;
        }>(`/audit-logs/options?page=${page}&pageSize=100`);
        actors.push(...r.actors.items);
        projects.push(...r.projects.items);
        actions = r.actions;
        pages = Math.max(r.actors.pages, r.projects.pages);
        page++;
      } while (page <= pages);
      return { actors, actions, projects };
    },
  });
  const query = useQuery({
    queryKey: ['core', 'audit-logs', filters],
    queryFn: () => api.get<PageResult<AuditEvent>>(`/audit-logs?${queryString(filters)}`),
  });
  const update = (key: string, value: string) =>
    setFilters((v) => ({ ...v, [key]: value, page: 1 }));
  return (
    <div className="crud-page">
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">ACCOUNTABILITY & HISTORY</div>
          <h1>Audit logs</h1>
          <p>Read recorded activity within your authorized management scope.</p>
        </div>
      </div>
      {options.isError && (
        <ErrorState message={options.error.message} retry={() => void options.refetch()} />
      )}
      <Card>
        <div className="crud-toolbar">
          <input
            className="input crud-search"
            aria-label="Search audit logs"
            placeholder="Search event, actor, project, or entity…"
            value={filters.q}
            onChange={(e) => update('q', e.target.value)}
          />
          <select
            className="input"
            aria-label="Audit actor"
            value={filters.actorId}
            onChange={(e) => update('actorId', e.target.value)}
          >
            <option value="">All actors</option>
            {options.data?.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Audit event"
            value={filters.action}
            onChange={(e) => update('action', e.target.value)}
          >
            <option value="">All event types</option>
            {options.data?.actions.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Audit project"
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
          <div className="toolbar-date">
            <label htmlFor="audit-from">From</label>
            <input
              className="input"
              type="date"
              id="audit-from"
              value={filters.dateFrom}
              onChange={(e) => update('dateFrom', e.target.value)}
            />
          </div>
          <div className="toolbar-date">
            <label htmlFor="audit-to">To</label>
            <input
              className="input"
              type="date"
              id="audit-to"
              value={filters.dateTo}
              onChange={(e) => update('dateTo', e.target.value)}
            />
          </div>
        </div>
        <p className="report-note">
          Date filters use Asia/Manila days. Audit records are read only. System, authentication and
          denied-access events are restricted to Super Admin.
        </p>
        {query.isError ? (
          <ErrorState message={query.error.message} retry={() => void query.refetch()} />
        ) : (
          <RecordTable
            data={query.data}
            loading={query.isPending}
            onPage={(page) => setFilters((v) => ({ ...v, page }))}
            columns={[
              {
                label: 'Timestamp',
                render: (e) =>
                  new Date(e.timestamp).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
              },
              { label: 'Actor', render: (e) => e.actor?.name ?? 'System' },
              { label: 'Event', render: (e) => <strong>{e.action}</strong> },
              { label: 'Project', render: (e) => e.project?.name ?? 'System / organization' },
              { label: 'Entity', render: (e) => e.entityType },
              {
                label: 'Actions',
                render: (e) => (
                  <Button size="sm" variant="ghost" onClick={() => setDetail(e)}>
                    Details
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
      {detail && (
        <RecordDialog
          title="Audit event details"
          description="Recorded values and context; no modification is permitted."
          onClose={() => setDetail(null)}
        >
          <dl className="record-details">
            {[
              ['Audit ID', detail.id],
              ['Actor', detail.actor?.name ?? 'System'],
              ['Action', detail.action],
              ['Entity', `${detail.entityType} · ${detail.entityId ?? '—'}`],
              ['Project', detail.project?.name ?? 'System / organization'],
              [
                'Timestamp',
                new Date(detail.timestamp).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <h3 className="card-title">Recorded changes & metadata</h3>
          <pre className="audit-metadata">{JSON.stringify(detail.metadata ?? {}, null, 2)}</pre>
        </RecordDialog>
      )}
    </div>
  );
}
