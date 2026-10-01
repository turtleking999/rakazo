/**
 * Shared working-avatar choreography used by mobile (Reanimated) and mirrored
 * by web CSS in `@rakazo/ui-web` (`styles.css` organic working keyframes).
 *
 * Duration families and transform midpoints must stay aligned across surfaces.
 */

export interface WorkingAvatarFrame {
  translationX: number;
  translationY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  eyeOffsetX: number;
  eyeOffsetY: number;
}

export type AvatarLifecycleState =
  | "idle"
  | "thinking"
  | "working"
  | "blocked"
  | "error"
  | "done";

/**
 * Resolves a run or bot status into a visual avatar lifecycle state.
 */
export function resolveAvatarLifecycle(status?: string | null): AvatarLifecycleState {
  "worklet";
  if (!status || status === "idle" || status === "cancelled") return "idle";
  if (status === "queued" || status === "leased") return "thinking";
  if (status === "running") return "working";
  if (status === "waiting_input" || status === "waiting_takeover") {
    return "blocked";
  }
  if (status === "failed") return "error";
  if (status === "completed") return "done";
  return "idle";
}

/** Per shape-family loop length in ms — keep in sync with web CSS animation durations. */
export const WORKING_AVATAR_DURATIONS_MS = [
  1800, 1350, 1600, 2400, 2400, 1350, 1100, 1350, 1600, 1350,
] as const;

export function workingAvatarDuration(seed: number): number {
  "worklet";
  return WORKING_AVATAR_DURATIONS_MS[seed % 10] ?? 1800;
}

export function avatarLifecycleDuration(seed: number, state: AvatarLifecycleState): number {
  "worklet";
  switch (state) {
    case "working":
      return workingAvatarDuration(seed);
    case "thinking":
      return 2400;
    case "blocked":
      return 2800;
    case "error":
      return 3200;
    case "done":
      return 1200;
    case "idle":
    default:
      return 4800;
  }
}



export function workingAvatarFrame(seed: number, progress: number): WorkingAvatarFrame {
  "worklet";
  const middle = (1 - Math.cos(progress * Math.PI * 2)) / 2;
  const frame: WorkingAvatarFrame = {
    translationX: 0,
    translationY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    eyeOffsetX: 0,
    eyeOffsetY: 0,
  };

  switch (seed % 10) {
    case 0:
      frame.translationY = 2 - 5 * middle;
      frame.scaleX = 1.02 - 0.04 * middle;
      break;
    case 1:
      frame.translationY = 2 - 5 * middle;
      frame.scaleX = 1.04 - 0.08 * middle;
      frame.scaleY = 0.96 + 0.09 * middle;
      break;
    case 2:
    case 8:
      frame.translationX = -1 + 2 * middle;
      frame.rotation = -3 + 6 * middle;
      break;
    case 3:
    case 4:
      frame.scaleX = 0.98 + 0.06 * middle;
      frame.scaleY = 0.98 + 0.06 * middle;
      frame.rotation = -4 + 8 * middle;
      break;
    case 5:
    case 9:
      frame.scaleX = 1.04 - 0.08 * middle;
      frame.scaleY = 0.96 + 0.08 * middle;
      break;
    case 6:
      frame.scaleX = 0.96 + 0.1 * middle;
      frame.scaleY = 0.96 + 0.1 * middle;
      break;
    default:
      frame.rotation = -4 + 9 * middle;
  }

  const angle = progress * Math.PI * 2;
  switch (seed % 4) {
    case 0:
      frame.eyeOffsetX = Math.sin(angle) * 9;
      frame.eyeOffsetY = Math.cos(angle) * 2;
      break;
    case 1:
      frame.eyeOffsetX = Math.cos(angle) * 7;
      frame.eyeOffsetY = Math.sin(angle) * 4;
      break;
    case 2:
      frame.eyeOffsetX = Math.cos(angle) * 8;
      frame.eyeOffsetY = Math.sin(angle) * 3;
      break;
    default:
      frame.eyeOffsetX = Math.sin(angle * 2) * 6;
      frame.eyeOffsetY = Math.cos(angle * 2) * 3;
  }
  return frame;
}

export function avatarLifecycleFrame(
  seed: number,
  state: AvatarLifecycleState,
  progress: number,
): WorkingAvatarFrame {
  "worklet";
  if (state === "idle") {
    return {
      translationX: 0,
      translationY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      eyeOffsetX: 0,
      eyeOffsetY: 0,
    };
  }

  if (state === "thinking") {
    const middle = (1 - Math.cos(progress * Math.PI * 2)) / 2;
    return {
      translationX: 0,
      translationY: -1 - 2 * middle,
      scaleX: 1.01,
      scaleY: 1.01,
      rotation: -1.5 + 3 * middle,
      eyeOffsetX: 2.5 + Math.sin(progress * Math.PI * 2) * 1.5,
      eyeOffsetY: -3.5 + Math.cos(progress * Math.PI * 2) * 1,
    };
  }

  if (state === "blocked") {
    const pulse = (1 - Math.cos(progress * Math.PI * 2)) / 2;
    return {
      translationX: 0,
      translationY: Math.sin(progress * Math.PI * 2) * 1.5,
      scaleX: 1.01 + 0.02 * pulse,
      scaleY: 1.01 + 0.02 * pulse,
      rotation: 4,
      eyeOffsetX: 0,
      eyeOffsetY: 0,
    };
  }

  if (state === "error") {
    return {
      translationX: 0,
      translationY: 1.5,
      scaleX: 0.98,
      scaleY: 0.98,
      rotation: 0,
      eyeOffsetX: 0,
      eyeOffsetY: 2,
    };
  }

  if (state === "done") {

    const bounce = Math.sin(progress * Math.PI);
    return {
      translationX: 0,
      translationY: -4 * bounce,
      scaleX: 1 + 0.04 * bounce,
      scaleY: 1 - 0.03 * bounce,
      rotation: 0,
      eyeOffsetX: 0,
      eyeOffsetY: -1 * bounce,
    };
  }

  return workingAvatarFrame(seed, progress);
}

