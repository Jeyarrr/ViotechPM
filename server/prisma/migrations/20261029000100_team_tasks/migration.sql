CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BLOCKED');
CREATE TABLE "project_members" (
 "id" UUID NOT NULL, "project_id" UUID NOT NULL, "user_id" UUID NOT NULL,
 "role" VARCHAR(80) NOT NULL DEFAULT 'Member', "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "assigned_by_id" UUID NOT NULL,
 CONSTRAINT "project_members_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "project_members_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");
CREATE INDEX "project_members_assigned_by_id_idx" ON "project_members"("assigned_by_id");
INSERT INTO "project_members" ("id", "project_id", "user_id", "role", "assigned_by_id")
SELECT gen_random_uuid(), "id", "manager_id", 'Project manager', "created_by_id" FROM "projects";
CREATE TABLE "tasks" (
 "id" UUID NOT NULL, "code" VARCHAR(40) NOT NULL, "project_id" UUID NOT NULL,
 "title" VARCHAR(180) NOT NULL, "description" VARCHAR(4000), "assignee_id" UUID,
 "priority" "Priority" NOT NULL DEFAULT 'MEDIUM', "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
 "start_date" DATE NOT NULL, "due_date" DATE NOT NULL, "completed_at" TIMESTAMPTZ(3),
 "created_by_id" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(3) NOT NULL, "archived_at" TIMESTAMPTZ(3),
 CONSTRAINT "tasks_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "tasks_dates_check" CHECK ("due_date" >= "start_date"),
 CONSTRAINT "tasks_code_check" CHECK ("code" = upper("code")),
 CONSTRAINT "tasks_completion_check" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "tasks_code_key" ON "tasks"("code");
CREATE INDEX "tasks_project_id_archived_at_status_idx" ON "tasks"("project_id", "archived_at", "status");
CREATE INDEX "tasks_assignee_id_due_date_idx" ON "tasks"("assignee_id", "due_date");
CREATE INDEX "tasks_created_by_id_idx" ON "tasks"("created_by_id");
