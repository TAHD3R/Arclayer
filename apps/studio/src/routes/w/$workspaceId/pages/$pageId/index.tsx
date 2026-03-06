import type { CSSProperties } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Card, Space, Tag, Typography, Select } from "antd";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@celestial/runtime/http";
import { resolveBreakpointNameByWidth } from "@celestial/block-protocol";
import type {
  PageBlueprint,
  ViewerContext,
  PrefabInstancePropsV1,
} from "@celestial/block-protocol";
import {
  createDefaultPrefabRegistryV1,
  createEmptyPageBlueprint,
  PageBlueprintRenderer,
} from "@celestial/renderer";

import {
  getWorkspacePage,
  getWorkspacePageDraftRevision,
  getWorkspacePagePublishedRevision,
  publishWorkspacePageRevision,
  saveWorkspacePageDraftRevision,
  updateWorkspacePage,
  unpublishWorkspacePage,
} from "@/api/pages";
import {
  createWorkspacePreviewToken,
  getSiteRuntimePreview,
  getWorkspaceSite,
} from "@/api/workspace-site";
import { getWorkspaceContentEntryRevision } from "@/api/content-entries";
import { PageSettingsDrawer } from "@/components/pages/page-settings-drawer";
import { NodeInspectorPanel } from "@/components/inspector/node-inspector-drawer";
import { PrefabTemplateNodeInspectorPanel } from "@/components/inspector/prefab-template-node-inspector";
import { PageDataPanel } from "@/components/panels/page-data-panel";
import { BlocksPanel } from "@/components/panels/blocks-panel";
import { LayersPanel } from "@/components/panels/layers-panel";
import { ViewportCanvas } from "@/components/viewport/viewport-canvas";
import {
  SelectionTransformOverlay,
  type SelectionTransformOverlayApi,
} from "@/components/viewport/selection-transform-overlay";
import { NodeHoverOverlayLayer } from "@/components/viewport/node-hover-overlay-layer";
import {
  clonePageBlueprint,
  normalizePageBlueprintForSave,
  readPageRootDataSources,
} from "@/lib/page-blueprint";
import { usePreferencesStore } from "@/stores/use-preferences-store";
import { useViewportStore } from "@/stores/use-viewport-store";
import type { SiteRuntimeOut, WorkspacePageUpdateIn, WorkspaceSiteOut } from "@/types/api";

export const Route = createFileRoute("/w/$workspaceId/pages/$pageId/")({
  component: WorkspacePageEditorRoute,
});

function mergeCssVars(runtime: SiteRuntimeOut | null | undefined): CSSProperties {
  const cssVars = runtime?.theme?.cssVars;
  if (!cssVars) return {};
  const style: Record<string, string> = {};
  for (const [k, v] of Object.entries(cssVars)) {
    if (k.startsWith("--")) style[k] = v;
  }
  return style as unknown as CSSProperties;
}

function nextInsertRectY(doc: PageBlueprint): number {
  let max = 40;
  for (const node of Object.values(doc.nodesById)) {
    const rect = node.layout?.self?.rect;
    if (!rect) continue;
    const bottom = rect.y + rect.height;
    if (Number.isFinite(bottom) && bottom > max) max = bottom;
  }
  return Math.round(max + 20);
}

function nextInsertRectYInSection(doc: PageBlueprint, sectionId: string): number {
  const section = doc.nodesById[sectionId];
  if (!section || section.type !== "prefab_instance") return 24;
  const ids = section.slotChildren?.default ?? [];
  let max = 24;
  for (const id of ids) {
    const node = doc.nodesById[id];
    const rect = node?.layout?.self?.rect;
    if (!rect) continue;
    const bottom = rect.y + rect.height;
    if (Number.isFinite(bottom) && bottom > max) max = bottom;
  }
  return Math.round(max + 20);
}

