import type { ContentPageRow, ContentPageTreeLikeNode, PageStatus, PageType } from "./content-pages-types";

function detectPageType(path: string): PageType {
  return path.includes(":") ? "template" : "static";
}

function detectPageStatus(node: ContentPageTreeLikeNode): PageStatus {
  if (node.publishedRevision === null || node.publishedRevision === undefined) return "draft";
  return node.draftRevision === node.publishedRevision ? "published" : "draft";
}

export function flattenPagesTree(
  nodes: ContentPageTreeLikeNode[],
  level = 0,
): Array<{ node: ContentPageTreeLikeNode; level: number }> {
  const out: Array<{ node: ContentPageTreeLikeNode; level: number }> = [];
  for (const node of nodes) {
    out.push({ node, level });
    const children = Array.isArray(node.children) ? node.children : [];
    out.push(...flattenPagesTree(children, level + 1));
  }
  return out;
}

export function mapTreeToRows(nodes: ContentPageTreeLikeNode[]): ContentPageRow[] {
  return flattenPagesTree(nodes).map(({ node, level }) => ({
    id: node.id,
    title: node.title ?? null,
    description: node.description ?? null,
    path: node.path,
    parentId: node.parentId ?? null,
    sortOrder: node.sortOrder,
    level,
    visibility: node.visibility,
    draftRevision: node.draftRevision,
    publishedRevision: node.publishedRevision ?? null,
    pageType: detectPageType(node.path),
    status: detectPageStatus(node),
    updatedAt: node.updatedAt ?? null,
    updatedBy: node.updatedBy ?? null,
  }));
}

export function normalizePathInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/{2,}/g, "/");
}

export function validatePathWithType(path: string, type: PageType): "type_mismatch" | null {
  const isTemplatePath = path.includes(":");
  if (type === "template" && !isTemplatePath) return "type_mismatch";
  if (type === "static" && isTemplatePath) return "type_mismatch";
  return null;
}

export function resolveDisplayName(row: ContentPageRow): string {
  const normalizedTitle = row.title?.trim() ?? "";
  if (normalizedTitle) return normalizedTitle;
  return row.path;
}

export function buildDuplicatePath(basePath: string, existingPaths: Set<string>): string {
  const normalized = normalizePathInput(basePath);
  const baseCandidate = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  const initial = `${baseCandidate}-copy`;
  if (!existingPaths.has(initial)) return initial;

  let index = 2;
  while (index < 9999) {
    const next = `${baseCandidate}-copy-${index}`;
    if (!existingPaths.has(next)) return next;
    index += 1;
  }

  return `${baseCandidate}-${Date.now()}`;
}

export function buildDuplicateTitle(title: string | null, fallbackPath: string): string {
  const base = (title || "").trim() || fallbackPath;
  return `${base} copy`;
}

function parseOrdering(ordering: string | undefined): Array<{ key: string; desc: boolean }> {
  if (!ordering) return [];
  return ordering
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({
      key: item.startsWith("-") ? item.slice(1) : item,
      desc: item.startsWith("-"),
    }));
}

function compareString(a: string | null | undefined, b: string | null | undefined): number {
  return (a || "").localeCompare(b || "", undefined, { sensitivity: "base" });
}

function compareNumber(a: number | null | undefined, b: number | null | undefined): number {
  return (a || 0) - (b || 0);
}

function compareDateIso(a: string | null | undefined, b: string | null | undefined): number {
  const at = a ? Date.parse(a) : 0;
  const bt = b ? Date.parse(b) : 0;
  return at - bt;
}

function compareByKey(a: ContentPageRow, b: ContentPageRow, key: string): number {
  if (key === "updated_at") return compareDateIso(a.updatedAt, b.updatedAt);
  if (key === "title") return compareString(resolveDisplayName(a), resolveDisplayName(b));
  if (key === "path") return compareString(a.path, b.path);
  if (key === "visibility") return compareString(a.visibility, b.visibility);
  if (key === "status") return compareString(a.status, b.status);
  if (key === "sort_order") return compareNumber(a.sortOrder, b.sortOrder);
  return 0;
}

export function sortRows(rows: ContentPageRow[], ordering: string | undefined): ContentPageRow[] {
  const descriptors = parseOrdering(ordering);
  if (!descriptors.length) {
    return [...rows].sort((a, b) => compareDateIso(b.updatedAt, a.updatedAt));
  }

  return [...rows].sort((a, b) => {
    for (const descriptor of descriptors) {
      const cmp = compareByKey(a, b, descriptor.key);
      if (cmp === 0) continue;
      return descriptor.desc ? -cmp : cmp;
    }
    return 0;
  });
}
