CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "endpoint" TEXT,
    "botId" TEXT,
    "threadId" TEXT,
    "runId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_deliveries_direction_idempotencyKey_key"
ON "webhook_deliveries"("direction", "idempotencyKey");

CREATE INDEX "webhook_deliveries_status_nextAttemptAt_idx"
ON "webhook_deliveries"("status", "nextAttemptAt");

CREATE INDEX "webhook_deliveries_runId_direction_idx"
ON "webhook_deliveries"("runId", "direction");
