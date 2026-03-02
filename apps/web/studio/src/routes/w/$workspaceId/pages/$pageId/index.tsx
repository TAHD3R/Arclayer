import type { CSSProperties } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Card, Space, Tag, Typography } from "antd";
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
import { PageSettingsDrawer } from "@/components/pages/page-settings-drawer";
import { ViewportCanvas } from "@/components/viewport/viewport-canvas";
import { usePreferencesStore } from "@/stores/use-preferences-store";
import { useViewportStore } from "@/stores/use-viewport-store";
import type { SiteRuntimeOut, WorkspacePageUpdateIn, WorkspaceSiteOut } from "@/types/api";

export const Route = createFileRoute("/w/$workspaceId/pages/$pageId/")({
  component: WorkspacePageEditorRoute,
});

function clonePageBlueprint(value: PageBlueprint): PageBlueprint {
  const sc = (globalThis as unknown as { structuredClone?: (v: unknown) => unknown })
    .structuredClone;
  if (typeof sc === "function") return sc(value) as PageBlueprint;
  return JSON.parse(JSON.stringify(value)) as PageBlueprint;
}

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

function WorkspacePageEditorRoute() {
  const { t } = useTranslation(["editor"]);
  const { workspaceId, pageId } = Route.useParams();
  const qc = useQueryClient();
  const { message } = App.useApp();

  const themeMode = usePreferencesStore((s) => s.themeMode);
  const viewportWidth = useViewportStore((s) => s.width);
  const viewportHeight = useViewportStore((s) => s.height);

  const prefabRegistry = useMemo(() => createDefaultPrefabRegistryV1(), []);

  const [doc, setDoc] = useState<PageBlueprint>(() => createEmptyPageBlueprint());
  const [dirty, setDirty] = useState(false);
  const loadedSignatureRef = useRef<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const ctx: ViewerContext = useMemo(
    () => ({
      locale: (site?.defaultLocale as string | undefined) || "en-US",
      fallbackLocale: (site?.fallbackLocale as string | undefined) || "en-US",
      breakpoint: resolveBreakpointNameByWidth(viewportWidth),
      mode: themeMode,
    }),
    [site?.defaultLocale, site?.fallbackLocale, themeMode, viewportWidth],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const expectedRevision =
        draftQuery.data?.state === "draft"
          ? draftQuery.data.revision
          : // If we are currently displaying published/empty, the draft pointer is expected to be 0.
            0;
      return await saveWorkspacePageDraftRevision(workspaceId, pageId, {
        pageBlueprint: doc,
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

  const portalOrigin = useMemo(
    () => resolvePortalOrigin({ workspaceSlug: siteQuery.data?.slug }),
    [siteQuery.data?.slug],
  );
  const pagePath = pageQuery.data?.path || "";
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
    <div className="h-full">
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
        <div className="flex h-[calc(100%-57px)] items-center justify-center bg-muted/30">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/70" />
            <Typography.Text type="secondary">{t("editor:EDITOR_PAGE_LOADING")}</Typography.Text>
          </div>
        </div>
      ) : (
        <div style={mergeCssVars(runtimeQuery.data)}>
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
          <ViewportCanvas>
            <div className="relative w-full">
              <PageBlueprintRenderer
                document={doc}
                ctx={ctx}
                viewport={{ width: viewportWidth, height: viewportHeight }}
                prefabRegistry={prefabRegistry}
              />
            </div>
          </ViewportCanvas>
        </div>
      )}
    </div>
  );
}
