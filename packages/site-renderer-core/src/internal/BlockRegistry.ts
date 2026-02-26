import type {
  BlockNode,
  CommonBlockVisualProps,
  ViewerContext,
} from "@celestial/site-block-protocol";
import type { BlockManifest } from "@celestial/site-block-protocol";
import type React from "react";

export type BlockRenderer = (
  node: BlockNode,
  ctx: ViewerContext,
  registry: BlockRegistry,
) => React.ReactNode;

export const PREFAB_INSTANCE_BLOCK_TYPE = "__prefab__" as const;

export type PrefabInstanceBlockType = typeof PREFAB_INSTANCE_BLOCK_TYPE;

export type PrefabInstanceProps = CommonBlockVisualProps & {
  /**
   * Prefab code, e.g. "card".
   * Renderer resolves this via registry.prefabEntries.
   */
  prefab: string;
  /**
   * Prefab-specific props payload（schema 驱动，适合 inspector patch）。
   * v1 先用 `Record<string, unknown>` 承载，后续可替换为更强约束结构。
   *
   * 约定：
   * - 由 editor 维护（insert/patch/validate）
   * - renderer 只读并做最小容错
   */
  props?: Record<string, unknown>;
  /**
   * 兼容字段：旧实现使用 data 存放 props。
   * 过渡期允许读取，但新写入应使用 props。
   */
  data?: Record<string, unknown>;
};

export type PrefabInstanceNode = BlockNode<PrefabInstanceBlockType, PrefabInstanceProps>;

export type PrefabRenderer = (
  node: PrefabInstanceNode,
  ctx: ViewerContext,
  registry: BlockRegistry,
) => React.ReactNode;

export class BlockRegistry {
  private entries = new Map<string, { manifest: BlockManifest; renderer: BlockRenderer }>();
  private prefabEntries = new Map<string, PrefabRenderer>();
  private fallbackRenderer: BlockRenderer | null = null;

  register(manifest: BlockManifest, renderer: BlockRenderer): void {
    this.entries.set(manifest.type, { manifest, renderer });
  }

  registerPrefab(code: string, renderer: PrefabRenderer): void {
    const normalized = (code || "").trim();
    if (!normalized) return;
    this.prefabEntries.set(normalized, renderer);
  }

  get(type: string): { manifest: BlockManifest; renderer: BlockRenderer } | undefined {
    return this.entries.get(type);
  }

  getPrefab(code: string): PrefabRenderer | undefined {
    const normalized = (code || "").trim();
    if (!normalized) return undefined;
    return this.prefabEntries.get(normalized);
  }

  list(category?: string): BlockManifest[] {
    const all = [...this.entries.values()].map((e) => e.manifest);
    return category ? all.filter((m) => m.category === category) : all;
  }

  setFallbackRenderer(renderer: BlockRenderer | null): void {
    this.fallbackRenderer = renderer;
  }

  getFallbackRenderer(): BlockRenderer | null {
    return this.fallbackRenderer;
  }

  render(node: BlockNode, ctx: ViewerContext): React.ReactNode {
    const entry = this.entries.get(node.type);
    if (entry) return entry.renderer(node, ctx, this);
    if (this.fallbackRenderer) return this.fallbackRenderer(node, ctx, this);
    return null;
  }

  renderPrefabInstance(node: PrefabInstanceNode, ctx: ViewerContext): React.ReactNode {
    const code = (node.props?.prefab || "").trim();
    if (!code) {
      if (this.fallbackRenderer) return this.fallbackRenderer(node, ctx, this);
      return null;
    }

    const renderer = this.prefabEntries.get(code);
    if (renderer) return renderer(node, ctx, this);

    if (this.fallbackRenderer) return this.fallbackRenderer(node, ctx, this);
    return null;
  }
}
