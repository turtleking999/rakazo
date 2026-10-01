export const UI_TEXT_SIZE_STORAGE_KEY = "rakazo.uiTextSize";
export const UI_TEXT_SIZE_EVENT = "rakazo:ui-text-size";

export const UI_TEXT_SIZE_MIN = 80;
export const UI_TEXT_SIZE_MAX = 200;
export const UI_TEXT_SIZE_DEFAULT = 100;

export type UiTextSize = number;

function clampUiTextSize(value: number): UiTextSize {
  return Math.min(UI_TEXT_SIZE_MAX, Math.max(UI_TEXT_SIZE_MIN, Math.round(value)));
}

function getStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    if (typeof localStorage === "undefined") return null;
    if (typeof localStorage.getItem !== "function" || typeof localStorage.setItem !== "function") {
      return null;
    }
    return localStorage;
  } catch {
    return null;
  }
}

export function getUiTextSize(): UiTextSize {
  const stored = Number(getStorage()?.getItem(UI_TEXT_SIZE_STORAGE_KEY));
  const value = Number.isFinite(stored) ? clampUiTextSize(stored) : UI_TEXT_SIZE_DEFAULT;
  return value;
}

export function applyUiTextSize(
  value: UiTextSize = getUiTextSize(),
  root: HTMLElement | null = typeof document === "undefined" ? null : document.documentElement,
): UiTextSize {
  if (!root) return value;
  const normalized = clampUiTextSize(value);
  const scale = normalized / 100;
  root.style.setProperty("--rk-ui-text-scale", String(scale));
  root.dataset.uiTextSize = String(normalized);
  return normalized;
}

export function setUiTextSize(value: UiTextSize): UiTextSize {
  const normalized = applyUiTextSize(value);
  getStorage()?.setItem(UI_TEXT_SIZE_STORAGE_KEY, String(normalized));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UI_TEXT_SIZE_EVENT, { detail: normalized }));
  }
  return normalized;
}

export function installUiTextSizeShortcuts(): () => void {
  if (typeof window === "undefined") return () => undefined;

  function onKeyDown(event: KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    if (event.key === "0") {
      event.preventDefault();
      setUiTextSize(UI_TEXT_SIZE_DEFAULT);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setUiTextSize(getUiTextSize() + 10);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      setUiTextSize(getUiTextSize() - 10);
    }
  }

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
