import { describe, expect, it } from "vitest";
import {
  avatarLifecycleDuration,
  avatarLifecycleFrame,
  resolveAvatarLifecycle,
  workingAvatarDuration,
  workingAvatarFrame,
} from "./avatar-motion.js";

describe("working avatar motion", () => {
  it("loops cleanly while keeping identity-specific choreography", () => {
    const start = workingAvatarFrame(0, 0);
    const end = workingAvatarFrame(0, 1);
    expect(end.translationY).toBeCloseTo(start.translationY);
    expect(end.scaleX).toBeCloseTo(start.scaleX);
    expect(end.eyeOffsetX).toBeCloseTo(start.eyeOffsetX);
    expect(end.eyeOffsetY).toBeCloseTo(start.eyeOffsetY);
    expect(workingAvatarFrame(0, 0.5)).not.toEqual(workingAvatarFrame(0, 0));
    expect(workingAvatarFrame(2, 0.5)).not.toEqual(workingAvatarFrame(0, 0.5));
    expect(workingAvatarDuration(6)).toBe(1100);
  });
});

describe("avatar lifecycle state resolution", () => {
  it("maps run statuses into the correct lifecycle states", () => {
    expect(resolveAvatarLifecycle("idle")).toBe("idle");
    expect(resolveAvatarLifecycle(null)).toBe("idle");
    expect(resolveAvatarLifecycle(undefined)).toBe("idle");
    expect(resolveAvatarLifecycle("cancelled")).toBe("idle");

    expect(resolveAvatarLifecycle("queued")).toBe("thinking");
    expect(resolveAvatarLifecycle("leased")).toBe("thinking");

    expect(resolveAvatarLifecycle("running")).toBe("working");

    expect(resolveAvatarLifecycle("waiting_input")).toBe("blocked");
    expect(resolveAvatarLifecycle("waiting_takeover")).toBe("blocked");
    expect(resolveAvatarLifecycle("failed")).toBe("error");

    expect(resolveAvatarLifecycle("completed")).toBe("done");
  });

  it("calculates distinct frames for each lifecycle state", () => {
    const thinkingFrame = avatarLifecycleFrame(0, "thinking", 0.5);
    expect(thinkingFrame.eyeOffsetY).toBeLessThan(0); // Eyes gaze slightly upward

    const blockedFrame = avatarLifecycleFrame(0, "blocked", 0.5);
    expect(blockedFrame.rotation).toBeCloseTo(4); // Curious tilt

    const errorFrame = avatarLifecycleFrame(0, "error", 0.5);
    expect(errorFrame.eyeOffsetY).toBeGreaterThan(0); // Downward lowered gaze
    expect(errorFrame.scaleX).toBeLessThan(1); // Slightly sunken posture

    const doneFrame = avatarLifecycleFrame(0, "done", 0.5);
    expect(doneFrame.translationY).toBeLessThan(0); // Upward bounce

    const idleFrame = avatarLifecycleFrame(0, "idle", 0.5);
    expect(idleFrame.scaleX).toBe(1);
    expect(idleFrame.translationY).toBe(0);

    expect(avatarLifecycleDuration(0, "thinking")).toBe(2400);
    expect(avatarLifecycleDuration(0, "blocked")).toBe(2800);
    expect(avatarLifecycleDuration(0, "error")).toBe(3200);
    expect(avatarLifecycleDuration(0, "done")).toBe(1200);
    expect(avatarLifecycleDuration(0, "working")).toBe(workingAvatarDuration(0));
  });

});

