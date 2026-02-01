/**
 * Masonry "click blank to clear selection" interaction rules:
 * - Clicking an asset tile / folder tile should NOT clear selection.
 * - Clicking antd Dropdown overlay (context menu) should NOT clear selection.
 * - Only clicking the real blank area should clear selection.
 *
 * Note: React Portal events still bubble through the React tree, so we must filter overlay targets via
 * `target.closest(...)`. Otherwise, clicking a context-menu item is mis-detected as "blank click",
 * clearing selection and causing actions (e.g. dialogs) to not open.
 */
export function shouldClearMasonrySelectionOnMouseDown(target: HTMLElement | null): boolean {
  if (!target) return false;

  // antd Dropdown/Menu is rendered via Portal, but the event still bubbles to the Masonry container.
  // Explicitly ignore it to avoid clearing selection when clicking menu items.
  if (
    target.closest(".ant-dropdown") ||
    target.closest(".ant-dropdown-menu") ||
    target.closest(".ant-dropdown-menu-root") ||
    target.closest(".ant-menu") ||
    target.closest(".rc-dropdown")
  )
    return false;

  // Clicking a tile itself should not clear selection.
  if (target.closest("[data-asset-tile='true']")) return false;
  if (target.closest("[data-folder-tile='true']")) return false;

  return true;
}
