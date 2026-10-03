import type { ThreadSnapshot } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { resolveBotEffectiveStatus } from "./bot-lifecycle.js";

function mockSnapshot(overrides: Partial<ThreadSnapshot> = {}): ThreadSnapshot {
  return {
    botId: "bot-1",
    threadId: "thread-1",
    cursor: 1,
    olderCursor: null,
    messages: [],
    run: null,
    activeRuns: [],
    ...overrides,
  };
}

describe("resolveBotEffectiveStatus", () => {
  it("prioritizes live run status in direct chat over base status", () => {
    const snapshot = mockSnapshot({
      botId: "bot-1",
      run: {
        id: "run-1",
        botId: "bot-1",
        threadId: "thread-1",
        taskId: "task-1",
        status: "running",
        trigger: "user",
        routineId: null,
        modelProvider: null,
        modelId: null,
        error: null,
        startedAt: null,
        completedAt: null,
        createdAt: "2026-10-03T10:00:00Z",
      },
    });

    const status = resolveBotEffectiveStatus({
      botId: "bot-1",
      baseStatus: "idle",
      activeSnapshot: snapshot,
    });

    expect(status).toBe("running");
  });

  it("prioritizes queued status when direct send receipt is applied", () => {
    const snapshot = mockSnapshot({
      botId: "bot-1",
      run: {
        id: "run-receipt",
        botId: "bot-1",
        threadId: "thread-1",
        taskId: "task-receipt",
        status: "queued",
        trigger: "user",
        routineId: null,
        modelProvider: null,
        modelId: null,
        error: null,
        startedAt: null,
        completedAt: null,
        createdAt: "2026-10-03T10:00:00Z",
      },
    });

    const status = resolveBotEffectiveStatus({
      botId: "bot-1",
      baseStatus: "idle",
      activeSnapshot: snapshot,
    });

    expect(status).toBe("queued");
  });

  it("prioritizes waiting_input status when asking user", () => {
    const snapshot = mockSnapshot({
      botId: "bot-1",
      run: {
        id: "run-1",
        botId: "bot-1",
        threadId: "thread-1",
        taskId: "task-1",
        status: "waiting_input",
        trigger: "user",
        routineId: null,
        modelProvider: null,
        modelId: null,
        error: null,
        startedAt: null,
        completedAt: null,
        createdAt: "2026-10-03T10:00:00Z",
      },
    });

    const status = resolveBotEffectiveStatus({
      botId: "bot-1",
      baseStatus: "running",
      activeSnapshot: snapshot,
    });

    expect(status).toBe("waiting_input");
  });

  it("returns completed status during transient completion window", () => {
    const status = resolveBotEffectiveStatus({
      botId: "bot-1",
      baseStatus: "idle",
      activeSnapshot: null,
      completedBots: { "bot-1": 1000 },
      now: 500,
    });

    expect(status).toBe("completed");
  });

  it("falls back to baseStatus after transient completion expires", () => {
    const status = resolveBotEffectiveStatus({
      botId: "bot-1",
      baseStatus: "idle",
      activeSnapshot: null,
      completedBots: { "bot-1": 1000 },
      now: 1500,
    });

    expect(status).toBe("idle");
  });

  it("resolves member run status when in group chat", () => {
    const snapshot = mockSnapshot({
      groupId: "group-1",
      botId: undefined,
      activeRuns: [
        {
          id: "run-member",
          botId: "bot-member",
          threadId: "thread-group",
          taskId: "task-member",
          status: "running",
          trigger: "user",
          routineId: null,
          modelProvider: null,
          modelId: null,
          error: null,
          startedAt: null,
          completedAt: null,
          createdAt: "2026-10-03T10:00:00Z",
        },
      ],
    });

    const status = resolveBotEffectiveStatus({
      botId: "bot-member",
      baseStatus: "idle",
      activeSnapshot: snapshot,
      inGroup: true,
    });

    expect(status).toBe("running");
  });

  it("falls back to baseStatus or idle when no live run exists", () => {
    expect(
      resolveBotEffectiveStatus({
        botId: "bot-2",
        baseStatus: "idle",
        activeSnapshot: mockSnapshot({ botId: "bot-1" }),
      }),
    ).toBe("idle");

    expect(
      resolveBotEffectiveStatus({
        botId: "bot-2",
        baseStatus: undefined,
        activeSnapshot: null,
      }),
    ).toBe("idle");
  });
});
