/**
 * 兼容导出：coreBlockRenderers
 *
 * 早期实现曾在此目录维护部分 core blocks 的 renderer 映射。
 * Stage 3 起，core blocks 的渲染器以 registry 驱动为核心，因此这里直接
 * re-export `internal/core-blocks.tsx` 中的实现，保持对外 API 稳定。
 */
export { coreBlockRenderers } from "../core-blocks";
