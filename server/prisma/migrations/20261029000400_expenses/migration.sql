-- CreateEnum
CREATE TYPE "ExpenseKind" AS ENUM ('POSTING', 'REVERSAL');

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "transaction_id" UUID,
    "category" VARCHAR(100) NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "expense_date" DATE NOT NULL,
    "kind" "ExpenseKind" NOT NULL DEFAULT 'POSTING',
    "recorded_by_id" UUID NOT NULL,
    "reversal_of_id" UUID,
    "reversal_reason" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expenses_transaction_id_key" ON "expenses"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_reversal_of_id_key" ON "expenses"("reversal_of_id");

-- CreateIndex
CREATE INDEX "expenses_project_id_expense_date_idx" ON "expenses"("project_id", "expense_date");

-- CreateIndex
CREATE INDEX "expenses_category_expense_date_idx" ON "expenses"("category", "expense_date");

-- CreateIndex
CREATE INDEX "expenses_recorded_by_id_idx" ON "expenses"("recorded_by_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "project_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_kind_amount_check" CHECK (
 ("kind" = 'POSTING' AND "amount" > 0 AND "transaction_id" IS NOT NULL AND "reversal_of_id" IS NULL AND "reversal_reason" IS NULL)
 OR ("kind" = 'REVERSAL' AND "amount" < 0 AND "transaction_id" IS NULL AND "reversal_of_id" IS NOT NULL AND length(trim("reversal_reason")) >= 3)
);
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_no_self_reversal_check" CHECK ("reversal_of_id" IS NULL OR "reversal_of_id" <> "id");
