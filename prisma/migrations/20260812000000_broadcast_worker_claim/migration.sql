-- Multi-worker broadcast claim.
-- Adds per-row worker ownership so several transport workers can drain the same
-- session concurrently without ever receiving the same broadcast twice.
-- Both columns are nullable, so existing rows are untouched and a pre-upgrade
-- worker keeps working against this schema.

ALTER TABLE "tbl_broadcasts" ADD COLUMN "workerId" TEXT;
ALTER TABLE "tbl_broadcasts" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- Supports the claim query's inner SELECT ... FOR UPDATE SKIP LOCKED.
CREATE INDEX "tbl_broadcasts_session_status_isComplete_idx"
  ON "tbl_broadcasts"("session", "status", "isComplete");

-- Supports inFlight(worker) counts used by the assignment/spillover logic.
CREATE INDEX "tbl_broadcasts_workerId_status_isComplete_idx"
  ON "tbl_broadcasts"("workerId", "status", "isComplete");

-- Supports the reclaim sweeper scanning for stale claims.
CREATE INDEX "tbl_broadcasts_status_isComplete_claimedAt_idx"
  ON "tbl_broadcasts"("status", "isComplete", "claimedAt");
