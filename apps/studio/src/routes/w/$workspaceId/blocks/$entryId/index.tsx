import type { CSSProperties } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Alert, App, Button, Card, Select, Space, Tag, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
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
  isPageBlueprint,
  PageBlueprintRenderer,
} from "@celestial/renderer";

import {
  getWorkspaceContentEntry,
  getWorkspaceContentEntryRevision,
  publishWorkspaceContentEntry,
  saveWorkspaceContentEntryDraft,
  unpublishWorkspaceContentEntry,
} from "@/api/content-entries";
import {
  createWorkspacePreviewToken,
  getSiteRuntimePreview,
  getWorkspaceSite,
} from "@/api/workspace-site";
import { NodeInspectorPanel } from "@/components/inspector/node-inspector-drawer";
import { BlocksPanel } from "@/components/panels/blocks-panel";
import { ViewportCanvas } from "@/components/viewport/viewport-canvas";
import { clonePageBlueprint, normalizePageBlueprintForSave } from "@/lib/page-blueprint";
import { buildAdminReturnUrl, parseStudioEntrySearch } from "@/lib/routing/admin-handoff";
import { usePreferencesStore } from "@/stores/use-preferences-store";
import { useViewportStore } from "@/stores/use-viewport-store";
import type { ContentEntryRevisionOut, SiteRuntimeOut, WorkspaceSiteOut } from "@/types/api";

