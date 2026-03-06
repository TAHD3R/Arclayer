const DIALOG_OVERLAY_ROOT_SELECTOR = "[data-overlay-root=dialog]";

const OVERLAY_ROOT_SELECTORS = [
  // NOTE:
  // Do not include DIALOG_OVERLAY_ROOT_SELECTOR here and rely on `closest()` ordering.
  // `Element.closest()` always returns the nearest matching ancestor, not the first selector match.
  // For dialogs we must explicitly prefer the fixed overlay root over the animated dialog content.
  "[data-slot=dialog-content]",
  "[data-slot=sheet-content]",
  "[data-slot=popover-content]",
  "[data-slot=alert-dialog-content]",
  ".ant-modal-content",
  ".ant-popover",
  ".ant-drawer-content",
].join(", ");

/**
 * Keep Antd popup layers inside the nearest overlay container.
 * This prevents Radix Dialog/Popover from treating dropdown clicks as outside interactions.
 */
export function getPopupContainerWithinOverlay(triggerNode?: HTMLElement | null): HTMLElement {
  if (typeof document === "undefined") {
    return triggerNode ?? ({} as HTMLElement);
  }

  if (!triggerNode) {
    return document.body;
  }

  // Prefer the fixed overlay root (viewport-aligned) over the animated dialog content.
  // This prevents rc-trigger popups (Select/Tooltip) from being affected by dialog content layout/transforms.
  const dialogOverlayRoot = triggerNode.closest(DIALOG_OVERLAY_ROOT_SELECTOR);
  if (dialogOverlayRoot instanceof HTMLElement) {
    return dialogOverlayRoot;
  }

  const overlayRoot = triggerNode.closest(OVERLAY_ROOT_SELECTORS);
  if (overlayRoot instanceof HTMLElement) {
    return overlayRoot;
  }

  // Always fallback to body outside overlays to avoid clipping inside scroll/stacking containers
  // (e.g. sticky table headers and overflow wrappers).
  return document.body;
}
