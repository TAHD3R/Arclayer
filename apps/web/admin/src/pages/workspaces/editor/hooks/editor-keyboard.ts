export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return target.isContentEditable;
}

const SPACE_RESERVED_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  "summary",
  '[role="button"]',
  '[role="link"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="menuitem"]',
].join(", ");

/**
 * Whether the Space key should keep its default behavior for the current event target.
 *
 * We use Space as a temporary "hand" tool on the canvas (Space+drag). However, Space is also the activation key
 * for many accessible controls (buttons, menu items, etc.). If we always `preventDefault()`, focused controls
 * become unusable via keyboard. This helper ensures we don't hijack Space in those cases.
 */
export function isSpaceKeyReservedTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  // The actual event target can be a child (e.g. SVG icon inside a button), so use closest().
  return Boolean(target.closest(SPACE_RESERVED_SELECTOR));
}
