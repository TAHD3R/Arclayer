import { flushSync } from "react-dom";

import { usePreferencesStore } from "@/stores/usePreferenceStore";
import type { ThemeMode } from "@celestial/ui-theme/antd";

export type ThemeTransitionDirection = "btt" | "ttb" | "ltr" | "rtl";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function ensureViewTransitionStyle() {
  if (typeof document === "undefined") return;

  const id = "admin-view-transition-overrides";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent =
    "::view-transition-old(root), ::view-transition-new(root){animation:none;mix-blend-mode:normal;}";
  document.head.appendChild(style);
}

function getClipKeyframes(direction: ThemeTransitionDirection): [string, string] {
  switch (direction) {
    case "ltr":
      return ["inset(0 100% 0 0)", "inset(0 0 0 0)"];
    case "rtl":
      return ["inset(0 0 0 100%)", "inset(0 0 0 0)"];
    case "ttb":
      return ["inset(0 0 100% 0)", "inset(0 0 0 0)"];
    case "btt":
      return ["inset(100% 0 0 0)", "inset(0 0 0 0)"];
    default:
      return ["inset(0 100% 0 0)", "inset(0 0 0 0)"];
  }
}

function getOverlayHideKeyframes(direction: ThemeTransitionDirection): [string, string] {
  // Overlay starts fully visible, then clips away to reveal the new theme underneath.
  switch (direction) {
    case "ltr":
      return ["inset(0 0 0 0)", "inset(0 0 0 100%)"];
    case "rtl":
      return ["inset(0 0 0 0)", "inset(0 100% 0 0)"];
    case "ttb":
      return ["inset(0 0 0 0)", "inset(100% 0 0 0)"];
    case "btt":
      return ["inset(0 0 0 0)", "inset(0 0 100% 0)"];
    default:
      return ["inset(0 0 0 0)", "inset(0 0 0 100%)"];
  }
}

let overlayEl: HTMLDivElement | null = null;

function clearOverlay() {
  overlayEl?.remove();
  overlayEl = null;
}

async function runThemeOverlayTransition(options: {
  direction: ThemeTransitionDirection;
  apply: () => void;
}) {
  if (typeof document === "undefined") {
    options.apply();
    return;
  }

  if (prefersReducedMotion()) {
    options.apply();
    return;
  }

  // Capture current background so the overlay stays "old theme" even after we switch.
  const oldBg = window.getComputedStyle(document.body).backgroundColor;

  clearOverlay();
  const overlay = document.createElement("div");
  overlayEl = overlay;
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "2147483647";
  overlay.style.pointerEvents = "none";
  overlay.style.background = oldBg;
  overlay.style.willChange = "clip-path";
  overlay.style.clipPath = "inset(0 0 0 0)";
  overlay.style.mixBlendMode = "normal";
  document.body.appendChild(overlay);

  // Ensure the overlay is painted before we switch theme.
  void overlay.getBoundingClientRect();

  // Switch theme "under" the overlay so the change is hidden until we reveal it.
  flushSync(() => {
    options.apply();
  });

  const [fromClip, toClip] = getOverlayHideKeyframes(options.direction);
  const anim = overlay.animate(
    { clipPath: [fromClip, toClip] },
    { duration: 700, easing: "ease-in-out", fill: "forwards" },
  );

  try {
    await anim.finished;
  } finally {
    clearOverlay();
  }
}

async function runThemeViewTransition(options: {
  direction: ThemeTransitionDirection;
  apply: () => void;
}) {
  if (typeof document === "undefined") {
    options.apply();
    return;
  }

  if (prefersReducedMotion()) {
    options.apply();
    return;
  }

  // Some browsers require `document` as the invocation receiver; calling an unbound function
  // can throw "Illegal invocation".
  const startViewTransition = (document as any).startViewTransition?.bind(document) as
    | undefined
    | ((cb: () => void) => { ready: Promise<void> });

  if (!startViewTransition) {
    await runThemeOverlayTransition(options);
    return;
  }

  ensureViewTransitionStyle();

  const [fromClip, toClip] = getClipKeyframes(options.direction);

  const transition = startViewTransition(() => {
    // Keep DOM update inside the callback so the new snapshot includes the new theme.
    flushSync(() => {
      options.apply();
    });
  });

  await transition.ready;

  // Note: `pseudoElement` is part of the View Transitions API.
  document.documentElement.animate({ clipPath: [fromClip, toClip] }, {
    duration: 700,
    easing: "ease-in-out",
    pseudoElement: "::view-transition-new(root)",
  } as any);
}

export async function setThemeModeWithTransition(
  next: ThemeMode,
  options: { direction?: ThemeTransitionDirection } = {},
) {
  const direction = options.direction ?? "ltr";
  await runThemeViewTransition({
    direction,
    apply: () => usePreferencesStore.getState().setThemeMode(next),
  });
}

export async function toggleThemeModeWithTransition(
  options: { direction?: ThemeTransitionDirection } = {},
) {
  const current = usePreferencesStore.getState().themeMode;
  const next: ThemeMode = current === "dark" ? "light" : "dark";
  await setThemeModeWithTransition(next, options);
}
