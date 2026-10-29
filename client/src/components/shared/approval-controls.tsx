import { useQuery } from '@tanstack/react-query';
import { useCoreMutation } from '@/hooks/use-core';
import { api } from '@/services/api';
import { RecordDialog, RecordForm } from './crud';
import { ErrorState } from './feedback';
import type { ApprovalPolicyRecord, ApprovalStep } from '@/types/operations';

export function ApprovalDecisionDialog({
  transactionId,
  action,
  onClose,
  onSaved,
}: {
  transactionId: string;
  action: 'approve' | 'reject' | 'return';
  onClose: () => void;
  onSaved: () => void;
}) {
  const change = useCoreMutation((v: Record<string, string>) =>
    api.post(`/approvals/${transactionId}/${action}`, v),
  );
  const label =
    action === 'approve'
      ? 'Approve current stage'
      : action === 'reject'
        ? 'Reject transaction'
        : 'Return for revision';
  return (
    <RecordForm
      title={label}
      fields={[
        {
          name: 'comment',
          label: action === 'approve' ? 'Review notes' : 'Reason / feedback',
          type: 'textarea',
          required: action !== 'approve',
          max: 2000,
          hint:
            action === 'approve'
              ? 'Approval advances only the current assigned stage.'
              : 'Provide at least three characters explaining the decision.',
        },
      ]}
      onClose={onClose}
      onSave={async (v) => {
        await change.mutateAsync(v);
        onSaved();
      }}
    />
  );
}
export function ApprovalPolicyEditor({
  projectId,
  onClose,
  onSaved,
}: {
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const query = useQuery({
    queryKey: ['core', 'approval-policy', projectId],
    queryFn: () => api.get<ApprovalPolicyRecord>(`/projects/${projectId}/approval-policy`),
  });
  const save = useCoreMutation((v: Record<string, string>) =>
    api.patch(`/projects/${projectId}/approval-policy`, v),
  );
  if (!query.data)
    return (
      <RecordDialog
        title="Approval policy"
        description="Loading reviewer configuration."
        onClose={onClose}
      >
        {query.isError ? (
          <ErrorState message={query.error.message} retry={() => void query.refetch()} />
        ) : (
          <p role="status">Loading…</p>
        )}
      </RecordDialog>
    );
  const policy = query.data;
  return (
    <RecordForm
      title="Project approval policy"
      fields={[
        {
          name: 'primaryReviewerId',
          label: 'Project reviewer',
          type: 'select',
          options: policy.reviewers.map((r) => ({
            value: r.id,
            label: `${r.name} · ${r.role.name}`,
          })),
          hint: 'Blank uses the current manager, with independent administrator fallback when needed.',
        },
        {
          name: 'finalReviewerId',
          label: 'Final reviewer',
          type: 'select',
          options: policy.reviewers
            .filter((r) => r.role.key === 'super_admin')
            .map((r) => ({ value: r.id, label: r.name })),
          hint: 'Blank chooses an eligible independent Super Admin at submission.',
        },
        {
          name: 'requireSecondReview',
          label: 'Review stages',
          type: 'select',
          required: true,
          options: [
            { value: 'true', label: 'Project review + final Super Admin review' },
            { value: 'false', label: 'Project review only' },
          ],
          hint: 'Applies to future submissions. Requesters can never review their own requests.',
        },
      ]}
      initial={{
        primaryReviewerId: policy.primaryReviewerId,
        finalReviewerId: policy.finalReviewerId,
        requireSecondReview: String(policy.requireSecondReview),
      }}
      onClose={onClose}
      onSave={async (v) => {
        await save.mutateAsync(v);
        onSaved();
      }}
    />
  );
}
export function ApprovalReassignDialog({
  transactionId,
  projectId,
  requesterId,
  step,
  otherReviewerIds,
  onClose,
  onSaved,
}: {
  transactionId: string;
  projectId: string;
  requesterId: string;
  step: ApprovalStep;
  otherReviewerIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const query = useQuery({
    queryKey: ['core', 'approval-policy', projectId],
    queryFn: () => api.get<ApprovalPolicyRecord>(`/projects/${projectId}/approval-policy`),
  });
  const save = useCoreMutation((v: Record<string, string>) =>
    api.post(`/approvals/${transactionId}/reassign`, { ...v, stepId: step.id }),
  );
  if (!query.data)
    return (
      <RecordDialog
        title="Reassign reviewer"
        description="Loading eligible reviewers."
        onClose={onClose}
      >
        {query.isError ? (
          <ErrorState message={query.error.message} retry={() => void query.refetch()} />
        ) : (
          <p role="status">Loading…</p>
        )}
      </RecordDialog>
    );
  const options = query.data.reviewers
    .filter(
      (r) =>
        r.id !== requesterId &&
        !otherReviewerIds.includes(r.id) &&
        (step.sequence === 1 || r.role.key === 'super_admin'),
    )
    .map((r) => ({ value: r.id, label: r.name }));
  return (
    <RecordForm
      title={`Reassign stage ${step.sequence}`}
      fields={[
        { name: 'approverId', label: 'Assigned reviewer', type: 'select', required: true, options },
        { name: 'comment', label: 'Reason', type: 'textarea', required: true, max: 2000 },
      ]}
      initial={{ approverId: step.assignedApproverId }}
      onClose={onClose}
      onSave={async (v) => {
        await save.mutateAsync(v);
        onSaved();
      }}
    />
  );
}
