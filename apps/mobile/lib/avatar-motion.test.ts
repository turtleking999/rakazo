import { describe, expect, it } from "vitest";
import {
  avatarLifecycleDuration,
  avatarLifecycleFrame,
  resolveAvatarLifecycle,
  workingAvatarDuration,
  workingAvatarFrame,
} from "./avatar-motion.js";

describe("working avatar motion", () => {
  it("reuses shared core choreography", () => {
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

  it("exposes avatar lifecycle resolution and frames", () => {
    expect(resolveAvatarLifecycle("queued")).toBe("thinking");
    expect(resolveAvatarLifecycle("waiting_input")).toBe("blocked");
    expect(resolveAvatarLifecycle("completed")).toBe("done");

    const thinkingFrame = avatarLifecycleFrame(0, "thinking", 0.5);
    expect(thinkingFrame.eyeOffsetY).toBeLessThan(0);
    expect(avatarLifecycleDuration(0, "thinking")).toBe(2400);
  });
});

