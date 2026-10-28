CREATE TYPE "ClientType" AS ENUM ('INDIVIDUAL', 'BUSINESS');
CREATE TABLE "clients" (
  "id" UUID PRIMARY KEY,
  "code" VARCHAR(40) NOT NULL UNIQUE,
  "name" VARCHAR(180) NOT NULL,
  "type" "ClientType" NOT NULL DEFAULT 'BUSINESS',
  "contact_person" VARCHAR(150),
  "email" VARCHAR(254),
  "phone" VARCHAR(50),
  "address" VARCHAR(500),
  "industry" VARCHAR(120),
  "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" VARCHAR(4000),
  "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "archived_at" TIMESTAMPTZ(3),
  CONSTRAINT "clients_code_normalized" CHECK ("code" = upper("code") AND length(trim("code")) > 0)
);
CREATE INDEX "clients_archived_at_status_name_idx" ON "clients"("archived_at", "status", "name");
CREATE INDEX "clients_created_by_id_idx" ON "clients"("created_by_id");
