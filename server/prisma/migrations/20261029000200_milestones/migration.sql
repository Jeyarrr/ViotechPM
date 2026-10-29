CREATE TYPE "MilestoneStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'DELAYED');
CREATE TABLE "milestones" (
 "id" UUID NOT NULL, "project_id" UUID NOT NULL, "title" VARCHAR(180) NOT NULL,
 "description" VARCHAR(4000), "responsible_id" UUID, "start_date" DATE NOT NULL, "due_date" DATE NOT NULL,
 "completed_at" TIMESTAMPTZ(3), "status" "MilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED',
 "priority" "Priority" NOT NULL DEFAULT 'MEDIUM', "display_order" INTEGER NOT NULL DEFAULT 0,
 "created_by_id" UUID NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(3) NOT NULL, "archived_at" TIMESTAMPTZ(3),
 CONSTRAINT "milestones_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "milestones_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "milestones_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "milestones_dates_check" CHECK ("due_date" >= "start_date"),
 CONSTRAINT "milestones_order_check" CHECK ("display_order" >= 0),
 CONSTRAINT "milestones_completion_check" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "milestones_id_project_id_key" ON "milestones"("id", "project_id");
CREATE INDEX "milestones_project_id_archived_at_display_order_idx" ON "milestones"("project_id", "archived_at", "display_order");
CREATE INDEX "milestones_responsible_id_due_date_idx" ON "milestones"("responsible_id", "due_date");
CREATE INDEX "milestones_created_by_id_idx" ON "milestones"("created_by_id");
ALTER TABLE "tasks" ADD COLUMN "milestone_id" UUID;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_id_project_id_fkey" FOREIGN KEY ("milestone_id", "project_id") REFERENCES "milestones"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "tasks_milestone_id_archived_at_status_idx" ON "tasks"("milestone_id", "archived_at", "status");
