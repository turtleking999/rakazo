import type { PrismaClient } from "@rakazo/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  completionWebhookPayload,
  completionWebhookUserAgent,
  deliverCompletionWebhook,
} from "./webhook-delivery.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function prismaFor(delivery: Record<string, unknown>) {
  return {
    webhookDelivery: {
      upsert: vi.fn(async () => delivery),
      findUnique: vi.fn(async () => delivery),
      update: vi.fn(async () => delivery),
    },
  } as unknown as PrismaClient;
}

describe("completion webhook delivery", () => {
  it("builds a complete, stable payload", () => {
    expect(
      completionWebhookPayload({
        runId: "run-1",
        botId: "bot-1",
        threadId: "thread-1",
        content: "all tests pass",
        completedAt: new Date("2026-10-04T10:00:00.000Z"),
      }),
    ).toEqual({
      event: "run.completed",
      status: "completed",
      runId: "run-1",
      botId: "bot-1",
      threadId: "thread-1",
      completedAt: "2026-10-04T10:00:00.000Z",
      content: "all tests pass",
    });
  });

  it("posts full content with User-Agent, idempotency, and HMAC headers", async () => {
    vi.stubEnv("RAKAZO_WEBHOOK_COMPLETION_URL", "https://receiver.example.test/hooks");
    vi.stubEnv("RAKAZO_WEBHOOK_COMPLETION_SECRET", "callback-secret");
    const prisma = prismaFor({
      id: "delivery-1",
      endpoint: "https://receiver.example.test/hooks",
      idempotencyKey: "completion:run-1",
      status: "pending",
      attempts: 0,
      payload: {
        event: "run.completed",
        status: "completed",
        runId: "run-1",
        botId: "bot-1",
        threadId: "thread-1",
        completedAt: "2026-10-04T10:00:00.000Z",
        content: "full completion content",
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await deliverCompletionWebhook(prisma, "delivery-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://receiver.example.test/hooks",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("full completion content"),
        headers: expect.objectContaining({
          "user-agent": completionWebhookUserAgent(),
          "idempotency-key": "completion:run-1",
          "x-rakazo-signature-256": expect.stringMatching(/^sha256=[0-9a-f]{64}$/),
        }),
      }),
    );
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "delivered" }),
      }),
    );
  });

  it("records a retryable failure", async () => {
    vi.stubEnv("RAKAZO_WEBHOOK_COMPLETION_URL", "https://receiver.example.test/hooks");
    vi.stubEnv("RAKAZO_WEBHOOK_COMPLETION_SECRET", "callback-secret");
    const prisma = prismaFor({
      id: "delivery-1",
      endpoint: "https://receiver.example.test/hooks",
      idempotencyKey: "completion:run-1",
      status: "pending",
      attempts: 0,
      payload: { event: "run.completed", content: "done" },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("no", { status: 503 }));

    await expect(deliverCompletionWebhook(prisma, "delivery-1")).rejects.toThrow("HTTP 503");
    expect(prisma.webhookDelivery.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "pending", attempts: 1 }),
      }),
    );
  });
});
