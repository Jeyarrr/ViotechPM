-- Add project scope without changing existing audit fields or metadata.
ALTER TABLE "audit_logs" ADD COLUMN "project_id" UUID;
UPDATE "audit_logs" AS a SET "project_id" = p."id"
FROM "projects" AS p WHERE a."entity_type" = 'Project' AND a."entity_id" = p."id"::text;
UPDATE "audit_logs" AS a SET "project_id" = t."project_id"
FROM "tasks" AS t WHERE a."entity_type" = 'Task' AND a."entity_id" = t."id"::text;
UPDATE "audit_logs" AS a SET "project_id" = m."project_id"
FROM "milestones" AS m WHERE a."entity_type" = 'Milestone' AND a."entity_id" = m."id"::text;
UPDATE "audit_logs" AS a SET "project_id" = t."project_id"
FROM "project_transactions" AS t WHERE a."entity_type" = 'ProjectTransaction' AND a."entity_id" = t."id"::text;
UPDATE "audit_logs" AS a SET "project_id" = e."project_id"
FROM "expenses" AS e WHERE a."entity_type" = 'Expense' AND a."entity_id" = e."id"::text;
CREATE INDEX "audit_logs_project_id_timestamp_idx" ON "audit_logs"("project_id", "timestamp");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
