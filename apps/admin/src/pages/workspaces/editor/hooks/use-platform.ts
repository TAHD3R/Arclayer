/**
 * Platform detection hook for cross-platform shortcut display.
 */

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function usePlatform() {
  return { isMac: IS_MAC } as const;
}
