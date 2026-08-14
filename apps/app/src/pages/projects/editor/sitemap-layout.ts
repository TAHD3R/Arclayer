import type { BuilderRevisionPageOut } from "@arclayer/openapi";

export const SITEMAP_NODE_WIDTH = 288;
export const SITEMAP_NODE_GAP_X = 56;
export const SITEMAP_LEVEL_GAP_Y = 72;

export interface PositionedSitemapPage extends BuilderRevisionPageOut {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SitemapLayoutResult {
  pages: PositionedSitemapPage[];
  bounds: { x: number; y: number; width: number; height: number };
}

export function getSitemapSectionCardCount(page: BuilderRevisionPageOut): number {
  if (page.sectionIntents?.length) return page.sectionIntents.length;
  return page.wireframe?.sections?.length ?? 0;
}

export function getSitemapNodeHeight(page: BuilderRevisionPageOut): number {
  return Math.max(96, 64 + getSitemapSectionCardCount(page) * 48);
}

export function layoutSitemapPages(pages: BuilderRevisionPageOut[]): SitemapLayoutResult {
  const byId = new Map(pages.map((page) => [page.itemId, page]));
  const children = new Map<string | null, BuilderRevisionPageOut[]>();
  for (const page of pages) {
    const parentId = page.parentItemId && byId.has(page.parentItemId) ? page.parentItemId : null;
    const siblings = children.get(parentId) ?? [];
    siblings.push(page);
    children.set(parentId, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.sortOrder - b.sortOrder);

  const subtreeWidths = new Map<string, number>();
  const visiting = new Set<string>();
  const measureSubtree = (page: BuilderRevisionPageOut): number => {
    const cached = subtreeWidths.get(page.itemId);
    if (cached) return cached;
    if (visiting.has(page.itemId)) return SITEMAP_NODE_WIDTH;
    visiting.add(page.itemId);
    const childWidths = (children.get(page.itemId) ?? []).map(measureSubtree);
    const childrenWidth = childWidths.reduce((total, width) => total + width, 0);
    const childGaps = Math.max(0, childWidths.length - 1) * SITEMAP_NODE_GAP_X;
    const measured = Math.max(SITEMAP_NODE_WIDTH, childrenWidth + childGaps);
    visiting.delete(page.itemId);
    subtreeWidths.set(page.itemId, measured);
    return measured;
  };

  const roots = children.get(null) ?? [];
  for (const root of roots) measureSubtree(root);
  for (const page of pages) measureSubtree(page);

  const depthHeights: number[] = [];
  const visited = new Set<string>();
  const measureDepths = (page: BuilderRevisionPageOut, depth: number) => {
    if (visited.has(page.itemId)) return;
    visited.add(page.itemId);
    depthHeights[depth] = Math.max(depthHeights[depth] ?? 0, getSitemapNodeHeight(page));
    for (const child of children.get(page.itemId) ?? []) measureDepths(child, depth + 1);
  };
  for (const root of roots) measureDepths(root, 0);
  for (const page of pages) measureDepths(page, 0);

  const depthY: number[] = [];
  for (let depth = 0; depth < depthHeights.length; depth += 1) {
    depthY[depth] =
      (depthY[depth - 1] ?? 0) + (depth > 0 ? depthHeights[depth - 1] + SITEMAP_LEVEL_GAP_Y : 0);
  }

  const positioned: PositionedSitemapPage[] = [];
  const place = (page: BuilderRevisionPageOut, depth: number, left: number) => {
    if (positioned.some((item) => item.itemId === page.itemId)) return;
    const subtreeWidth = subtreeWidths.get(page.itemId) ?? SITEMAP_NODE_WIDTH;
    const x = left + Math.max(0, (subtreeWidth - SITEMAP_NODE_WIDTH) / 2);
    positioned.push({
      ...page,
      x,
      y: depthY[depth] ?? 0,
      width: SITEMAP_NODE_WIDTH,
      height: getSitemapNodeHeight(page),
    });
    const pageChildren = children.get(page.itemId) ?? [];
    const childrenWidth = pageChildren.reduce(
      (total, child) => total + (subtreeWidths.get(child.itemId) ?? SITEMAP_NODE_WIDTH),
      0,
    );
    const childGaps = Math.max(0, pageChildren.length - 1) * SITEMAP_NODE_GAP_X;
    let childLeft = left + (subtreeWidth - (childrenWidth + childGaps)) / 2;
    for (const child of pageChildren) {
      place(child, depth + 1, childLeft);
      childLeft += (subtreeWidths.get(child.itemId) ?? SITEMAP_NODE_WIDTH) + SITEMAP_NODE_GAP_X;
    }
  };

  let rootLeft = 0;
  for (const root of roots) {
    place(root, 0, rootLeft);
    rootLeft += (subtreeWidths.get(root.itemId) ?? SITEMAP_NODE_WIDTH) + SITEMAP_NODE_GAP_X;
  }
  for (const page of pages) place(page, 0, rootLeft);

  const width = Math.max(SITEMAP_NODE_WIDTH, ...positioned.map((page) => page.x + page.width));
  const height = Math.max(112, ...positioned.map((page) => page.y + page.height));
  return { pages: positioned, bounds: { x: 0, y: 0, width, height } };
}
