import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@rakazo/db";
import type { EncryptedSecretStore } from "./secrets.js";

export const WEBHOOK_SECRET_KIND = "webhook";

export function routineWebhookPath(routineId: string): string {
  return `/api/v1/routines/${routineId}/webhook`;
}

export function botWebhookPath(botId: string): string {
  return `/api/v1/bots/${botId}/webhook`;
}

export type WebhookSecretDeps = {
  prisma: PrismaClient;
  secretStore: Pick<EncryptedSecretStore, "load" | "put">;
};

/**
 * Return the bot's inbound webhook bearer secret, creating it on first use.
 * Existing secrets are reused so senders already configured keep working.
 */
export async function ensureBotWebhookSecret(
  deps: WebhookSecretDeps,
  botId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const bot = await deps.prisma.bot.findUnique({
      where: { id: botId },
      select: { id: true, spaceId: true, userId: true, webhookSecretId: true },
    });
    if (!bot) throw new Error("Bot not found.");

    if (bot.webhookSecretId) {
      const secret = await deps.prisma.secret.findUnique({
        where: { id: bot.webhookSecretId },
        select: { id: true, ciphertext: true, kind: true, userId: true, spaceId: true },
      });
      if (
        secret &&
        secret.kind === WEBHOOK_SECRET_KIND &&
        secret.userId === bot.userId &&
        secret.spaceId === bot.spaceId
      ) {
        return deps.secretStore.load(secret.ciphertext, secret.id);
      }
      throw new Error("Webhook secret is unavailable. Rotate it from the routine settings.");
    }

    const plaintext = randomBytes(32).toString("base64url");
    const stored = await deps.secretStore.put(plaintext, {
      operationId: "routines.webhookSecret",
      traceId: "routines.webhookSecret",
      spaceId: bot.spaceId,
      userId: bot.userId,
      botId: bot.id,
      signal: new AbortController().signal,
    });
    const claimed = await deps.prisma.$transaction(async (tx) => {
      await tx.secret.create({
        data: {
          id: stored.id,
          userId: bot.userId,
          spaceId: bot.spaceId,
          kind: WEBHOOK_SECRET_KIND,
          ciphertext: stored.ciphertext,
        },
      });
      const updated = await tx.bot.updateMany({
        where: { id: bot.id, webhookSecretId: null },
        data: { webhookSecretId: stored.id },
      });
      if (updated.count !== 1) {
        // Another caller provisioned first; drop ours and reuse theirs.
        await tx.secret.deleteMany({ where: { id: stored.id } });
        return false;
      }
      return true;
    });
    if (claimed) return plaintext;
  }
  throw new Error("Could not provision the webhook secret. Try again.");
}
