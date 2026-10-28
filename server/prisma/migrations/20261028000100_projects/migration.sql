CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
CREATE TABLE "project_categories" (
  "id" UUID PRIMARY KEY,
  "name" VARCHAR(120) NOT NULL UNIQUE,
  "active" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "project_categories" ("id", "name") SELECT gen_random_uuid(), name FROM unnest(ARRAY[
 'Web Application Development', 'Software Development', 'IT Infrastructure', 'Network Installation',
 'CCTV Installation', 'System Maintenance', 'Technical Support Projects', 'Other IT Services'
]) AS name;
CREATE TABLE "projects" (
  "id" UUID PRIMARY KEY,
  "code" VARCHAR(40) NOT NULL UNIQUE,
  "name" VARCHAR(180) NOT NULL,
  "description" VARCHAR(4000),
  "client_id" UUID NOT NULL REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "category_id" UUID NOT NULL REFERENCES "project_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "manager_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "department_id" UUID REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "start_date" DATE NOT NULL,
  "target_date" DATE NOT NULL,
  "actual_completion_date" DATE,
  "budget" DECIMAL(16,2),
  "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
  "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
  "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "archived_at" TIMESTAMPTZ(3),
  CONSTRAINT "projects_code_normalized" CHECK ("code" = upper("code") AND length(trim("code")) > 0),
  CONSTRAINT "projects_date_order" CHECK ("target_date" >= "start_date"),
  CONSTRAINT "projects_budget_positive" CHECK ("budget" IS NULL OR "budget" >= 0),
  CONSTRAINT "projects_completion_consistent" CHECK (("status" = 'COMPLETED') = ("actual_completion_date" IS NOT NULL))
);
CREATE INDEX "projects_archived_at_status_target_date_idx" ON "projects"("archived_at", "status", "target_date");
CREATE INDEX "projects_manager_id_idx" ON "projects"("manager_id");
CREATE INDEX "projects_client_id_idx" ON "projects"("client_id");
CREATE INDEX "projects_category_id_idx" ON "projects"("category_id");
CREATE INDEX "projects_department_id_idx" ON "projects"("department_id");
CREATE INDEX "projects_created_by_id_idx" ON "projects"("created_by_id");