function randomId(prefix: string): string {
  const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `${prefix}_${c.randomUUID()}`;
  return `${prefix}_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
}

function normalizePageBlueprintToSectionStack(args: {
  doc: PageBlueprint;
  viewportWidth: number;
}): PageBlueprint {
  const next = clonePageBlueprint(args.doc);
  const root = next.nodesById[next.rootId];
  if (!root || root.type !== "page_root") return next;

  if (root.layout?.children?.mode !== "auto") {
    root.layout = {
      ...root.layout,
      children: {
        mode: "auto",
        direction: "column",
        gap: 0,
        padding: 0,
        alignItems: "stretch",
        justifyContent: "start",
        wrap: "nowrap",
      },
    };
  }

  const children = [...(root.children ?? [])].filter(Boolean);
  const nonSectionIds: string[] = [];
  for (const id of children) {
    const n = next.nodesById[id];
    const isSection = n && n.type === "prefab_instance" && n.prefabId === "section";
    if (!isSection) nonSectionIds.push(id);
  }
  if (nonSectionIds.length === 0) return next;

  const firstIndex = children.findIndex((id) => nonSectionIds.includes(id));
  const sectionId = randomId("p_section");

  let maxBottom = 0;
  for (const id of nonSectionIds) {
    const rect = next.nodesById[id]?.layout?.self?.rect;
    if (!rect) continue;
    const bottom = rect.y + rect.height;
    if (Number.isFinite(bottom)) maxBottom = Math.max(maxBottom, bottom);
  }
  const height = Math.max(320, Math.round(maxBottom + 80));

  next.nodesById[sectionId] = {
    id: sectionId,
    type: "prefab_instance",
    name: "section",
    prefabId: "section",
    props: {},
    slotChildren: { default: [...nonSectionIds] },
    layout: {
      self: {
        rect: { x: 0, y: 0, width: Math.max(320, args.viewportWidth), height },
        alignX: "start",
        alignY: "start",
      },
      children: { mode: "absolute" },
    },
  };

  const nextChildren = children.filter((id) => !nonSectionIds.includes(id));
  const insertAt =
    firstIndex >= 0 ? Math.min(nextChildren.length, firstIndex) : nextChildren.length;
  nextChildren.splice(insertAt, 0, sectionId);
  root.children = nextChildren;

  // 迁移到 Section 后，给绝对定位的组件一个更友好的默认偏移。
  for (const id of nonSectionIds) {
    const n = next.nodesById[id] as any;
    const rect = n?.layout?.self?.rect as any;
    if (!rect) continue;
    if (typeof rect.x === "number" && rect.x < 0) rect.x = 24;
    if (typeof rect.y === "number" && rect.y < 0) rect.y = 24;
  }

  return next;
}

type EditorSelection =
  | { kind: "doc"; nodeId: string }
  | { kind: "prefabTpl"; instanceId: string; templateNodeId: string }
  | null;

function isHttpOrigin(input: string): boolean {
  const raw = (input || "").trim();
  if (!raw) return false;
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function resolvePortalOrigin(args: { workspaceSlug: string | null | undefined }): string {
  const slug = (args.workspaceSlug || "").trim();
  const templateRaw = (import.meta.env.VITE_PORTAL_ORIGIN_TEMPLATE || "").trim();
  const fallbackRaw = (import.meta.env.VITE_PORTAL_ORIGIN || "").trim();

  if (templateRaw && slug) {
    const resolved = templateRaw.replaceAll("{slug}", slug);
    if (isHttpOrigin(resolved)) return resolved;
  }

  if (fallbackRaw && isHttpOrigin(fallbackRaw)) return fallbackRaw;
  return "http://localhost:3100";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractFieldValuesFromEntryRevisionSnapshot(
  snapshot: unknown,
): Record<string, unknown> | null {
  if (!isRecord(snapshot)) return null;
  const raw = snapshot.field_values ?? snapshot.fieldValues ?? snapshot.data ?? null;
  if (!raw || !isRecord(raw)) return null;
  return raw as Record<string, unknown>;
}

function toSafeSegment(value: string): string {
  return String(value || "").replaceAll(/[^A-Za-z0-9:_-]/g, "_");
}

function resolveSelectionFromRenderedId(args: {
  doc: PageBlueprint;
  renderedId: string;
}): EditorSelection {
  const id = (args.renderedId || "").trim();
  if (!id) return null;

  if (args.doc.nodesById[id]) return { kind: "doc", nodeId: id };

  for (const node of Object.values(args.doc.nodesById)) {
    if (!node || node.type !== "prefab_instance") continue;
    const safePrefabId = toSafeSegment(String(node.prefabId || ""));
    const safeInstanceId = toSafeSegment(String(node.id || ""));
    const prefix = `p_${safePrefabId}_${safeInstanceId}_`;
    if (!id.startsWith(prefix)) continue;
    const templateNodeId = id.slice(prefix.length).trim();
    if (!templateNodeId) return { kind: "doc", nodeId: node.id };
    return { kind: "prefabTpl", instanceId: node.id, templateNodeId };
  }

  return null;
}

function findParentId(doc: PageBlueprint, nodeId: string): string | null {
  for (const node of Object.values(doc.nodesById)) {
    if (!node) continue;
    if (node.type === "page_root") {
      if (node.children.includes(nodeId)) return node.id;
      continue;
    }
    if (node.type === "frame" || node.type === "group") {
      if (node.children.includes(nodeId)) return node.id;
      continue;
    }
    if (node.type === "prefab_instance") {
      const slots = node.slotChildren ?? {};
      for (const ids of Object.values(slots)) {
        if (Array.isArray(ids) && ids.includes(nodeId)) return node.id;
      }
    }
  }
  return null;
}

function isNodeMovable(doc: PageBlueprint, nodeId: string): boolean {
  const node = doc.nodesById[nodeId];
  if (!node) return false;
  if (node.type === "page_root") return false;
  if (!node.layout?.self?.rect) return false;

  // Section under page_root auto layout should be reordered, not freely moved.
  if (node.type === "prefab_instance" && node.prefabId === "section") {
    const parentId = findParentId(doc, nodeId);
    const parent = parentId ? doc.nodesById[parentId] : null;
    if (parent && parent.type === "page_root" && parent.layout?.children?.mode === "auto") {
      return false;
    }
  }
  return true;
}

function isReorderableSection(doc: PageBlueprint, nodeId: string): boolean {
  const node = doc.nodesById[nodeId];
  if (!node || node.type !== "prefab_instance" || node.prefabId !== "section") return false;
  const parentId = findParentId(doc, nodeId);
  const parent = parentId ? doc.nodesById[parentId] : null;
  return Boolean(parent && parent.type === "page_root" && parent.layout?.children?.mode === "auto");
}

function WorkspacePageEditorRoute() {
  const { t } = useTranslation(["editor"]);
  const { workspaceId, pageId } = Route.useParams();
  const qc = useQueryClient();
  const { message } = App.useApp();

  const themeMode = usePreferencesStore((s) => s.themeMode);
  const viewportWidth = useViewportStore((s) => s.width);
  const viewportHeight = useViewportStore((s) => s.height);
  const viewportMode = useViewportStore((s) => s.mode);

  const prefabRegistry = useMemo(() => createDefaultPrefabRegistryV1(), []);

  const [doc, setDoc] = useState<PageBlueprint>(() => createEmptyPageBlueprint());
  const [dirty, setDirty] = useState(false);
  const loadedSignatureRef = useRef<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selection, setSelection] = useState<EditorSelection>(null);
  const [viewerLocale, setViewerLocale] = useState<string>("");
  const [leftPanelKey, setLeftPanelKey] = useState<"blocks" | "data" | "layers">("blocks");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [hoveredRenderedNodeId, setHoveredRenderedNodeId] = useState<string | null>(null);
  const hoverRafRef = useRef<number | null>(null);
  const [canvasRootEl, setCanvasRootEl] = useState<HTMLDivElement | null>(null);
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null);
  const transformApiRef = useRef<SelectionTransformOverlayApi | null>(null);
  const directDragRef = useRef<{
    active: boolean;
    started: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    renderedId: string;
  } | null>(null);
  const docRef = useRef<PageBlueprint>(doc);
  const historyRef = useRef<{ past: PageBlueprint[]; future: PageBlueprint[] }>({
    past: [],
    future: [],
  });
  const [historyTick, setHistoryTick] = useState(0);
  const historyGroupRef = useRef<{ before: PageBlueprint | null; timer: number | null }>({
    before: null,
    timer: null,
  });

  const siteQuery = useQuery({
    queryKey: ["workspace", workspaceId, "site"],
    queryFn: () => getWorkspaceSite(workspaceId),
  });

  const pageQuery = useQuery({
    queryKey: ["workspace", workspaceId, "content", "pages", pageId],
    enabled: Boolean(workspaceId) && Boolean(pageId),
    queryFn: () => getWorkspacePage(workspaceId, pageId),
  });

  const tokenQuery = useQuery({
    queryKey: ["workspace", workspaceId, "site", "previewToken"],
    enabled: !!siteQuery.data?.siteId,
    queryFn: () => createWorkspacePreviewToken(workspaceId, { ttlSeconds: 600 }),
    staleTime: 4 * 60 * 1000,
  });

  const runtimeQuery = useQuery({
    queryKey: [
      "site",
      siteQuery.data?.siteId ?? "?",
      "runtime",
      "preview",
      tokenQuery.data?.token ?? "?",
    ],
    enabled: !!siteQuery.data?.siteId && !!tokenQuery.data?.token,
    queryFn: () => getSiteRuntimePreview(siteQuery.data!.siteId, tokenQuery.data!.token),
    staleTime: 60 * 1000,
  });

  const draftQuery = useQuery({
    queryKey: ["workspace", workspaceId, "content", "pages", pageId, "revision", "draft"],
    queryFn: async () => {
      try {
        return await getWorkspacePageDraftRevision(workspaceId, pageId);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          try {
            return await getWorkspacePagePublishedRevision(workspaceId, pageId);
          } catch (e2) {
            if (e2 instanceof ApiError && e2.status === 404) return null;
            throw e2;
          }
        }
        throw e;
      }
    },
  });

  const site: WorkspaceSiteOut | undefined = siteQuery.data;

  const rootDs = useMemo(() => readPageRootDataSources(doc), [doc]);
  const primaryEntryTypeHint = (rootDs.primaryEntryTypeHint ?? "").trim() || null;

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = directDragRef.current;
      if (!s || !s.active) return;
      if (e.pointerId !== s.pointerId) return;
      if (s.started) return;

      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (Math.hypot(dx, dy) < 3) return;

      const sel = resolveSelectionFromRenderedId({ doc: docRef.current, renderedId: s.renderedId });
      const targetNodeId =
        sel?.kind === "doc" ? sel.nodeId : sel?.kind === "prefabTpl" ? sel.instanceId : null;
      if (!targetNodeId) return;
      const beforeDoc = clonePageBlueprint(docRef.current);
      const reorderable = isReorderableSection(beforeDoc, targetNodeId);
      if (!reorderable && !isNodeMovable(beforeDoc, targetNodeId)) return;

      s.started = true;
      setSelection({ kind: "doc", nodeId: targetNodeId });
      if (reorderable) {
        const root = beforeDoc.nodesById[beforeDoc.rootId];
        const siblingIds = root && root.type === "page_root" ? (root.children ?? []) : [];
        transformApiRef.current?.beginReorder({
          nodeId: targetNodeId,
          pointerId: s.pointerId,
          startClientX: s.startX,
          startClientY: s.startY,
          beforeDoc,
          siblingIds,
        });
      } else {
        transformApiRef.current?.beginMove({
          nodeId: targetNodeId,
          pointerId: s.pointerId,
          startClientX: s.startX,
          startClientY: s.startY,
          beforeDoc,
        });
      }
    };

    const onUp = (e: PointerEvent) => {
      const s = directDragRef.current;
      if (!s || !s.active) return;
      if (e.pointerId !== s.pointerId) return;
      directDragRef.current = null;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const commitHistoryGroup = useCallback(() => {
    const g = historyGroupRef.current;
    if (g.timer) {
      window.clearTimeout(g.timer);
      g.timer = null;
    }
    if (!g.before) return;
    historyRef.current.past.push(g.before);
    historyRef.current.future = [];
    g.before = null;
    setHistoryTick((x) => x + 1);
  }, []);

  const applyDocChange = useCallback(
    (next: PageBlueprint, opts?: { history?: "grouped" | "immediate" | "none" }) => {
      const mode = opts?.history ?? "grouped";
      if (mode === "none") {
        setDoc(next);
        setDirty(true);
        return;
      }

      if (mode === "immediate") {
        commitHistoryGroup();
        historyRef.current.past.push(clonePageBlueprint(docRef.current));
        historyRef.current.future = [];
        setHistoryTick((x) => x + 1);
        setDoc(next);
        setDirty(true);
        return;
      }

      // grouped
      const g = historyGroupRef.current;
      if (!g.before) {
        commitHistoryGroup();
        g.before = clonePageBlueprint(docRef.current);
        historyRef.current.future = [];
        setHistoryTick((x) => x + 1);
      }
      if (g.timer) window.clearTimeout(g.timer);
      g.timer = window.setTimeout(() => {
        commitHistoryGroup();
      }, 500);
      setDoc(next);
      setDirty(true);
    },
    [commitHistoryGroup],
  );

  const deleteSelection = useCallback(() => {
    const sel = selection;
    if (!sel) return;

    const nodeId =
      sel.kind === "doc" ? sel.nodeId : sel.kind === "prefabTpl" ? sel.instanceId : null;
    if (!nodeId) return;
    if (nodeId === docRef.current.rootId) return;

    const collectSubtreeIds = (doc: PageBlueprint, startId: string): Set<string> => {
      const out = new Set<string>();
      const stack: string[] = [startId];
      while (stack.length) {
        const id = stack.pop();
        if (!id) continue;
        if (out.has(id)) continue;
        out.add(id);
        const n = doc.nodesById[id];
        if (!n) continue;

        if (n.type === "page_root" || n.type === "frame" || n.type === "group") {
          for (const childId of n.children ?? []) stack.push(childId);
          continue;
        }

        if (n.type === "prefab_instance") {
          const slots = n.slotChildren ?? {};
          for (const ids of Object.values(slots)) {
            if (!Array.isArray(ids)) continue;
            for (const childId of ids) stack.push(childId);
          }
        }
      }
      return out;
    };

    const before = clonePageBlueprint(docRef.current);
    const idsToDelete = collectSubtreeIds(before, nodeId);
    if (!idsToDelete.size) return;

    const next = clonePageBlueprint(before);

    // 1) 从所有父容器引用中移除（children / slotChildren）
    for (const n of Object.values(next.nodesById)) {
      if (!n) continue;
      if (n.type === "page_root" || n.type === "frame" || n.type === "group") {
        n.children = (n.children ?? []).filter((id) => !idsToDelete.has(id));
        continue;
      }
      if (n.type === "prefab_instance" && n.slotChildren) {
        const nextSlots: Record<string, string[]> = {};
        for (const [k, ids] of Object.entries(n.slotChildren)) {
          nextSlots[k] = (ids ?? []).filter((id) => !idsToDelete.has(id));
        }
        n.slotChildren = nextSlots;
      }
    }

    // 2) 删除 nodesById 中的节点
    for (const id of idsToDelete) {
      delete (next.nodesById as Record<string, unknown>)[id];
    }

    setSelection(null);
    applyDocChange(next, { history: "immediate" });
  }, [applyDocChange, selection]);

  const canUndo = useMemo(
    () => historyRef.current.past.length > 0 || historyGroupRef.current.before !== null,
    [historyTick, doc],
  );
  const canRedo = useMemo(() => historyRef.current.future.length > 0, [historyTick, doc]);

  const undo = useCallback(() => {
    commitHistoryGroup();
    const h = historyRef.current;
    const before = h.past.pop();
    if (!before) return;
    h.future.push(docRef.current);
    setDoc(clonePageBlueprint(before));
    setDirty(true);
    setHistoryTick((x) => x + 1);
  }, [commitHistoryGroup]);

  const redo = useCallback(() => {
    commitHistoryGroup();
    const h = historyRef.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(docRef.current);
    setDoc(clonePageBlueprint(next));
    setDirty(true);
    setHistoryTick((x) => x + 1);
  }, [commitHistoryGroup]);

  useEffect(() => {
    const isTextInput = (el: unknown): boolean => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = (node.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if ((node as any).isContentEditable) return true;
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextInput(e.target)) return;
      const key = (e.key || "").toLowerCase();

      if (key === "delete" || key === "backspace") {
        e.preventDefault();
        deleteSelection();
        return;
      }

      if (!(e.ctrlKey || e.metaKey)) return;
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (key === "y") {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelection, redo, undo]);

  const primaryEntryRevisionQuery = useQuery({
    queryKey: [
      "workspace",
      workspaceId,
      "content",
      "entries",
      rootDs.primaryEntryId ?? "?",
      "revision",
      "draft",
    ],
    enabled: Boolean(rootDs.primaryEntryId),
    queryFn: async () => {
      const entryId = (rootDs.primaryEntryId || "").trim();
      if (!entryId) return null;
      try {
        return await getWorkspaceContentEntryRevision(workspaceId, entryId, "draft");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          try {
            return await getWorkspaceContentEntryRevision(workspaceId, entryId, "published");
          } catch (e2) {
            if (e2 instanceof ApiError && e2.status === 404) return null;
            throw e2;
          }
        }
        throw e;
      }
    },
    staleTime: 10 * 1000,
  });

  useEffect(() => {
    const loaded = draftQuery.data;
    if (draftQuery.isLoading) return;
    const state = loaded?.state ?? "empty";
    const rev = loaded?.revision ?? 0;
    const sig = `${workspaceId}:${pageId}:${state}:${rev}`;
    if (loadedSignatureRef.current === sig) return;
    if (dirty) return;
    loadedSignatureRef.current = sig;
    const nextDocRaw = clonePageBlueprint(loaded?.pageBlueprint ?? createEmptyPageBlueprint());
    const nextDoc = normalizePageBlueprintToSectionStack({ doc: nextDocRaw, viewportWidth });
    historyRef.current.past = [];
    historyRef.current.future = [];
    historyGroupRef.current.before = null;
    if (historyGroupRef.current.timer) {
      window.clearTimeout(historyGroupRef.current.timer);
      historyGroupRef.current.timer = null;
    }
    setHistoryTick((x) => x + 1);
    setDoc(nextDoc);
  }, [dirty, draftQuery.data, draftQuery.isLoading, pageId, viewportWidth, workspaceId]);

  useEffect(() => {
    if (viewerLocale.trim()) return;
    const def = (site?.defaultLocale as string | undefined) || "";
    if (!def.trim()) return;
    setViewerLocale(def);
  }, [site?.defaultLocale, viewerLocale]);

  const supportedLocales = useMemo(() => {
    const fromRuntime = runtimeQuery.data?.siteLocalization?.supportedLocales ?? null;
    const arr = Array.isArray(fromRuntime) ? fromRuntime.filter(Boolean) : [];
    if (arr.length) return arr;
    const fallback = (site?.fallbackLocale as string | undefined) || "en-US";
    const def = (site?.defaultLocale as string | undefined) || "en-US";
    return Array.from(new Set([def, fallback].filter(Boolean)));
  }, [
    runtimeQuery.data?.siteLocalization?.supportedLocales,
    site?.defaultLocale,
    site?.fallbackLocale,
  ]);

  const defaultLocale = useMemo(() => {
    const fromRuntime = runtimeQuery.data?.siteLocalization?.defaultLocale ?? null;
    return (fromRuntime || site?.defaultLocale || "en-US") as string;
  }, [runtimeQuery.data?.siteLocalization?.defaultLocale, site?.defaultLocale]);

  const ctx: ViewerContext = useMemo(
    () => ({
      locale: (viewerLocale || site?.defaultLocale || "en-US") as string,
      fallbackLocale: (site?.fallbackLocale as string | undefined) || "en-US",
      breakpoint: resolveBreakpointNameByWidth(viewportWidth),
      mode: themeMode,
    }),
    [site?.defaultLocale, site?.fallbackLocale, themeMode, viewerLocale, viewportWidth],
  );

  const pagePath = pageQuery.data?.path || "";

  const renderDataSources = useMemo(() => {
    const routeParams: Record<string, string> = {};
    if (pageId) routeParams.pageId = String(pageId);
    if (pagePath) routeParams.path = String(pagePath);
    if (viewerLocale) routeParams.locale = String(viewerLocale);

    const siteData = runtimeQuery.data;
    const siteRoot: Record<string, unknown> = {};
    const identity = siteData?.site ?? null;
    if (identity) {
      if (identity.name) siteRoot.name = identity.name;
      if (identity.subtitle) siteRoot.subtitle = identity.subtitle;
      if (identity.description) siteRoot.description = identity.description;
      if (identity.url) siteRoot.url = identity.url;
      if (identity.logoUrl) siteRoot.logoUrl = identity.logoUrl;
      if (identity.faviconUrl) siteRoot.faviconUrl = identity.faviconUrl;
      if (identity.contactEmail) siteRoot.contactEmail = identity.contactEmail;
    }
    const loc = siteData?.siteLocalization ?? null;
    if (loc?.defaultLocale) siteRoot.defaultLocale = loc.defaultLocale;
    if (loc?.fallbackLocale) siteRoot.fallbackLocale = loc.fallbackLocale;
    if (loc?.supportedLocales) siteRoot.supportedLocales = loc.supportedLocales;
    if (loc?.timezone) siteRoot.timezone = loc.timezone;

    const seo = siteData?.seo ?? null;
    if (seo?.defaultTitle) siteRoot.seoDefaultTitle = seo.defaultTitle;
    if (seo?.defaultDescription) siteRoot.seoDefaultDescription = seo.defaultDescription;

    const viewer = {
      locale: ctx.locale,
      fallbackLocale: ctx.fallbackLocale,
      breakpoint: ctx.breakpoint,
      mode: ctx.mode,
    };

    const primaryEntryId = rootDs.primaryEntryId;
    const primaryEntryData = extractFieldValuesFromEntryRevisionSnapshot(
      primaryEntryRevisionQuery.data?.snapshot,
    );
    const primaryEntryFields =
      primaryEntryData && isRecord(primaryEntryData.fields)
        ? (primaryEntryData.fields as Record<string, unknown>)
        : (primaryEntryData ?? {});

    const primaryEntryFieldsWithPageMeta = (() => {
      if (!primaryEntryId) return primaryEntryFields;
      // When primaryEntry points to this page, keep fields.title/description aligned with latest page settings.
      if (primaryEntryId !== pageId) return primaryEntryFields;
      const title = (pageQuery.data?.title ?? "").trim();
      const description = (pageQuery.data?.description ?? "").trim();
      return {
        ...primaryEntryFields,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
      };
    })();

    return {
      ...(primaryEntryId
        ? { primaryEntry: { id: primaryEntryId, data: { fields: primaryEntryFieldsWithPageMeta } } }
        : {}),
      routeParams,
      site: siteRoot,
      viewer,
    };
  }, [
    ctx.breakpoint,
    ctx.fallbackLocale,
    ctx.locale,
    ctx.mode,
    pageId,
    pagePath,
    pageQuery.data?.description,
    pageQuery.data?.title,
    primaryEntryRevisionQuery.data?.snapshot,
    rootDs.primaryEntryId,
    runtimeQuery.data,
    viewerLocale,
  ]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const expectedRevision =
        draftQuery.data?.state === "draft"
          ? draftQuery.data.revision
          : // If we are currently displaying published/empty, the draft pointer is expected to be 0.
            0;
      const normalized = normalizePageBlueprintForSave(doc);
      return await saveWorkspacePageDraftRevision(workspaceId, pageId, {
        pageBlueprint: normalized,
        expectedRevision,
      });
    },
    onSuccess: async (out) => {
      setDirty(false);
      message.success(t("editor:EDITOR_PAGE_SAVED", { revision: out.revision }));
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "pages", pageId, "revision", "draft"],
      });
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "pages", "tree"],
      });
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "pages", pageId],
      });
    },
    onError: (err) => {
      message.error(String(err));
    },
  });

  const updatePageMutation = useMutation({
    mutationFn: async (payload: WorkspacePageUpdateIn) =>
      updateWorkspacePage(workspaceId, pageId, payload),
    onSuccess: async () => {
      message.success(t("editor:EDITOR_PAGE_SETTINGS_SAVED"));
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "pages", pageId],
      });
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "pages", "tree"],
      });
      setSettingsOpen(false);
    },
    onError: (err) => {
      message.error(String(err));
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const revision = draftQuery.data?.state === "draft" ? draftQuery.data.revision : null;
      return await publishWorkspacePageRevision(workspaceId, pageId, revision ? { revision } : {});
    },
    onSuccess: async (out) => {
      message.success(t("editor:EDITOR_PAGE_PUBLISHED", { revision: out.revision }));
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "pages", pageId],
      });
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "pages", "tree"],
      });
    },
    onError: (err) => {
      message.error(String(err));
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: async () => unpublishWorkspacePage(workspaceId, pageId),
    onSuccess: async () => {
      message.success(t("editor:EDITOR_PAGE_UNPUBLISHED"));
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "pages", pageId],
      });
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "pages", "tree"],
      });
    },
    onError: (err) => {
      message.error(String(err));
    },
  });

  const insertPrefab = (prefabId: string) => {
    const def = prefabRegistry.get(prefabId);
    if (!def) {
      message.error(`Unknown prefab: ${prefabId}`);
      return;
    }

    const selectedDocId = selection?.kind === "doc" ? selection.nodeId : null;
    const selected = selectedDocId ? docRef.current.nodesById[selectedDocId] : null;
    const targetSectionId =
      selected && selected.type === "prefab_instance" && selected.prefabId === "section"
        ? selected.id
        : null;

    const before = clonePageBlueprint(docRef.current);
    const next = clonePageBlueprint(before);
    const id = randomId(`p_${prefabId}`);

    const root = next.nodesById[next.rootId];
    const rootIsPage = root && root.type === "page_root";
    const rootHasSection =
      rootIsPage &&
      root.children.some((cid) => {
        const n = next.nodesById[cid];
        return n && n.type === "prefab_instance" && n.prefabId === "section";
      });

    const ensureRootSectionStack = () => {
      if (!rootIsPage) return;
      if (root.layout?.children?.mode === "auto") return;
      // 页面以 Section 为基本单元：使用纵向 auto layout 让 section 按顺序堆叠。
      root.layout = {
        ...root.layout,
        children: {
          mode: "auto",
          direction: "column",
          gap: 0,
          padding: 0,
          alignItems: "stretch",
          justifyContent: "start",
          wrap: "nowrap",
        },
      };
    };

    const props: PrefabInstancePropsV1 = {};
    // Minimal, deterministic defaults to keep the canvas non-empty.
    if (prefabId === "card") {
      props.title = { kind: "literal", value: "Celestial" };
      props.description = { kind: "literal", value: "这是一个 prefab card（可保存为页面草稿）。" };
      props.imageSrc = { kind: "literal", value: "https://picsum.photos/800/400" };
      props.href = { kind: "literal", value: "" };
    } else {
      for (const field of def.manifest.attributes ?? []) {
        if (field.default !== undefined) {
          props[field.key] = { kind: "literal", value: field.default };
          continue;
        }
        props[field.key] = { kind: "literal", value: "" };
      }
    }

    const insertRect = (() => {
      if (prefabId === "section") {
        return { x: 0, y: nextInsertRectY(next), width: viewportWidth, height: 640 };
      }
      if (targetSectionId) {
        return {
          x: 24,
          y: nextInsertRectYInSection(next, targetSectionId),
          width: 360,
          height: 240,
        };
      }
      return { x: 40, y: nextInsertRectY(next), width: 360, height: 240 };
    })();

    next.nodesById[id] = {
      id,
      type: "prefab_instance",
      name: prefabId,
      prefabId,
      props,
      layout: {
        self: {
          rect: insertRect,
          alignX: "start",
          alignY: "start",
        },
        children: { mode: "absolute" },
      },
    };
    const appendToSection = (sectionId: string, childId: string) => {
      const section = next.nodesById[sectionId];
      if (!section || section.type !== "prefab_instance") return false;
      const prev = section.slotChildren?.default ?? [];
      section.slotChildren = { ...section.slotChildren, default: [...prev, childId] };
      return true;
    };

    if (prefabId === "section") {
      ensureRootSectionStack();
      if (rootIsPage) root.children = [...root.children, id];
    } else if (targetSectionId) {
      appendToSection(targetSectionId, id);
    } else if (rootHasSection && rootIsPage) {
      // 未显式选中 Section 时，默认插入到最后一个 Section。
      const lastSectionId = [...root.children].reverse().find((cid) => {
        const n = next.nodesById[cid];
        return n && n.type === "prefab_instance" && n.prefabId === "section";
      });
      if (lastSectionId) {
        appendToSection(lastSectionId, id);
      } else {
        root.children = [...root.children, id];
      }
    } else if (rootIsPage) {
      // 页面还没有 Section：自动创建一个 Section，并把新 block 插进去，保持网页式结构。
      ensureRootSectionStack();
      const sectionDef = prefabRegistry.get("section");
      const sectionId = randomId("p_section");
      const sectionProps: PrefabInstancePropsV1 = {};
      for (const field of sectionDef?.manifest.attributes ?? []) {
        if (field.default !== undefined)
          sectionProps[field.key] = { kind: "literal", value: field.default };
      }
      next.nodesById[sectionId] = {
        id: sectionId,
        type: "prefab_instance",
        name: "section",
        prefabId: "section",
        props: sectionProps,
        slotChildren: { default: [id] },
        layout: {
          self: {
            rect: { x: 0, y: nextInsertRectY(next), width: viewportWidth, height: 640 },
            alignX: "start",
            alignY: "start",
          },
          children: { mode: "absolute" },
        },
      };
      // 给 child 一个更合理的初始位置（Section 内）。
      const child = next.nodesById[id];
      if (child && child.type === "prefab_instance" && child.layout?.self?.rect) {
        child.layout.self.rect.x = 24;
        child.layout.self.rect.y = 24;
      }
      root.children = [...root.children, sectionId];
    }

    applyDocChange(next, { history: "immediate" });
    setSelection({ kind: "doc", nodeId: id });
  };

  const hoveredSelection = hoveredRenderedNodeId
    ? resolveSelectionFromRenderedId({ doc, renderedId: hoveredRenderedNodeId })
    : null;
  const hoveredSelectableNodeId =
    hoveredSelection?.kind === "doc"
      ? hoveredSelection.nodeId
      : hoveredSelection?.kind === "prefabTpl"
        ? hoveredSelection.instanceId
        : null;

  const selectedDocNodeId =
    selection?.kind === "doc"
      ? selection.nodeId
      : selection?.kind === "prefabTpl"
        ? selection.instanceId
        : null;
  const selectedRenderableId = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === "doc") return selection.nodeId;
    const inst = doc.nodesById[selection.instanceId];
    if (!inst || inst.type !== "prefab_instance") return null;
    const safePrefabId = toSafeSegment(String(inst.prefabId || ""));
    const safeInstanceId = toSafeSegment(String(inst.id || ""));
    return `p_${safePrefabId}_${safeInstanceId}_${selection.templateNodeId}`;
  }, [doc.nodesById, selection]);

  const portalOrigin = useMemo(
    () => resolvePortalOrigin({ workspaceSlug: siteQuery.data?.slug }),
    [siteQuery.data?.slug],
  );
  const previewHref = useMemo(() => {
    const siteId = siteQuery.data?.siteId;
    const token = tokenQuery.data?.token;
    if (!siteId || !token || !pagePath.startsWith("/")) return "";
    const u = new URL(`/preview/site/${encodeURIComponent(siteId)}${pagePath}`, portalOrigin);
    u.searchParams.set("token", token);
    return u.toString();
  }, [pagePath, portalOrigin, siteQuery.data?.siteId, tokenQuery.data?.token]);
  const publicHref = useMemo(() => {
    if (!pagePath.startsWith("/")) return "";
    return new URL(pagePath, portalOrigin).toString();
  }, [pagePath, portalOrigin]);

  const loading =
    siteQuery.isLoading ||
    pageQuery.isLoading ||
    tokenQuery.isLoading ||
    runtimeQuery.isLoading ||
    draftQuery.isLoading;
  const fatalError =
    siteQuery.error ||
    pageQuery.error ||
    tokenQuery.error ||
    runtimeQuery.error ||
    draftQuery.error;

  if (fatalError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="w-full max-w-2xl">
          <Alert
            type="error"
            message={t("editor:EDITOR_PAGE_LOAD_ERROR_TITLE")}
            description={String(fatalError)}
            showIcon
          />
          <div className="mt-4 flex justify-end">
            <Link to="/w/$workspaceId/" params={{ workspaceId }}>
              <Button>{t("editor:EDITOR_PAGE_BACK_TO_PAGES")}</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center border-b bg-card px-3">
        <div className="flex w-full items-center justify-between gap-3">
          <Space size={8}>
            <Link to="/w/$workspaceId/" params={{ workspaceId }}>
              <Button size="small">{t("editor:EDITOR_PAGE_BACK_TO_PAGES")}</Button>
            </Link>
            <Typography.Text strong>{t("editor:EDITOR_PAGE_EDITOR_TITLE")}</Typography.Text>
            <Typography.Text type="secondary" className="text-caption">
              {t("editor:EDITOR_PAGE_EDITOR_SUBTITLE", { pageId })}
            </Typography.Text>
          </Space>
          <Space size={8} wrap>
            {pageQuery.data?.path ? (
              <Tag>{pageQuery.data.path}</Tag>
            ) : (
              <Tag color="default">{t("editor:EDITOR_PAGE_PATH_UNKNOWN")}</Tag>
            )}
            <Select
              value={(viewerLocale || defaultLocale).trim() || "en-US"}
              options={supportedLocales.map((loc) => ({ value: loc, label: loc }))}
              onChange={(v) => setViewerLocale(String(v))}
              style={{ minWidth: 120 }}
              size="small"
              placeholder={t("editor:EDITOR_VIEWER_LOCALE")}
            />
            {dirty ? (
              <Tag color="orange">{t("editor:EDITOR_PAGE_DIRTY")}</Tag>
            ) : (
              <Tag>{t("editor:EDITOR_PAGE_CLEAN")}</Tag>
            )}
            {pageQuery.data?.publishedRevision ? (
              <Tag color="green">{t("editor:EDITOR_PAGE_STATUS_PUBLISHED")}</Tag>
            ) : (
              <Tag color="default">{t("editor:EDITOR_PAGE_STATUS_DRAFT_ONLY")}</Tag>
            )}
            <Button
              size="small"
              onClick={() => setSettingsOpen(true)}
              disabled={loading || dirty || updatePageMutation.isPending}
              title={dirty ? t("editor:EDITOR_PAGE_SETTINGS_DISABLED_DIRTY") : undefined}
            >
              {t("editor:EDITOR_PAGE_SETTINGS")}
            </Button>
            <Button size="small" onClick={undo} disabled={loading || !canUndo}>
              {t("editor:EDITOR_HISTORY_UNDO")}
            </Button>
            <Button size="small" onClick={redo} disabled={loading || !canRedo}>
              {t("editor:EDITOR_HISTORY_REDO")}
            </Button>
            <Button
              size="small"
              type="primary"
              onClick={() => void saveMutation.mutateAsync()}
              disabled={loading || !dirty}
              loading={saveMutation.isPending}
            >
              {t("editor:EDITOR_PAGE_SAVE")}
            </Button>
            <Button
              size="small"
              onClick={() => void publishMutation.mutateAsync()}
              disabled={
                loading ||
                dirty ||
                publishMutation.isPending ||
                !(pageQuery.data?.draftRevision && pageQuery.data.draftRevision > 0)
              }
              loading={publishMutation.isPending}
              title={dirty ? t("editor:EDITOR_PAGE_PUBLISH_DISABLED_DIRTY") : undefined}
            >
              {t("editor:EDITOR_PAGE_PUBLISH")}
            </Button>
            <Button
              size="small"
              danger
              onClick={() => void unpublishMutation.mutateAsync()}
              disabled={
                loading ||
                dirty ||
                !pageQuery.data?.publishedRevision ||
                unpublishMutation.isPending
              }
              loading={unpublishMutation.isPending}
              title={dirty ? t("editor:EDITOR_PAGE_UNPUBLISH_DISABLED_DIRTY") : undefined}
            >
              {t("editor:EDITOR_PAGE_UNPUBLISH")}
            </Button>
            <Button
              size="small"
              onClick={() => {
                if (!previewHref) return;
                window.open(previewHref, "_blank", "noopener,noreferrer");
              }}
              disabled={loading || !previewHref}
            >
              {t("editor:EDITOR_PAGE_OPEN_PREVIEW")}
            </Button>
            <Button
              size="small"
              onClick={() => {
                if (!publicHref) return;
                window.open(publicHref, "_blank", "noopener,noreferrer");
              }}
              disabled={loading || !publicHref || !pageQuery.data?.publishedRevision}
              title={
                !pageQuery.data?.publishedRevision
                  ? t("editor:EDITOR_PAGE_OPEN_PUBLIC_DISABLED")
                  : undefined
              }
            >
              {t("editor:EDITOR_PAGE_OPEN_PUBLIC")}
            </Button>
          </Space>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-12 flex-col items-stretch border-r bg-card">
          <Button
            type="text"
            size="small"
            className={leftPanelKey === "blocks" ? "bg-muted" : ""}
            onClick={() => {
              setLeftPanelKey("blocks");
              setLeftCollapsed(false);
            }}
            title={t("editor:EDITOR_LEFT_MENU_BLOCKS")}
          >
            B
          </Button>
          <Button
            type="text"
            size="small"
            className={leftPanelKey === "data" ? "bg-muted" : ""}
            onClick={() => {
              setLeftPanelKey("data");
              setLeftCollapsed(false);
            }}
            title={t("editor:EDITOR_LEFT_MENU_DATA")}
          >
            D
          </Button>
          <Button
            type="text"
            size="small"
            className={leftPanelKey === "layers" ? "bg-muted" : ""}
            onClick={() => {
              setLeftPanelKey("layers");
              setLeftCollapsed(false);
            }}
            title={t("editor:EDITOR_LEFT_MENU_LAYERS")}
          >
            L
          </Button>
          <div className="mt-auto">
            <Button
              type="text"
              size="small"
              onClick={() => setLeftCollapsed((v) => !v)}
              title={t("editor:EDITOR_LEFT_MENU_TOGGLE_PANEL")}
            >
              {leftCollapsed ? ">" : "<"}
            </Button>
          </div>
        </div>

        <aside className={leftCollapsed ? "hidden" : "w-[360px] shrink-0 border-r bg-background"}>
          <div className="h-full overflow-auto p-3">
            {leftPanelKey === "blocks" ? (
              <BlocksPanel
                prefabRegistry={prefabRegistry}
                ctx={ctx}
                onInsertPrefab={insertPrefab}
              />
            ) : null}

            {leftPanelKey === "data" ? (
              <PageDataPanel
                workspaceId={workspaceId}
                doc={doc}
                onChangeDoc={(next) => {
                  applyDocChange(next, { history: "grouped" });
                }}
              />
            ) : null}

            {leftPanelKey === "layers" ? (
              <LayersPanel
                doc={doc}
                prefabRegistry={prefabRegistry}
                selection={selection}
                onSelectSelection={setSelection}
                onRequestDelete={deleteSelection}
              />
            ) : null}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center bg-muted/30">
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/70" />
                <Typography.Text type="secondary">
                  {t("editor:EDITOR_PAGE_LOADING")}
                </Typography.Text>
              </div>
            </div>
          ) : (
            <div className="h-full" style={mergeCssVars(runtimeQuery.data)}>
              <PageSettingsDrawer
                open={settingsOpen}
                page={pageQuery.data}
                pageBlueprint={doc}
                supportedLocales={runtimeQuery.data?.siteLocalization?.supportedLocales ?? null}
                defaultLocale={
                  runtimeQuery.data?.siteLocalization?.defaultLocale ??
                  siteQuery.data?.defaultLocale ??
                  null
                }
                fallbackLocale={
                  runtimeQuery.data?.siteLocalization?.fallbackLocale ??
                  siteQuery.data?.fallbackLocale ??
                  null
                }
                saving={updatePageMutation.isPending}
                onClose={() => setSettingsOpen(false)}
                onSubmit={async (payload) => {
                  await updatePageMutation.mutateAsync(payload);
                }}
                onChangePageBlueprintSeo={(next) => {
                  applyDocChange(next, { history: "grouped" });
                }}
              />

              <ViewportCanvas scrollerRef={(node) => setScrollerEl(node)}>
                <div
                  ref={setCanvasRootEl}
                  className="relative w-full"
                  onPointerDownCapture={(e) => {
                    if (viewportMode !== "edit") return;
                    if (e.button !== 0) return;
                    const target = e.target as HTMLElement | null;
                    if (!target) return;
                    if (target.closest('[data-celestial="transform-handle"]')) return;
                    const el = target.closest("[data-node-id]") as HTMLElement | null;
                    if (!el) return;
                    const renderedId = (el.getAttribute("data-node-id") || "").trim();
                    if (!renderedId) return;
                    directDragRef.current = {
                      active: true,
                      started: false,
                      pointerId: e.pointerId,
                      startX: e.clientX,
                      startY: e.clientY,
                      renderedId,
                    };
                  }}
                  onPointerMoveCapture={(e) => {
                    if (viewportMode !== "edit") return;
                    const target = e.target as HTMLElement | null;
                    if (!target) return;
                    const el = target.closest("[data-node-id]") as HTMLElement | null;
                    const renderedId = el?.getAttribute("data-node-id") || "";
                    const next = renderedId.trim() ? renderedId.trim() : null;

                    if (hoverRafRef.current) window.cancelAnimationFrame(hoverRafRef.current);
                    hoverRafRef.current = window.requestAnimationFrame(() => {
                      setHoveredRenderedNodeId(next);
                    });
                  }}
                  onPointerLeave={() => {
                    if (hoverRafRef.current) window.cancelAnimationFrame(hoverRafRef.current);
                    hoverRafRef.current = null;
                    setHoveredRenderedNodeId(null);
                  }}
                  onClickCapture={(e) => {
                    if (viewportMode !== "edit") return;
                    const target = e.target as HTMLElement | null;
                    if (!target) return;
                    const el = target.closest("[data-node-id]") as HTMLElement | null;
                    if (!el) {
                      setSelection(null);
                      return;
                    }
                    const renderedId = el.getAttribute("data-node-id") || "";
                    const nextSel = resolveSelectionFromRenderedId({ doc, renderedId });
                    if (!nextSel) return;
                    setSelection(nextSel);
                  }}
                >
                  <style>{`
                    [data-node-id][data-node-type="prefab_instance"],
                    [data-node-id][data-node-type="frame"],
                    [data-node-id][data-node-type="group"],
                    [data-node-id][data-node-type="rect"]{ cursor: grab; }
                    [data-node-id][data-node-type="text"],
                    [data-node-id][data-node-type="image"],
                    [data-node-id][data-node-type="embed"],
                    [data-node-id][data-node-type="content_ref"]{ cursor: pointer; }
                    [data-node-id][data-node-type="page_root"]{ cursor: default; }
                  `}</style>
                  <PageBlueprintRenderer
                    document={doc}
                    ctx={ctx}
                    viewport={{ width: viewportWidth, height: viewportHeight }}
                    prefabRegistry={prefabRegistry}
                    dataSources={renderDataSources}
                  />
                  <NodeHoverOverlayLayer
                    enabled={viewportMode === "edit"}
                    doc={doc}
                    prefabRegistry={prefabRegistry}
                    canvasRootEl={canvasRootEl}
                    scrollerEl={scrollerEl}
                    selectedRenderedNodeId={selectedRenderableId}
                    hoveredRenderedNodeId={hoveredRenderedNodeId}
                    hoveredSelectableNodeId={hoveredSelectableNodeId}
                  />
                  <SelectionTransformOverlay
                    ref={transformApiRef}
                    enabled={viewportMode === "edit"}
                    doc={doc}
                    nodeId={selectedDocNodeId}
                    moveEnabled={selectedDocNodeId ? isNodeMovable(doc, selectedDocNodeId) : true}
                    canvasRootEl={canvasRootEl}
                    scrollerEl={scrollerEl}
                    onStartTransform={() => commitHistoryGroup()}
                    onPreviewNextDoc={(next) => {
                      setDoc(next);
                      setDirty(true);
                    }}
                    onCommitBeforeDoc={(before) => {
                      commitHistoryGroup();
                      historyRef.current.past.push(clonePageBlueprint(before));
                      historyRef.current.future = [];
                      setHistoryTick((x) => x + 1);
                    }}
                    onCommitNextDoc={(next) => {
                      setDoc(next);
                      setDirty(true);
                    }}
                  />
                </div>
              </ViewportCanvas>
            </div>
          )}
        </main>

        <aside
          className={
            selection
              ? "w-[420px] shrink-0 border-l bg-background"
              : "w-0 shrink-0 overflow-hidden border-l bg-background"
          }
        >
          {selection ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
                <Typography.Text strong>{t("editor:EDITOR_NODE_INSPECTOR_TITLE")}</Typography.Text>
                <Space size={8}>
                  <Button
                    danger
                    size="small"
                    onClick={deleteSelection}
                    disabled={selection.kind === "doc" && selection.nodeId === doc.rootId}
                  >
                    {t("editor:EDITOR_DELETE")}
                  </Button>
                  <Button size="small" onClick={() => setSelection(null)}>
                    {t("editor:EDITOR_PANEL_CLOSE")}
                  </Button>
                </Space>
              </div>
              <div className="min-h-0 flex-1">
                {selection.kind === "prefabTpl" ? (
                  <PrefabTemplateNodeInspectorPanel
                    workspaceId={workspaceId}
                    doc={doc}
                    instanceId={selection.instanceId}
                    templateNodeId={selection.templateNodeId}
                    prefabRegistry={prefabRegistry}
                    supportedLocales={supportedLocales}
                    defaultLocale={defaultLocale}
                    primaryEntryTypeHint={primaryEntryTypeHint}
                    onChangeDoc={(next) => applyDocChange(next, { history: "grouped" })}
                  />
                ) : (
                  <NodeInspectorPanel
                    workspaceId={workspaceId}
                    doc={doc}
                    nodeId={selection.nodeId}
                    prefabRegistry={prefabRegistry}
                    supportedLocales={supportedLocales}
                    defaultLocale={defaultLocale}
                    onChangeDoc={(next) => {
                      applyDocChange(next, { history: "grouped" });
                    }}
                    header={false}
                  />
                )}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
