import type { ThreadSnapshot } from "@rakazo/contracts";
import { activeThreadRuns } from "./thread-events.js";

export interface ResolveBotEffectiveStatusOptions {
  botId: string;
  baseStatus?: string;
  activeSnapshot?: ThreadSnapshot | null;
  inGroup?: boolean;
  completedBots?: Record<string, number>;
  now?: number;
}

/**
 * Resolves the real-time visual status of a bot by prioritizing active thread runs
 * and transient celebration states over the static database roster status.
 */
export function resolveBotEffectiveStatus({
  botId,
  baseStatus,
  activeSnapshot,
  inGroup = false,
  completedBots,
  now = Date.now(),
}: ResolveBotEffectiveStatusOptions): string {
  // 1. In direct chat, the active thread's live run status takes top priority
  if (!inGroup && activeSnapshot?.botId === botId) {
    const liveStatus = activeSnapshot.run?.status;
    if (liveStatus) return liveStatus;
  }

  // 2. In group chat, check if this bot has an active run in the thread
  if (inGroup && activeSnapshot?.groupId) {
    const activeRuns = activeThreadRuns(activeSnapshot);
    const memberRun = activeRuns.find((run) => run.botId === botId);
    if (memberRun?.status) return memberRun.status;
  }

  // 3. If this bot recently completed a run, provide transient "completed" status for celebration
  const expiry = completedBots?.[botId];
  if (expiry && expiry > now) {
    return "completed";
  }

  // 4. Fall back to the roster status or "idle"
  return baseStatus ?? "idle";
}
