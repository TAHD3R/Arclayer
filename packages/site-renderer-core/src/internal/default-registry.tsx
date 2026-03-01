import type { BlockManifest, BlockNode } from "@celestial/site-block-protocol";

import type { BlockRenderer, PrefabInstanceNode } from "./BlockRegistry";
import { BlockRegistry, PREFAB_INSTANCE_BLOCK_TYPE } from "./BlockRegistry";
import { registerCoreBlocks } from "./core-blocks";
import { cardPrefabRenderer } from "./prefabs/card-prefab";

type ProcessLike = {
  env?: {
    NODE_ENV?: string;
  };
};

function isProductionEnv(): boolean {
  if (typeof globalThis === "undefined") return false;

  const processLike = (globalThis as typeof globalThis & { process?: unknown }).process;
  if (!processLike || typeof processLike !== "object") return false;

  const env = (processLike as ProcessLike).env;
  return env?.NODE_ENV === "production";
}

const PREFAB_BLOCK_MANIFEST: BlockManifest = {
  type: PREFAB_INSTANCE_BLOCK_TYPE,
  label: { "zh-CN": "预制体", "en-US": "Prefab" },
  category: "custom",
  supports: { children: true, layout: true, design: true, animation: true, responsive: true },
  attributes: [
    { key: "prefab", kind: "text", label: { "zh-CN": "Prefab Code", "en-US": "Prefab Code" }, required: true },
    { key: "props", kind: "json", label: { "zh-CN": "属性", "en-US": "Props" } },
    // 兼容字段：历史实现曾使用 data 存放 props（保留读能力，写入应使用 props）
    { key: "data", kind: "json", label: { "zh-CN": "数据(兼容)", "en-US": "Data (Legacy)" } },
  ],
};

const prefabBlockRenderer: BlockRenderer = (node, ctx, registry) => {
  // 这里不做严格校验；prefab 实例节点的结构允许在不同插件之间扩展。
  return registry.renderPrefabInstance(node as PrefabInstanceNode, ctx);
};

export const defaultFallbackRenderer: BlockRenderer = (node: BlockNode) => {
  if (isProductionEnv()) return null;

  return (
    <div
      role="note"
      data-celestial="block-fallback"
      data-block-type={node.type}
      data-block-id={node.id}
      style={{
        border: "1px dashed rgba(255,0,0,0.5)",
        padding: 8,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 12,
      }}
    >
      Unsupported block: {node.type}#{node.id}
    </div>
  );
};

export type CreateDefaultBlockRegistryOptions = {
  /**
   * 自定义 fallback renderer（当节点类型未注册时触发）。
   * - 传入 null 表示关闭 fallback（未注册节点渲染为 null）
   */
  fallbackRenderer?: BlockRenderer | null;
  /**
   * 是否注册示例 prefab（默认 true）。
   * 仅用于演示与开发阶段，业务可自行覆盖/替换。
   */
  includeExamplePrefabs?: boolean;
};

/**
 * 创建 renderer-core 的默认注册表：
 * - 注册 12 个 core blocks
 * - 注册 prefab instance block（`__prefab__`）+ 示例 card prefab
 * - 配置 fallback renderer（默认开发态提示，生产态返回 null）
 */
export function createDefaultBlockRegistry(options: CreateDefaultBlockRegistryOptions = {}): BlockRegistry {
  const registry = new BlockRegistry();

  // --- core blocks ---
  registerCoreBlocks(registry);

  // --- prefab support ---
  registry.register(PREFAB_BLOCK_MANIFEST, prefabBlockRenderer);
  if (options.includeExamplePrefabs !== false) {
    registry.registerPrefab("card", cardPrefabRenderer);
  }

  registry.setFallbackRenderer(options.fallbackRenderer ?? defaultFallbackRenderer);
  return registry;
}
