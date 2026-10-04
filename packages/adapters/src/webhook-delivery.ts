import { createHmac } from "node:crypto";
import type { JobPublisher } from "@rakazo/adapter-kit";
import { webhookDeliveryJob } from "@rakazo/adapter-kit";
import type { MessageBlock } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";

const WEBHOOK_USER_AGENT = "Rakazo-Webhook/1";
const WEBHOOK_TIMEOUT_MS = 15_000;
const MAX_ERROR_LENGTH = 1_000;

type CompletionPayload = {
  event: "run.completed" | "run.failed";
  status: "completed" | "failed";
  runId: string;
  botId: string;
  threadId: string;
  completedAt: string;
  content: string;
  blocks?: MessageBlock[];
  error?: string;
};

type WebhookCompletionConfig = {
  endpoint: string;
  secret: string;
};

export function configuredCompletionWebhook(
  env: NodeJS.ProcessEnv = process.env,
): WebhookCompletionConfig | null {
  const endpoint = env.RAKAZO_WEBHOOK_COMPLETION_URL?.trim();
  const secret = env.RAKAZO_WEBHOOK_COMPLETION_SECRET?.trim();
  if (!endpoint && !secret) return null;
  if (!endpoint || !secret) {
    throw new Error(
      "RAKAZO_WEBHOOK_COMPLETION_URL and RAKAZO_WEBHOOK_COMPLETION_SECRET must be set together",
    );
  }
  const url = new URL(endpoint);
  if (url.username || url.password) {
    throw new Error("RAKAZO_WEBHOOK_COMPLETION_URL must not contain embedded credentials");
  }
  if (url.protocol !== "https:" && !isLoopback(url.hostname)) {
    throw new Error("RAKAZO_WEBHOOK_COMPLETION_URL must use HTTPS outside loopback");
  }
  return { endpoint: url.toString(), secret };
}

export function completionWebhookUserAgent(): string {
  return WEBHOOK_USER_AGENT;
}

export function completionWebhookPayload(input: {
  runId: string;
  botId: string;
  threadId: string;
  content: string;
  blocks?: MessageBlock[];
  completedAt?: Date;
  error?: string;
}): CompletionPayload {
  const failed = input.error !== undefined;
  return {
    event: failed ? "run.failed" : "run.completed",
    status: failed ? "failed" : "completed",
    runId: input.runId,
    botId: input.botId,
    threadId: input.threadId,
    completedAt: (input.completedAt ?? new Date()).toISOString(),
    content: input.content,
    ...(input.blocks ? { blocks: input.blocks } : {}),
    ...(failed ? { error: input.error } : {}),
  };
}

export async function deliverCompletionWebhook(
  prisma: PrismaClient,
  deliveryId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const config = configuredCompletionWebhook(env);
  if (!config) return;

  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      endpoint: true,
      idempotencyKey: true,
      status: true,
      attempts: true,
      payload: true,
    },
  });
  if (!delivery || delivery.status === "delivered") return;
  if (!delivery.endpoint) throw new Error("Webhook delivery has no endpoint");

  const attempts = delivery.attempts + 1;
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: { status: "sending", attempts, lastError: null },
  });

  const body = JSON.stringify(delivery.payload);
  const signature = createHmac("sha256", config.secret).update(body).digest("hex");
  try {
    const response = await fetch(delivery.endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": WEBHOOK_USER_AGENT,
        "idempotency-key": delivery.idempotencyKey,
        "x-rakazo-signature-256": `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Webhook callback returned HTTP ${response.status}`);
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "delivered", deliveredAt: new Date(), lastError: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook callback failed";
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "pending",
        attempts,
        nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
        lastError: message.slice(0, MAX_ERROR_LENGTH),
      },
    });
    throw error;
  }
}

export async function reconcileWebhookDeliveries(
  prisma: PrismaClient,
  jobs: Pick<JobPublisher, "enqueue">,
): Promise<void> {
  if (!configuredCompletionWebhook()) return;
  const now = new Date();
  const deliveries = await prisma.webhookDelivery.findMany({
    where: {
      direction: "outbound",
      OR: [
        { status: "pending", nextAttemptAt: { lte: now } },
        {
          status: "sending",
          updatedAt: { lte: new Date(now.getTime() - WEBHOOK_TIMEOUT_MS * 2) },
        },
      ],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: 100,
    select: { id: true },
  });
  await Promise.all(
    deliveries.map((delivery) =>
      jobs.enqueue(webhookDeliveryJob(delivery.id)).catch((error) => {
        getLogger().error("pending webhook enqueue failed", error);
      }),
    ),
  );
}

function retryDelayMs(attempts: number): number {
  return Math.min(15 * 60_000, 1_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 9));
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
