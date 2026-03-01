import type { DesignNodeId, DesignNodeV1 } from "./design-document";
import type { LocalizedString } from "./localized";

/**
 * PageBlueprint 片段（用于插入/复用，而不是完整页面）。
 *
 * 约定：
 * - 类型名保持稳定（PageBlueprintFragment），通过 version 做版本演进。
 * - 当前仅支持 v1。
 */
export interface PageBlueprintFragment {
  version: 1;
  rootIds: DesignNodeId[];
  nodesById: Record<DesignNodeId, DesignNodeV1>;
}

/**
 * 供 Editor 插入面板使用的内置 Pattern（基于 PageBlueprintFragment）。
 *
 * 注意：Editor 协议层的 Pattern 类型与这里保持结构兼容即可（避免包之间循环依赖）。
 */
export type PageBlueprintPatternV1 = {
  code: string;
  label: LocalizedString;
  category: string;
  previewImageUrl?: string | null;
  rootIds: DesignNodeId[];
  nodesById: Record<DesignNodeId, DesignNodeV1>;
};
