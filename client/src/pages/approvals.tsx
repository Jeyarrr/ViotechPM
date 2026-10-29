import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useAuth } from '@/hooks/use-auth';
import { useLookup, queryString } from '@/hooks/use-core';
import { api } from '@/services/api';
import { currency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/shared/feedback';
import { RecordTable, StatusBadge, Notice } from '@/components/shared/crud';
import { ApprovalDecisionDialog } from '@/components/shared/approval-controls';
import type { PageResult } from '@/types/core';
import type { TransactionRecord } from '@/types/operations';

export function ApprovalsPage() {
  const { data: user } = useAuth();
  const [view, setView] = useState('pending'),
    [filters, setFilters] = useState({ q: '', projectId: '', mine: 'true', page: 1, pageSize: 20 }),
    [decision, setDecision] = useState<{
      id: string;
      action: 'approve' | 'reject' | 'return';
    } | null>(null),
    [notice, setNotice] = useState('');
  const projects = useLookup('projects');
  const query = useQuery({
    queryKey: ['core', 'approvals', view, filters],
    queryFn: () =>
      api.get<PageResult<TransactionRecord>>(
        `/approvals${view === 'pending' ? '/pending' : ''}?${queryString({ ...filters, status: ['APPROVED', 'REJECTED', 'RETURNED_FOR_REVISION'].includes(view) ? view : '' })}`,
      ),
  });
  const update = (key: string, value: string) =>
    setFilters((v) => ({ ...v, [key]: value, page: 1 }));
  return (
    <div className="crud-page">
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">REVIEW & ACCOUNTABILITY</div>
          <h1>Approvals</h1>
          <p>Review assigned requests and follow their complete decision history.</p>
        </div>
      </div>
      <Notice message={notice} dismiss={() => setNotice('')} />
      <div className="operation-tabs" role="group" aria-label="Approval views">
        {[
          ['pending', 'Pending approvals'],
          ['APPROVED', 'Approved transactions'],
          ['REJECTED', 'Rejected transactions'],
          ['RETURNED_FOR_REVISION', 'Returned requests'],
          ['history', 'Approval history'],
        ].map(([key, label]) => (
          <Button
            key={key}
            variant={view === key ? 'outline' : 'ghost'}
            aria-pressed={view === key}
            onClick={() => {
              setView(key!);
              setFilters((v) => ({ ...v, page: 1 }));
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <Card>
        <div className="crud-toolbar">
          <input
            className="input crud-search"
            aria-label="Search approvals"
            placeholder="Search reference or title…"
            value={filters.q}
            onChange={(e) => update('q', e.target.value)}
          />
          <select
            className="input"
            aria-label="Approval project filter"
            value={filters.projectId}
            onChange={(e) => update('projectId', e.target.value)}
          >
            <option value="">All projects</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Approval assignment filter"
            value={filters.mine}
            onChange={(e) => update('mine', e.target.value)}
          >
            <option value="true">Assigned to me</option>
            <option value="false">All authorized reviews</option>
          </select>
        </div>
        {query.isError ? (
          <ErrorState message={query.error.message} retry={() => void query.refetch()} />
        ) : (
          <RecordTable
            data={query.data}
            loading={query.isPending}
            onPage={(page) => setFilters((v) => ({ ...v, page }))}
            columns={[
              {
                label: 'Reference',
                render: (t) => (
                  <Link className="record-link" to={`/transactions/${t.id}`}>
                    <strong>{t.reference}</strong>
                    <small>{t.title}</small>
                  </Link>
                ),
              },
              {
                label: 'Project / Requester',
                render: (t) => (
                  <div>
                    {t.project.name}
                    <small>{t.requester.name}</small>
                  </div>
                ),
              },
              { label: 'Amount', render: (t) => currency(t.requestedAmount) },
              {
                label: 'Stage',
                render: (t) => (
                  <div>
                    Stage {t.workflows?.[0]?.currentStage ?? '—'}
                    <small>{t.submittedAt?.slice(0, 10)}</small>
                  </div>
                ),
              },
              { label: 'Status', render: (t) => <StatusBadge value={t.status} /> },
              {
                label: 'Actions',
                render: (t) => {
                  const w = t.workflows?.[0],
                    step = w?.steps.find((s) => s.sequence === w.currentStage),
                    canReview =
                      !t.project.archivedAt &&
                      t.requesterId !== user?.id &&
                      w?.status === 'ACTIVE' &&
                      step?.state === 'PENDING' &&
                      step.assignedApproverId === user?.id;
                  return (
                    <div className="row-actions">
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/transactions/${t.id}`}>View</Link>
                      </Button>
                      {canReview && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => setDecision({ id: t.id, action: 'approve' })}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDecision({ id: t.id, action: 'reject' })}
                          >
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDecision({ id: t.id, action: 'return' })}
                          >
                            Return
                          </Button>
                        </>
                      )}
                    </div>
                  );
                },
              },
            ]}
          />
        )}
      </Card>
      {decision && (
        <ApprovalDecisionDialog
          transactionId={decision.id}
          action={decision.action}
          onClose={() => setDecision(null)}
          onSaved={() => setNotice('Review decision recorded.')}
        />
      )}
    </div>
  );
}
