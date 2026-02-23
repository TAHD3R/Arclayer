import type { BlockNode, ViewerContext } from "@celestial/site-block-protocol";
import type { BlockManifest } from "@celestial/site-block-protocol";
import type React from "react";

export type BlockRenderer = (
  node: BlockNode,
  ctx: ViewerContext,
  registry: BlockRegistry,
) => React.ReactNode;

export class BlockRegistry {
  private entries = new Map<string, { manifest: BlockManifest; renderer: BlockRenderer }>();

  register(manifest: BlockManifest, renderer: BlockRenderer): void {
    this.entries.set(manifest.type, { manifest, renderer });
  }

  get(type: string): { manifest: BlockManifest; renderer: BlockRenderer } | undefined {
    return this.entries.get(type);
  }

  list(category?: string): BlockManifest[] {
    const all = [...this.entries.values()].map((e) => e.manifest);
    return category ? all.filter((m) => m.category === category) : all;
  }

  render(node: BlockNode, ctx: ViewerContext): React.ReactNode {
    const entry = this.entries.get(node.type);
    if (!entry) return null;
    return entry.renderer(node, ctx, this);
  }
}
