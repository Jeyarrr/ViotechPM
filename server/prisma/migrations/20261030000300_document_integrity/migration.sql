-- DropForeignKey
ALTER TABLE "project_documents" DROP CONSTRAINT "project_documents_task_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_project_id_key" ON "tasks"("id", "project_id");

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_task_id_project_id_fkey" FOREIGN KEY ("task_id", "project_id") REFERENCES "tasks"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE project_documents ADD CONSTRAINT document_positive_size CHECK (size > 0);
