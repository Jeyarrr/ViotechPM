import type { Lookup } from './core';
export interface ApprovalDecision {
  id: string;
  approverId: string;
  outcome: string;
  comment: string | null;
  timestamp: string;
  approver: Lookup;
}
export interface ApprovalStep {
  id: string;
  sequence: number;
  state: string;
  assignedApproverId: string;
  assignedApprover: Lookup & { status: string; role: { key: string; name: string } };
  decision: ApprovalDecision | null;
}
export interface ApprovalWorkflow {
  id: string;
  attempt: number;
  currentStage: number;
  status: string;
  createdAt: string;
  requestSnapshot: {
    title: string;
    requestedAmount: string;
    description: string | null;
    notes: string | null;
    type: string;
    transactionDate: string;
  };
  steps: ApprovalStep[];
}
export interface TransactionRecord {
  id: string;
  reference: string;
  projectId: string;
  typeId: string;
  title: string;
  description: string | null;
  notes: string | null;
  requestedAmount: string;
  currency: string;
  requesterId: string;
  departmentId: string | null;
  transactionDate: string;
  status: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  project: Lookup & { managerId: string; archivedAt: string | null };
  type: Lookup & { active: boolean };
  requester: Lookup & { email: string };
  department: Lookup | null;
  workflows?: ApprovalWorkflow[];
  currentWorkflow?: ApprovalWorkflow | null;
  canEdit?: boolean;
  canSubmit?: boolean;
  canCancel?: boolean;
  canReview?: boolean;
  activity?: { id: string; action: string; timestamp: string; actor: { name: string } | null }[];
}
export interface ApprovalPolicyRecord {
  primaryReviewerId: string;
  finalReviewerId: string;
  requireSecondReview: boolean;
  reviewers: (Lookup & { role: { key: string; name: string } })[];
}
