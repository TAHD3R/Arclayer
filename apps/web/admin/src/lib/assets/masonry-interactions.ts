/**
 * Masonry "click blank to clear selection" interaction rules:
 * - Clicking an asset tile / folder tile should NOT clear selection.
 * - Clicking dropdown menu overlay (Portal) should NOT clear selection.
 * - Only clicking the real blank area should clear selection.
 *
 * Note: React Portal events still bubble through the React tree, so we must filter overlay targets via
 * `target.closest(...)`. Otherwise, clicking a context-menu item is mis-detected as "blank click",
 * clearing selection and causing actions (e.g. dialogs) to not open.
 */
export function shouldClearMasonrySelectionOnMouseDown(target: HTMLElement | null): boolean {
  if (!target) return false;

  // DropdownMenu 内容通常通过 Portal 渲染，但事件仍会冒泡到 Masonry 容器。
  // 这里显式忽略 dropdown menu 的 overlay 区域，避免点击菜单项时被误判为“点击空白”。
  if (
    target.closest('[data-slot="dropdown-menu-content"]') ||
    target.closest('[data-slot="dropdown-menu-sub-content"]')
  )
    return false;

  // 兼容旧的 antd Dropdown/Menu（仍可能在部分页面存在）。
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
