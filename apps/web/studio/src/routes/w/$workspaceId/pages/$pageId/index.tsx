import type { CSSProperties } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Card, Space, Tag, Typography, Select } from "antd";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@celestial/web-runtime/http";
import { resolveBreakpointNameByWidth } from "@celestial/site-block-protocol";
import type { PageBlueprint, ViewerContext } from "@celestial/site-block-protocol";
import {
  createDefaultPrefabRegistryV1,
  createEmptyPageBlueprint,
  PageBlueprintRenderer,
} from "@celestial/site-renderer-core";

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
import { PageDataPanel } from "@/components/panels/page-data-panel";
import { ViewportCanvas } from "@/components/viewport/viewport-canvas";
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

function randomId(prefix: string): string {
  const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `${prefix}_${c.randomUUID()}`;
  return `${prefix}_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
}

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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewerLocale, setViewerLocale] = useState<string>("");
  const [leftPanelKey, setLeftPanelKey] = useState<"blocks" | "data" | "layers" | null>("blocks");

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
    setDoc(clonePageBlueprint(loaded?.pageBlueprint ?? createEmptyPageBlueprint()));
  }, [dirty, draftQuery.data, draftQuery.isLoading, pageId, workspaceId]);

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

  const onInsertCard = () => {
    setDoc((prev) => {
      const next = clonePageBlueprint(prev);
      const id = randomId("card");
      next.nodesById[id] = {
        id,
        type: "prefab_instance",
        name: "Card",
        prefabId: "card",
        props: {
          title: { kind: "literal", value: "Celestial" },
          description: { kind: "literal", value: "这是一个 prefab card（可保存为页面草稿）。" },
          imageSrc: { kind: "literal", value: "https://picsum.photos/800/400" },
        },
        layout: {
          self: {
            rect: { x: 40, y: nextInsertRectY(next), width: 360, height: 240 },
            alignX: "start",
            alignY: "start",
          },
          children: { mode: "absolute" },
        },
      };
      const root = next.nodesById[next.rootId];
      if (root && root.type === "page_root") {
        root.children = [...root.children, id];
      }
      return next;
    });
    setDirty(true);
  };

  const resolveSelectableNodeIdFromRenderedId = (renderedId: string): string | null => {
    const id = (renderedId || "").trim();
    if (!id) return null;
    if (doc.nodesById[id]) return id;

    const toSafeSegment = (value: string) => value.replaceAll(/[^A-Za-z0-9:_-]/g, "_");
    for (const node of Object.values(doc.nodesById)) {
      if (!node || node.type !== "prefab_instance") continue;
      const safePrefabId = toSafeSegment(String(node.prefabId || ""));
      const safeInstanceId = toSafeSegment(String(node.id || ""));
      const prefix = `p_${safePrefabId}_${safeInstanceId}_`;
      if (id.startsWith(prefix) && doc.nodesById[node.id]) return node.id;
    }
    return null;
  };

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
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Space size={8}>
            <Link to="/w/$workspaceId/" params={{ workspaceId }}>
              <Button>{t("editor:EDITOR_PAGE_BACK_TO_PAGES")}</Button>
            </Link>
            <div className="flex flex-col">
              <Typography.Text strong>{t("editor:EDITOR_PAGE_EDITOR_TITLE")}</Typography.Text>
              <Typography.Text type="secondary" className="text-xs">
                {t("editor:EDITOR_PAGE_EDITOR_SUBTITLE", { pageId })}
              </Typography.Text>
            </div>
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
              onClick={() => setSettingsOpen(true)}
              disabled={loading || dirty || updatePageMutation.isPending}
              title={dirty ? t("editor:EDITOR_PAGE_SETTINGS_DISABLED_DIRTY") : undefined}
            >
              {t("editor:EDITOR_PAGE_SETTINGS")}
            </Button>
            <Button onClick={onInsertCard} disabled={loading || saveMutation.isPending}>
              {t("editor:EDITOR_PAGE_INSERT_CARD")}
            </Button>
            <Button
              type="primary"
              onClick={() => void saveMutation.mutateAsync()}
              disabled={loading || !dirty}
              loading={saveMutation.isPending}
            >
              {t("editor:EDITOR_PAGE_SAVE")}
            </Button>
            <Button
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
              onClick={() => {
                if (!previewHref) return;
                window.open(previewHref, "_blank", "noopener,noreferrer");
              }}
              disabled={loading || !previewHref}
            >
              {t("editor:EDITOR_PAGE_OPEN_PREVIEW")}
            </Button>
            <Button
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
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center bg-muted/30">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/70" />
            <Typography.Text type="secondary">{t("editor:EDITOR_PAGE_LOADING")}</Typography.Text>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0" style={mergeCssVars(runtimeQuery.data)}>
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
              setDoc(next);
              setDirty(true);
            }}
          />
          <div className="relative flex h-full w-full min-w-0 flex-1">
            <ViewportCanvas>
              <div
                className="relative w-full"
                onClickCapture={(e) => {
                  if (viewportMode !== "edit") return;
                  const target = e.target as HTMLElement | null;
                  if (!target) return;
                  const el = target.closest("[data-node-id]") as HTMLElement | null;
                  if (!el) {
                    setSelectedNodeId(null);
                    return;
                  }
                  const renderedId = el.getAttribute("data-node-id") || "";
                  const resolvedId = resolveSelectableNodeIdFromRenderedId(renderedId);
                  if (!resolvedId) return;
                  setSelectedNodeId(resolvedId);
                }}
              >
                {selectedNodeId ? (
                  <style>
                    {`[data-node-id="${cssEscape(selectedNodeId)}"]{outline:2px solid #1677ff; outline-offset:2px;}`}
                  </style>
                ) : null}
                <PageBlueprintRenderer
                  document={doc}
                  ctx={ctx}
                  viewport={{ width: viewportWidth, height: viewportHeight }}
                  prefabRegistry={prefabRegistry}
                  dataSources={renderDataSources}
                />
              </div>
            </ViewportCanvas>

            <div className="pointer-events-none absolute inset-y-0 left-0 flex gap-3 p-3">
              <div className="pointer-events-auto flex w-24 flex-col gap-2 rounded-md border border-border bg-card p-2 shadow-sm">
                <Button
                  size="small"
                  type={leftPanelKey === "blocks" ? "primary" : "default"}
                  onClick={() => setLeftPanelKey((prev) => (prev === "blocks" ? null : "blocks"))}
                  block
                  title={t("editor:EDITOR_LEFT_MENU_TOGGLE_PANEL")}
                >
                  {t("editor:EDITOR_LEFT_MENU_BLOCKS")}
                </Button>
                <Button
                  size="small"
                  type={leftPanelKey === "data" ? "primary" : "default"}
                  onClick={() => setLeftPanelKey((prev) => (prev === "data" ? null : "data"))}
                  block
                  title={t("editor:EDITOR_LEFT_MENU_TOGGLE_PANEL")}
                >
                  {t("editor:EDITOR_LEFT_MENU_DATA")}
                </Button>
                <Button
                  size="small"
                  type={leftPanelKey === "layers" ? "primary" : "default"}
                  onClick={() => setLeftPanelKey((prev) => (prev === "layers" ? null : "layers"))}
                  block
                  title={t("editor:EDITOR_LEFT_MENU_TOGGLE_PANEL")}
                >
                  {t("editor:EDITOR_LEFT_MENU_LAYERS")}
                </Button>
              </div>

              {leftPanelKey ? (
                <div className="pointer-events-auto h-full w-80 overflow-auto rounded-md border border-border bg-card p-3 shadow-sm">
                  {leftPanelKey === "blocks" ? (
                    <Space direction="vertical" size={12} className="w-full">
                      <Typography.Title level={5} style={{ margin: 0 }}>
                        {t("editor:EDITOR_LEFT_MENU_BLOCKS")}
                      </Typography.Title>
                      <Button onClick={onInsertCard} disabled={saveMutation.isPending} block>
                        {t("editor:EDITOR_PAGE_INSERT_CARD")}
                      </Button>
                      <Typography.Text type="secondary" className="text-xs">
                        {t("editor:EDITOR_PAGES_DESC")}
                      </Typography.Text>
                    </Space>
                  ) : null}

                  {leftPanelKey === "data" ? (
                    <PageDataPanel
                      workspaceId={workspaceId}
                      doc={doc}
                      onChangeDoc={(next) => {
                        setDoc(next);
                        setDirty(true);
                      }}
                    />
                  ) : null}

                  {leftPanelKey === "layers" ? (
                    <Typography.Text type="secondary">
                      {t("editor:EDITOR_NODE_INSPECTOR_UNSUPPORTED_DESC")}
                    </Typography.Text>
                  ) : null}
                </div>
              ) : null}
            </div>

            {selectedNodeId ? (
              <div className="pointer-events-none absolute inset-y-0 right-0 p-3">
                <div className="pointer-events-auto flex h-full w-[420px] flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                    <Typography.Text strong>
                      {t("editor:EDITOR_NODE_INSPECTOR_TITLE")}
                    </Typography.Text>
                    <Button size="small" onClick={() => setSelectedNodeId(null)}>
                      {t("editor:EDITOR_PANEL_CLOSE")}
                    </Button>
                  </div>
                  <div className="min-h-0 flex-1">
                    <NodeInspectorPanel
                      workspaceId={workspaceId}
                      doc={doc}
                      nodeId={selectedNodeId}
                      prefabRegistry={prefabRegistry}
                      supportedLocales={supportedLocales}
                      defaultLocale={defaultLocale}
                      onChangeDoc={(next) => {
                        setDoc(next);
                        setDirty(true);
                      }}
                      header={false}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function cssEscape(input: string): string {
  // Minimal escape for attribute selector string context in <style>.
  return String(input || "")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
}
