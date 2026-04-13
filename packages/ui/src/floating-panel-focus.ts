const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isFocusableElementVisible(element: HTMLElement): boolean {
  if (element.hasAttribute("disabled")) return false;
  if (element.getAttribute("aria-hidden") === "true") return false;
  if (element.tabIndex < 0) return false;
  return true;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    isFocusableElementVisible,
  );
}

export function focusInitialFloatingPanelTarget(container: HTMLElement): void {
  const [firstFocusable] = getFocusableElements(container);
  (firstFocusable ?? container).focus();
}

export function trapFocusWithinFloatingPanel(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;

  const focusableElements = getFocusableElements(container);
  if (focusableElements.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }

  const [firstFocusable] = focusableElements;
  const lastFocusable = focusableElements[focusableElements.length - 1];
  if (!firstFocusable || !lastFocusable) return;

  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement) || !container.contains(activeElement)) {
    event.preventDefault();
    (event.shiftKey ? lastFocusable : firstFocusable).focus();
    return;
  }

  if (!event.shiftKey && activeElement === lastFocusable) {
    event.preventDefault();
    firstFocusable.focus();
    return;
  }

  if (event.shiftKey && (activeElement === firstFocusable || activeElement === container)) {
    event.preventDefault();
    lastFocusable.focus();
  }
}
