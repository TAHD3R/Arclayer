const OVERLAY_ROOT_SELECTORS = [
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

  const overlayRoot = triggerNode.closest(OVERLAY_ROOT_SELECTORS);
  if (overlayRoot instanceof HTMLElement) {
    return overlayRoot;
  }

  // Always fallback to body outside overlays to avoid clipping inside scroll/stacking containers
  // (e.g. sticky table headers and overflow wrappers).
  return document.body;
}
