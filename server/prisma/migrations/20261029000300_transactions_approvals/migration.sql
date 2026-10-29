-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED_FOR_REVISION', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('ACTIVE', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalStepState" AS ENUM ('WAITING', 'PENDING', 'DECIDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalOutcome" AS ENUM ('APPROVED', 'REJECTED', 'RETURNED');

-- CreateTable
CREATE TABLE "transaction_types" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "transaction_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_transactions" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(50) NOT NULL,
    "project_id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" VARCHAR(4000),
    "notes" VARCHAR(4000),
    "requested_amount" DECIMAL(16,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'PHP',
    "requester_id" UUID NOT NULL,
    "department_id" UUID,
    "transaction_date" DATE NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "rejected_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_policies" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "primary_reviewer_id" UUID,
    "final_reviewer_id" UUID,
    "require_second_review" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "current_stage" INTEGER NOT NULL DEFAULT 1,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'ACTIVE',
    "request_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "assigned_approver_id" UUID NOT NULL,
    "state" "ApprovalStepState" NOT NULL DEFAULT 'WAITING',

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_decisions" (
    "id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "outcome" "ApprovalOutcome" NOT NULL,
    "comment" VARCHAR(2000),
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transaction_types_name_key" ON "transaction_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "project_transactions_reference_key" ON "project_transactions"("reference");

-- CreateIndex
CREATE INDEX "project_transactions_project_id_status_transaction_date_idx" ON "project_transactions"("project_id", "status", "transaction_date");

-- CreateIndex
CREATE INDEX "project_transactions_requester_id_created_at_idx" ON "project_transactions"("requester_id", "created_at");

-- CreateIndex
CREATE INDEX "project_transactions_department_id_idx" ON "project_transactions"("department_id");

-- CreateIndex
CREATE INDEX "project_transactions_type_id_idx" ON "project_transactions"("type_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_policies_project_id_key" ON "approval_policies"("project_id");

-- CreateIndex
CREATE INDEX "approval_policies_primary_reviewer_id_idx" ON "approval_policies"("primary_reviewer_id");

-- CreateIndex
CREATE INDEX "approval_policies_final_reviewer_id_idx" ON "approval_policies"("final_reviewer_id");

-- CreateIndex
CREATE INDEX "approval_policies_updated_by_id_idx" ON "approval_policies"("updated_by_id");

-- CreateIndex
CREATE INDEX "approval_workflows_status_idx" ON "approval_workflows"("status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflows_transaction_id_attempt_key" ON "approval_workflows"("transaction_id", "attempt");

-- CreateIndex
CREATE INDEX "approval_steps_assigned_approver_id_state_idx" ON "approval_steps"("assigned_approver_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_workflow_id_sequence_key" ON "approval_steps"("workflow_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_workflow_id_assigned_approver_id_key" ON "approval_steps"("workflow_id", "assigned_approver_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_decisions_step_id_key" ON "approval_decisions"("step_id");

-- CreateIndex
CREATE INDEX "approval_decisions_approver_id_timestamp_idx" ON "approval_decisions"("approver_id", "timestamp");

-- AddForeignKey
ALTER TABLE "project_transactions" ADD CONSTRAINT "project_transactions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_transactions" ADD CONSTRAINT "project_transactions_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "transaction_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_transactions" ADD CONSTRAINT "project_transactions_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_transactions" ADD CONSTRAINT "project_transactions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_primary_reviewer_id_fkey" FOREIGN KEY ("primary_reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_final_reviewer_id_fkey" FOREIGN KEY ("final_reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "project_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "approval_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_assigned_approver_id_fkey" FOREIGN KEY ("assigned_approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "approval_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_transactions" ADD CONSTRAINT "project_transactions_amount_check" CHECK ("requested_amount" > 0);
ALTER TABLE "project_transactions" ADD CONSTRAINT "project_transactions_currency_check" CHECK ("currency" = 'PHP');
ALTER TABLE "project_transactions" ADD CONSTRAINT "project_transactions_approved_check" CHECK ("status" <> 'APPROVED' OR "approved_at" IS NOT NULL);
ALTER TABLE "project_transactions" ADD CONSTRAINT "project_transactions_rejected_check" CHECK ("status" <> 'REJECTED' OR "rejected_at" IS NOT NULL);
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_distinct_reviewers_check" CHECK ("primary_reviewer_id" IS NULL OR "final_reviewer_id" IS NULL OR "primary_reviewer_id" <> "final_reviewer_id");
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_attempt_check" CHECK ("attempt" > 0 AND "current_stage" BETWEEN 1 AND 2);
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_sequence_check" CHECK ("sequence" BETWEEN 1 AND 2);
INSERT INTO "transaction_types" ("id", "name") VALUES
 (gen_random_uuid(), 'Equipment Purchase'),
 (gen_random_uuid(), 'Software Purchase'),
 (gen_random_uuid(), 'Project Expense'),
 (gen_random_uuid(), 'Service Expense'),
 (gen_random_uuid(), 'Reimbursement'),
 (gen_random_uuid(), 'Other');
