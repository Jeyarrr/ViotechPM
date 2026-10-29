-- Require a non-null reason; SQL CHECK treats an unknown (NULL) expression as passing.
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reversal_reason_required_check"
CHECK ("kind" <> 'REVERSAL' OR ("reversal_reason" IS NOT NULL AND length(trim("reversal_reason")) >= 3));
