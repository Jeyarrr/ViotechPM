import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { Plus, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCoreMutation, useLookup, queryString } from '@/hooks/use-core';
import { api } from '@/services/api';
import { currency } from '@/lib/utils';
import { operationLabel, transactionStatuses } from '@/lib/operations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/shared/feedback';
import {
  RecordTable,
  ConfirmAction,
  RecordForm,
  StatusBadge,
  Notice,
} from '@/components/shared/crud';
import { TransactionEditor, TransactionTypeManager } from '@/components/shared/transaction-editor';
import {
  ApprovalDecisionDialog,
  ApprovalPolicyEditor,
  ApprovalReassignDialog,
} from '@/components/shared/approval-controls';
import type { PageResult } from '@/types/core';
import type { TransactionRecord, ApprovalWorkflow, ApprovalStep } from '@/types/operations';

export function TransactionsPage() {
  const { data: user } = useAuth(),
    [search] = useSearchParams();
  const [filters, setFilters] = useState({
    q: '',
    projectId: search.get('projectId') ?? '',
    typeId: '',
    departmentId: '',
    status: '',
    dateFrom: '',
    dateTo: '',
    sort: 'createdAt',
    direction: 'desc',
    page: 1,
    pageSize: 20,
  });
  const [editing, setEditing] = useState<TransactionRecord | 'new' | null>(null),
    [submitting, setSubmitting] = useState<TransactionRecord | null>(null),
    [cancelling, setCancelling] = useState<TransactionRecord | null>(null),
    [typesOpen, setTypesOpen] = useState(false),
    [notice, setNotice] = useState('');
  const projects = useLookup('projects'),
    types = useLookup('transaction-types'),
    departments = useLookup('departments');
  const list = useQuery({
    queryKey: ['core', 'transactions', filters],
    queryFn: () => api.get<PageResult<TransactionRecord>>(`/transactions?${queryString(filters)}`),
  });
  const submit = useCoreMutation((id: string) => api.post(`/transactions/${id}/submit`));
  const cancel = useCoreMutation((v: Record<string, string>) =>
    api.post(`/transactions/${cancelling!.id}/cancel`, v),
  );
  const update = (key: string, value: string) =>
    setFilters((v) => ({ ...v, [key]: value, page: 1 }));
  return (
    <div className="crud-page">
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">PROJECT BUSINESS REQUESTS</div>
          <h1>Transactions</h1>
          <p>Prepare requests, follow review stages, and retain a clear decision history.</p>
        </div>
        <div className="row-actions">
          {user?.role.key === 'super_admin' && (
            <Button variant="outline" onClick={() => setTypesOpen(true)}>
              Request types
            </Button>
          )}
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} />
            Create request
          </Button>
        </div>
      </div>
      <Notice message={notice} dismiss={() => setNotice('')} />
      <Card>
        <div className="crud-toolbar">
          <input
            className="input crud-search"
            aria-label="Search transactions"
            placeholder="Search reference or title…"
            value={filters.q}
            onChange={(e) => update('q', e.target.value)}
          />
          <select
            className="input"
            aria-label="Transaction project filter"
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
            aria-label="Transaction type filter"
            value={filters.typeId}
            onChange={(e) => update('typeId', e.target.value)}
          >
            <option value="">All request types</option>
            {types.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Transaction status filter"
            value={filters.status}
            onChange={(e) => update('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {transactionStatuses.map((s) => (
              <option key={s} value={s}>
                {operationLabel(s)}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Transaction department filter"
            value={filters.departmentId}
            onChange={(e) => update('departmentId', e.target.value)}
          >
            <option value="">All authorized departments</option>
            {departments.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="toolbar-date">
            <label htmlFor="transaction-date-from">From</label>
            <input
              className="input"
              id="transaction-date-from"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => update('dateFrom', e.target.value)}
            />
          </div>
          <div className="toolbar-date">
            <label htmlFor="transaction-date-to">To</label>
            <input
              className="input"
              id="transaction-date-to"
              type="date"
              value={filters.dateTo}
              onChange={(e) => update('dateTo', e.target.value)}
            />
          </div>
          <select
            className="input"
            aria-label="Sort transactions"
            value={filters.sort}
            onChange={(e) => update('sort', e.target.value)}
          >
            <option value="createdAt">Created date</option>
            <option value="transactionDate">Transaction date</option>
            <option value="reference">Reference</option>
            <option value="requestedAmount">Amount</option>
            <option value="title">Title</option>
          </select>
          <select
            className="input"
            aria-label="Transaction sort direction"
            value={filters.direction}
            onChange={(e) => update('direction', e.target.value)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
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
                label: 'Reference / Request',
                render: (t) => (
                  <Link className="record-link" to={`/transactions/${t.id}`}>
                    <strong>{t.reference}</strong>
                    <small>{t.title}</small>
                  </Link>
                ),
              },
              {
                label: 'Project / Type',
                render: (t) => (
                  <div>
                    {t.project.name}
                    <small>{t.type.name}</small>
                  </div>
                ),
              },
              {
                label: 'Requester',
                render: (t) => (
                  <div>
                    {t.requester.name}
                    <small>{t.department?.name ?? 'No department'}</small>
                  </div>
                ),
              },
              { label: 'Amount', render: (t) => currency(t.requestedAmount, t.currency) },
              { label: 'Date', render: (t) => t.transactionDate.slice(0, 10) },
              {
                label: 'Status',
                render: (t) => (
                  <div>
                    <StatusBadge value={t.status} />
                    {t.workflows?.[0]?.status === 'ACTIVE' && (
                      <small>
                        Stage {t.workflows[0].currentStage} of {t.workflows[0].steps.length}
                      </small>
                    )}
                  </div>
                ),
              },
              {
                label: 'Actions',
                render: (t) => (
                  <div className="row-actions">
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/transactions/${t.id}`}>View</Link>
                    </Button>
                    {t.canEdit && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                        Edit
                      </Button>
                    )}
                    {t.canSubmit && (
                      <Button size="sm" variant="outline" onClick={() => setSubmitting(t)}>
                        Submit
                      </Button>
                    )}
                    {t.canCancel && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(t)}>
                        Cancel request
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
      {editing && (
        <TransactionEditor
          transaction={editing === 'new' ? undefined : editing}
          projectId={filters.projectId || undefined}
          onClose={() => setEditing(null)}
          onSaved={() => setNotice('Transaction request saved.')}
        />
      )}
      {submitting && (
        <ConfirmAction
          title={`Submit ${submitting.reference}?`}
          description="The request will enter its configured approval stages. It can be edited again only if returned for revision."
          onClose={() => setSubmitting(null)}
          onConfirm={async () => {
            await submit.mutateAsync(submitting.id);
            setNotice('Request submitted for review.');
          }}
        />
      )}
      {cancelling && (
        <RecordForm
          title="Cancel transaction request"
          fields={[
            {
              name: 'comment',
              label: 'Cancellation reason',
              type: 'textarea',
              required: true,
              max: 2000,
            },
          ]}
          onClose={() => setCancelling(null)}
          onSave={async (v) => {
            await cancel.mutateAsync(v);
            setNotice('Request cancelled.');
          }}
        />
      )}
      {typesOpen && <TransactionTypeManager onClose={() => setTypesOpen(false)} />}
    </div>
  );
}

export function TransactionDetailsPage() {
  const { id } = useParams(),
    { data: user } = useAuth();
  const [editing, setEditing] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [cancelling, setCancelling] = useState(false),
    [policyOpen, setPolicyOpen] = useState(false),
    [decision, setDecision] = useState<'approve' | 'reject' | 'return' | null>(null),
    [reassign, setReassign] = useState<ApprovalStep | null>(null),
    [notice, setNotice] = useState(''),
    [historyPage, setHistoryPage] = useState(1);
  const query = useQuery({
    queryKey: ['core', 'transaction', id],
    queryFn: () => api.get<TransactionRecord>(`/transactions/${id}`),
  });
  const history = useQuery({
    queryKey: ['core', 'transaction-history', id, historyPage],
    queryFn: () =>
      api.get<PageResult<ApprovalWorkflow>>(
        `/transactions/${id}/history?page=${historyPage}&pageSize=5`,
      ),
  });
  const submit = useCoreMutation(() => api.post(`/transactions/${id}/submit`)),
    cancel = useCoreMutation((v: Record<string, string>) =>
      api.post(`/transactions/${id}/cancel`, v),
    );
  if (query.isPending)
    return (
      <div className="crud-loading" role="status">
        Loading transaction…
      </div>
    );
  if (query.isError)
    return <ErrorState message={query.error.message} retry={() => void query.refetch()} />;
  const t = query.data,
    admin = user?.role.key === 'super_admin';
  return (
    <div className="crud-page">
      <Button asChild variant="ghost" size="sm">
        <Link to="/transactions">
          <ArrowLeft size={15} />
          All transactions
        </Link>
      </Button>
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">{t.reference}</div>
          <h1>{t.title}</h1>
          <p>
            {t.type.name} · {t.project.name}
          </p>
        </div>
        <div className="row-actions">
          {t.canEdit && <Button onClick={() => setEditing(true)}>Edit request</Button>}
          {t.canSubmit && <Button onClick={() => setSubmitting(true)}>Submit request</Button>}
          {t.canCancel && (
            <Button variant="outline" onClick={() => setCancelling(true)}>
              Cancel request
            </Button>
          )}
        </div>
      </div>
      <Notice message={notice} dismiss={() => setNotice('')} />
      <div className="project-detail-grid">
        <Card className="detail-panel">
          <StatusBadge value={t.status} />
          <p className="project-description">{t.description || 'No description recorded.'}</p>
          <dl className="record-details">
            {[
              ['Project', t.project.name],
              ['Requester', t.requester.name],
              ['Department', t.department?.name ?? 'Not assigned'],
              ['Requested amount', currency(t.requestedAmount, t.currency)],
              ['Transaction date', t.transactionDate.slice(0, 10)],
              [
                'Submitted',
                t.submittedAt ? new Date(t.submittedAt).toLocaleString('en-PH') : 'Not submitted',
              ],
              [
                'Approved',
                t.approvedAt ? new Date(t.approvedAt).toLocaleString('en-PH') : 'Not approved',
              ],
              [
                'Rejected',
                t.rejectedAt ? new Date(t.rejectedAt).toLocaleString('en-PH') : 'Not rejected',
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <h2 className="card-title">Supporting notes</h2>
          <p className="project-description">{t.notes || 'No supporting notes.'}</p>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/projects/${t.projectId}`}>View project</Link>
          </Button>
        </Card>
        <Card className="detail-panel">
          <h2 className="card-title">Current approval stage</h2>
          {t.currentWorkflow ? (
            <>
              <p className="field-hint">
                Submission {t.currentWorkflow.attempt} · {operationLabel(t.currentWorkflow.status)}{' '}
                · Stage {t.currentWorkflow.currentStage} of {t.currentWorkflow.steps.length}
              </p>
              <ol className="approval-steps">
                {t.currentWorkflow.steps.map((step) => (
                  <li key={step.id}>
                    <div>
                      <strong>{step.sequence === 1 ? 'Project review' : 'Final review'}</strong>
                      <small>{step.assignedApprover.name}</small>
                    </div>
                    <StatusBadge value={step.decision?.outcome ?? step.state} />
                    {admin &&
                      t.currentWorkflow?.status === 'ACTIVE' &&
                      ['WAITING', 'PENDING'].includes(step.state) && (
                        <Button size="sm" variant="ghost" onClick={() => setReassign(step)}>
                          Reassign stage {step.sequence}
                        </Button>
                      )}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="field-hint">This request has not been submitted.</p>
          )}
          {t.canReview && (
            <div className="row-actions">
              <Button onClick={() => setDecision('approve')}>Approve</Button>
              <Button variant="outline" onClick={() => setDecision('reject')}>
                Reject
              </Button>
              <Button variant="outline" onClick={() => setDecision('return')}>
                Return for revision
              </Button>
            </div>
          )}
          {admin && !t.project.archivedAt && (
            <Button variant="ghost" size="sm" onClick={() => setPolicyOpen(true)}>
              Configure project approval policy
            </Button>
          )}
          <p className="field-hint">
            Approval records the review decision. Expense posting is a separate controlled
            operation.
          </p>
        </Card>
      </div>
      <Card className="detail-panel">
        <h2 className="card-title">Approval history</h2>
        {history.isError ? (
          <ErrorState message={history.error.message} retry={() => void history.refetch()} />
        ) : history.isPending ? (
          <p role="status">Loading approval history…</p>
        ) : history.data.items.length ? (
          <>
            <div className="workflow-history">
              {history.data.items.map((w) => (
                <section className="workflow-attempt" key={w.id}>
                  <div className="row-actions">
                    <h3>Submission {w.attempt}</h3>
                    <StatusBadge value={w.status} />
                    <span>{currency(w.requestSnapshot.requestedAmount)}</span>
                  </div>
                  <small>{new Date(w.createdAt).toLocaleString('en-PH')}</small>
                  <ol className="approval-steps">
                    {w.steps.map((step) => (
                      <li key={step.id}>
                        <div>
                          <strong>
                            Stage {step.sequence} · {step.assignedApprover.name}
                          </strong>
                          <small>
                            {step.decision
                              ? `${step.decision.approver.name} · ${new Date(step.decision.timestamp).toLocaleString('en-PH')}`
                              : 'No decision recorded'}
                          </small>
                          {step.decision?.comment && (
                            <p className="project-description">{step.decision.comment}</p>
                          )}
                        </div>
                        <StatusBadge value={step.decision?.outcome ?? step.state} />
                      </li>
                    ))}
                  </ol>
                  <details className="snapshot-details">
                    <summary>View submitted request</summary>
                    <dl className="record-details">
                      {[
                        ['Title', w.requestSnapshot.title],
                        ['Type', w.requestSnapshot.type],
                        ['Amount', currency(w.requestSnapshot.requestedAmount)],
                        ['Description', w.requestSnapshot.description ?? 'Not recorded'],
                        ['Notes', w.requestSnapshot.notes ?? 'Not recorded'],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </section>
              ))}
            </div>
            <div className="crud-pagination">
              <span>
                {history.data.total} submissions · Page {history.data.page} of {history.data.pages}
              </span>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={historyPage >= history.data.pages}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="field-hint">No submissions yet.</p>
        )}
      </Card>
      <Card className="detail-panel">
        <h2 className="card-title">Recent request activity</h2>
        <ul className="data-list">
          {t.activity?.map((a) => (
            <li key={a.id}>
              <span>
                {a.action.replaceAll('.', ' ').replaceAll('_', ' ')}
                <small>{a.actor?.name ?? 'System'}</small>
              </span>
              <time>{new Date(a.timestamp).toLocaleString('en-PH')}</time>
            </li>
          ))}
        </ul>
      </Card>
      {editing && (
        <TransactionEditor
          transaction={t}
          onClose={() => setEditing(false)}
          onSaved={() => setNotice('Request saved.')}
        />
      )}
      {submitting && (
        <ConfirmAction
          title={`Submit ${t.reference}?`}
          description="Send the current request for its configured review stages."
          onClose={() => setSubmitting(false)}
          onConfirm={async () => {
            await submit.mutateAsync();
            setNotice('Request submitted.');
          }}
        />
      )}
      {cancelling && (
        <RecordForm
          title="Cancel transaction request"
          fields={[
            {
              name: 'comment',
              label: 'Cancellation reason',
              type: 'textarea',
              required: true,
              max: 2000,
            },
          ]}
          onClose={() => setCancelling(false)}
          onSave={async (v) => {
            await cancel.mutateAsync(v);
            setNotice('Request cancelled.');
          }}
        />
      )}
      {decision && (
        <ApprovalDecisionDialog
          transactionId={t.id}
          action={decision}
          onClose={() => setDecision(null)}
          onSaved={() => setNotice('Review decision recorded.')}
        />
      )}
      {policyOpen && (
        <ApprovalPolicyEditor
          projectId={t.projectId}
          onClose={() => setPolicyOpen(false)}
          onSaved={() => setNotice('Approval policy saved for future submissions.')}
        />
      )}
      {reassign && (
        <ApprovalReassignDialog
          transactionId={t.id}
          projectId={t.projectId}
          requesterId={t.requesterId}
          step={reassign}
          otherReviewerIds={
            t.currentWorkflow?.steps
              .filter((s) => s.id !== reassign.id)
              .map((s) => s.assignedApproverId) ?? []
          }
          onClose={() => setReassign(null)}
          onSaved={() => setNotice('Reviewer reassigned.')}
        />
      )}
    </div>
  );
}