export const Route = createFileRoute("/w/$workspaceId/blocks/$entryId/")({
  validateSearch: (search: Record<string, unknown>) => parseStudioEntrySearch(search),
  component: WorkspaceReusableBlockEditorRoute,
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

function extractPageBlueprintFromRevision(
  revision: ContentEntryRevisionOut | null | undefined,
): PageBlueprint | null {
  const snapshot = revision?.snapshot;
  const raw = snapshot?.pageBlueprint ?? snapshot?.page_blueprint ?? null;
  if (!raw || !isPageBlueprint(raw)) return null;
  return raw as PageBlueprint;
}

function toSafeSegment(value: string): string {
  return String(value || "").replaceAll(/[^A-Za-z0-9:_-]/g, "_");
}

function resolveDocNodeIdFromRenderedId(args: {
  doc: PageBlueprint;
  renderedId: string;
}): string | null {
  const id = (args.renderedId || "").trim();
  if (!id) return null;
  if (args.doc.nodesById[id]) return id;

  for (const node of Object.values(args.doc.nodesById)) {
    if (!node || node.type !== "prefab_instance") continue;
    const safePrefabId = toSafeSegment(String(node.prefabId || ""));
    const safeInstanceId = toSafeSegment(String(node.id || ""));
    const prefix = `p_${safePrefabId}_${safeInstanceId}_`;
    if (!id.startsWith(prefix)) continue;
    return node.id;
  }

  return null;
}

function WorkspaceReusableBlockEditorRoute() {
  const { t } = useTranslation(["editor"]);
  const { workspaceId, entryId } = Route.useParams();
  const handoffSearch = Route.useSearch();
  const qc = useQueryClient();
  const { message } = App.useApp();

  const themeMode = usePreferencesStore((s) => s.themeMode);
  const viewportWidth = useViewportStore((s) => s.width);
  const viewportHeight = useViewportStore((s) => s.height);
  const viewportMode = useViewportStore((s) => s.mode);

  const prefabRegistry = useMemo(() => createDefaultPrefabRegistryV1(), []);

  const [doc, setDoc] = useState<PageBlueprint>(() => createEmptyPageBlueprint());
  const docRef = useRef<PageBlueprint>(doc);
  const [dirty, setDirty] = useState(false);
  const loadedSignatureRef = useRef<string | null>(null);
  const [selectionNodeId, setSelectionNodeId] = useState<string | null>(null);
  const [viewerLocale, setViewerLocale] = useState<string>("");
  const adminReturnUrl = useMemo(
    () => buildAdminReturnUrl(handoffSearch.returnTo),
    [handoffSearch.returnTo],
  );

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const siteQuery = useQuery({
    queryKey: ["workspace", workspaceId, "site"],
    queryFn: () => getWorkspaceSite(workspaceId),
  });

  const entryQuery = useQuery({
    queryKey: ["workspace", workspaceId, "content", "entries", entryId],
    enabled: Boolean(workspaceId) && Boolean(entryId),
    queryFn: () => getWorkspaceContentEntry(workspaceId, entryId),
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

  const revisionQuery = useQuery({
    queryKey: ["workspace", workspaceId, "content", "entries", entryId, "revision", "draft"],
    enabled: Boolean(workspaceId) && Boolean(entryId),
    queryFn: async () => {
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
  });

  const site: WorkspaceSiteOut | undefined = siteQuery.data;

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

  useEffect(() => {
    if (revisionQuery.isLoading) return;
    const revision = revisionQuery.data;
    const signature = revision ? `${revision.state}:${revision.revision}` : "empty";
    if (loadedSignatureRef.current === signature) return;
    loadedSignatureRef.current = signature;

    const existing = extractPageBlueprintFromRevision(revision);
    setDoc(existing ? clonePageBlueprint(existing) : createEmptyPageBlueprint());
    setDirty(false);
    setSelectionNodeId(null);
  }, [revisionQuery.data, revisionQuery.isLoading]);

  const insertPrefab = (prefabId: string) => {
    const def = prefabRegistry.get(prefabId);
    if (!def) {
      message.error(`Unknown prefab: ${prefabId}`);
      return;
    }

    const selected = selectionNodeId ? docRef.current.nodesById[selectionNodeId] : null;
    const targetSectionId =
      selected && selected.type === "prefab_instance" && selected.prefabId === "section"
        ? selected.id
        : null;

    const next = clonePageBlueprint(docRef.current);
    const id = randomId(`p_${prefabId}`);

    const props: PrefabInstancePropsV1 = {};
    for (const field of def.manifest.attributes ?? []) {
      if (field.default !== undefined) {
        props[field.key] = { kind: "literal", value: field.default };
      } else {
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

    const root = next.nodesById[next.rootId];
    const rootIsPage = root && root.type === "page_root";

    const appendToSection = (sectionId: string, childId: string) => {
      const section = next.nodesById[sectionId];
      if (!section || section.type !== "prefab_instance") return false;
      const prev = section.slotChildren?.default ?? [];
      section.slotChildren = { ...section.slotChildren, default: [...prev, childId] };
      return true;
    };

    if (prefabId === "section") {
      if (rootIsPage) root.children = [...root.children, id];
    } else if (targetSectionId) {
      appendToSection(targetSectionId, id);
    } else if (rootIsPage) {
      root.children = [...root.children, id];
    }

    setDoc(next);
    setDirty(true);
    setSelectionNodeId(id);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const expectedRevision = entryQuery.data?.draftRevision
        ? entryQuery.data.draftRevision
        : null;
      const typeCode = (entryQuery.data?.typeCode || "").trim() || "reusable_block";
      return await saveWorkspaceContentEntryDraft(workspaceId, entryId, {
        pageBlueprint: normalizePageBlueprintForSave(doc),
        expectedRevision,
        meta: { kind: typeCode },
      });
    },
    onSuccess: async (out) => {
      message.success(t("editor:EDITOR_BLOCK_SAVED", { revision: out.revision }));
      setDirty(false);
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "entries", entryId],
      });
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "entries", entryId, "revision", "draft"],
      });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        message.error(err.message || t("editor:EDITOR_ROUTER_ERROR_TITLE"));
        return;
      }
      message.error(String(err));
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const revision = entryQuery.data?.draftRevision ?? null;
      return await publishWorkspaceContentEntry(workspaceId, entryId, { revision });
    },
    onSuccess: async (out) => {
      message.success(t("editor:EDITOR_BLOCK_PUBLISHED", { revision: out.revision }));
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "entries", entryId],
      });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        message.error(err.message || t("editor:EDITOR_ROUTER_ERROR_TITLE"));
        return;
      }
      message.error(String(err));
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: async () => {
      return await unpublishWorkspaceContentEntry(workspaceId, entryId);
    },
    onSuccess: async () => {
      message.success(t("editor:EDITOR_BLOCK_UNPUBLISHED"));
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "entries", entryId],
      });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        message.error(err.message || t("editor:EDITOR_ROUTER_ERROR_TITLE"));
        return;
      }
      message.error(String(err));
    },
  });

  const status = entryQuery.data?.publishedRevision
    ? t("editor:EDITOR_BLOCK_STATUS_PUBLISHED")
    : t("editor:EDITOR_BLOCK_STATUS_DRAFT_ONLY");

  const loading =
    siteQuery.isLoading ||
    entryQuery.isLoading ||
    tokenQuery.isLoading ||
    runtimeQuery.isLoading ||
    revisionQuery.isLoading;
  const fatalError =
    siteQuery.error ||
    entryQuery.error ||
    tokenQuery.error ||
    runtimeQuery.error ||
    revisionQuery.error;

  if (fatalError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="w-full max-w-2xl">
          <Alert
            type="error"
            message={t("editor:EDITOR_BLOCK_LOAD_ERROR_TITLE")}
            description={String(fatalError)}
            showIcon
          />
          <div className="mt-4 flex justify-end">
            <Link to="/w/$workspaceId/blocks/" params={{ workspaceId }}>
              <Button>{t("editor:EDITOR_BLOCK_BACK_TO_BLOCKS")}</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background" style={mergeCssVars(runtimeQuery.data)}>
      <header className="flex h-12 shrink-0 items-center border-b bg-card px-3">
        <div className="flex w-full items-center justify-between gap-3">
          <Space size={8} wrap>
            <Link to="/w/$workspaceId/blocks/" params={{ workspaceId }}>
              <Button size="small">{t("editor:EDITOR_BLOCK_BACK_TO_BLOCKS")}</Button>
            </Link>
            {adminReturnUrl ? (
              <Button
                size="small"
                onClick={() => {
                  window.location.assign(adminReturnUrl);
                }}
              >
                {t("editor:EDITOR_PAGE_BACK_TO_ADMIN")}
              </Button>
            ) : null}
            <Typography.Text strong>{t("editor:EDITOR_BLOCK_EDITOR_TITLE")}</Typography.Text>
            <Typography.Text type="secondary" className="text-caption">
              {t("editor:EDITOR_BLOCK_EDITOR_SUBTITLE", { entryId })}
            </Typography.Text>
          </Space>

          <Space size={8} wrap>
            <Tag color={entryQuery.data?.publishedRevision ? "green" : "gold"}>{status}</Tag>
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
              <Tag color="default">{t("editor:EDITOR_PAGE_CLEAN")}</Tag>
            )}
            <Button
              size="small"
              type="primary"
              loading={saveMutation.isPending}
              disabled={loading || !dirty}
              onClick={() => void saveMutation.mutateAsync()}
            >
              {t("editor:EDITOR_BLOCK_SAVE")}
            </Button>
            {entryQuery.data?.publishedRevision ? (
              <Button
                size="small"
                loading={unpublishMutation.isPending}
                disabled={loading || dirty}
                onClick={() => void unpublishMutation.mutateAsync()}
              >
                {t("editor:EDITOR_BLOCK_UNPUBLISH")}
              </Button>
            ) : (
              <Button
                size="small"
                loading={publishMutation.isPending}
                disabled={loading || dirty || !entryQuery.data?.draftRevision}
                onClick={() => void publishMutation.mutateAsync()}
              >
                {t("editor:EDITOR_BLOCK_PUBLISH")}
              </Button>
            )}
          </Space>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[360px] shrink-0 border-r bg-background">
          <div className="h-full overflow-auto px-4 py-4">
            <BlocksPanel prefabRegistry={prefabRegistry} ctx={ctx} onInsertPrefab={insertPrefab} />
          </div>
        </aside>

        <main className="flex-1">
          <ViewportCanvas>
            <div
              className="relative h-full"
              onClickCapture={(e) => {
                if (viewportMode !== "edit") return;
                const target = e.target as HTMLElement | null;
                const el = target?.closest("[data-node-id]") as HTMLElement | null;
                if (!el) {
                  setSelectionNodeId(null);
                  return;
                }
                const renderedId = el.getAttribute("data-node-id") || "";
                const resolved = resolveDocNodeIdFromRenderedId({ doc, renderedId });
                setSelectionNodeId(resolved);
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
              />
            </div>
          </ViewportCanvas>
        </main>

        <aside className="w-[420px] shrink-0 border-l bg-background">
          <NodeInspectorPanel
            workspaceId={workspaceId}
            doc={doc}
            nodeId={selectionNodeId}
            prefabRegistry={prefabRegistry}
            supportedLocales={supportedLocales}
            defaultLocale={defaultLocale}
            onChangeDoc={(next) => {
              setDoc(next);
              setDirty(true);
            }}
          />
        </aside>
      </div>
    </div>
  );
}
