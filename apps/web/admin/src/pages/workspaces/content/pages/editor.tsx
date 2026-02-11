import * as React from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";

import type { DocumentIR } from "@celestial/site-block-protocol";
import type { EditorOverlayMode } from "@celestial/site-editor-protocol";
import {
  buildEditorIframeHref,
  createEditorHostConnector,
  isHttpOrigin,
  normalizePathname,
} from "@celestial/site-editor-bridge";
import type {
  EditorHostConnector,
  EditorHostPenpalConnection,
} from "@celestial/site-editor-bridge";

import {
  getWorkspaceSite,
  getWorkspaceSitePage,
  issueWorkspaceSitePreviewToken,
  publishWorkspaceSitePage,
  saveWorkspaceSitePageDraft,
  unpublishWorkspaceSitePage,
  type SitePageTreeNode,
} from "@/api/workspace-site";
import { DefaultPage } from "@/components/common/default-page";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccessText } from "@/lib/notifications";

export interface ContentPageEditorViewProps {
  workspaceId: string;
  pageId: string;
  layout?: "page" | "overlay";
}

export function ContentPageEditorView(props: ContentPageEditorViewProps) {
  const { t } = useTranslation(["content_pages", "common"]);
  const layout = props.layout ?? "page";

  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const portalRef = React.useRef<EditorHostPenpalConnection["portal"] | null>(null);
  const connectorRef = React.useRef<EditorHostConnector | null>(null);

  const [overlayMode, setOverlayMode] = React.useState<EditorOverlayMode>("inspect");
  const overlayModeRef = React.useRef<EditorOverlayMode>("inspect");
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);

  const [lastPingRttMs, setLastPingRttMs] = React.useState<number | null>(null);
  const [lastPingError, setLastPingError] = React.useState<string | null>(null);
  const pingSeqRef = React.useRef(0);

  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [lastSaveRevision, setLastSaveRevision] = React.useState<number | null>(null);
  const expectedRevisionRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    overlayModeRef.current = overlayMode;
  }, [overlayMode]);

  const portalOrigin = React.useMemo(() => {
    const raw = import.meta.env.VITE_PORTAL_ORIGIN;
    return raw && isHttpOrigin(raw) ? raw : "http://localhost:3100";
  }, []);

  const hostOrigin = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const siteQuery = useQuery({
    queryKey: ["workspace", props.workspaceId, "site"],
    queryFn: async () => getWorkspaceSite(props.workspaceId),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const pageQuery = useQuery({
    queryKey: ["workspace", props.workspaceId, "site", "pages", props.pageId],
    queryFn: async () => getWorkspaceSitePage(props.workspaceId, props.pageId),
    staleTime: 10 * 1000,
    retry: false,
    meta: { silent: true },
  });

  React.useEffect(() => {
    const draftRev = pageQuery.data?.draftRevision;
    if (typeof draftRev === "number" && Number.isFinite(draftRev) && draftRev >= 0) {
      expectedRevisionRef.current = draftRev;
      setLastSaveRevision(draftRev > 0 ? draftRev : null);
    }
  }, [pageQuery.data?.draftRevision]);

  const tokenQuery = useQuery({
    queryKey: ["workspace", props.workspaceId, "site", "previewToken"],
    enabled: Boolean(props.workspaceId),
    queryFn: async () => issueWorkspaceSitePreviewToken(props.workspaceId, { ttlSeconds: 600 }),
    staleTime: 8 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const iframeSrc = React.useMemo(() => {
    const siteId = siteQuery.data?.siteId;
    const token = tokenQuery.data?.token;
    const pathname = pageQuery.data?.path;
    if (!siteId || !token || !pathname) return null;
    if (!hostOrigin) return null;

    return buildEditorIframeHref({
      portalOrigin,
      siteId,
      pathname,
      token,
      parentOrigin: hostOrigin,
    });
  }, [
    hostOrigin,
    pageQuery.data?.path,
    portalOrigin,
    siteQuery.data?.siteId,
    tokenQuery.data?.token,
  ]);

  const saveMutation = useMutation({
    mutationFn: async (document: DocumentIR) => {
      const expected = expectedRevisionRef.current;
      const payload = {
        document,
        ...(expected !== null ? { expectedRevision: expected } : {}),
      };
      return saveWorkspaceSitePageDraft(props.workspaceId, props.pageId, payload);
    },
    onSuccess: (out) => {
      expectedRevisionRef.current = out.revision;
      setLastSaveRevision(out.revision);
      setSaveStatus("idle");
      setSaveError(null);
      notifySuccessText(t("content_pages:EDITOR_SAVE_SUCCESS"));
    },
    onError: (err) => {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : String(err));
      notifyError(err);
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const revision = lastSaveRevision;
      return publishWorkspaceSitePage(
        props.workspaceId,
        props.pageId,
        revision ? { revision } : {},
      );
    },
    onSuccess: () => notifySuccessText(t("content_pages:EDITOR_PUBLISH_SUCCESS")),
    onError: (err) => notifyError(err),
  });

  const unpublishMutation = useMutation({
    mutationFn: async () => unpublishWorkspaceSitePage(props.workspaceId, props.pageId),
    onSuccess: () => notifySuccessText(t("content_pages:EDITOR_UNPUBLISH_SUCCESS")),
    onError: (err) => notifyError(err),
  });

  const sendPing = React.useCallback(async (opts?: { silent?: boolean }) => {
    const portal = portalRef.current;
    if (!portal) return;
    const seq = ++pingSeqRef.current;
    try {
      if (!opts?.silent) setLastPingError(null);
      const sentAt = Date.now();
      await portal.ping({ sentAt });
      if (seq !== pingSeqRef.current) return;
      setLastPingRttMs(Date.now() - sentAt);
    } catch (err) {
      if (seq !== pingSeqRef.current) return;
      if (opts?.silent) return;
      setLastPingRttMs(null);
      setLastPingError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const setChildOverlayMode = React.useCallback((mode: EditorOverlayMode) => {
    setOverlayMode(mode);
    void portalRef.current?.setOverlayMode({ mode });
    if (mode === "off") setSelectedBlockId(null);
  }, []);

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (!iframeSrc) return;

    const connector = createEditorHostConnector({
      iframe,
      childOrigin: portalOrigin,
      methods: {
        ready: () => {
          // no-op: keep logs quiet in production.
        },
        selectionChanged: ({ blockId }) => {
          setSelectedBlockId(blockId);
        },
        requestSave: ({ document, pathname }) => {
          // Guard: prevent accidental cross-page saves if the iframe navigates unexpectedly.
          const currentPath = normalizePathname(pageQuery.data?.path ?? "/");
          if (normalizePathname(pathname) !== currentPath) return;

          setSaveStatus("saving");
          setSaveError(null);
          saveMutation.mutate(document);
        },
        reportPresence: () => {
          // Presence UI is a follow-up; keep protocol compatible.
        },
      },
      onConnected: async (portal) => {
        portalRef.current = portal;
        void sendPing({ silent: true });
        await portal.setOverlayMode({ mode: overlayModeRef.current });
      },
    });

    connectorRef.current = connector;

    const onLoad = () => {
      portalRef.current = null;
      void connector.connect({ silent: true });
    };
    iframe.addEventListener("load", onLoad);

    // Initial connect.
    const timer = window.setTimeout(() => {
      portalRef.current = null;
      void connector.connect({ silent: true });
    }, 0);

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.clearTimeout(timer);
      portalRef.current = null;
      connectorRef.current?.disconnect();
      connectorRef.current = null;
    };
  }, [iframeSrc, pageQuery.data?.path, portalOrigin, saveMutation, sendPing]);

  const page: SitePageTreeNode | null = pageQuery.data ?? null;
  const token = tokenQuery.data?.token ?? null;

  const body = (
    <div
      className={
        layout === "overlay" ? "flex h-full w-full flex-col bg-background p-4 pt-16" : undefined
      }
    >
      <div className="flex items-center gap-2">
        <div className="text-sm text-muted-foreground">
          {t("content_pages:EDITOR_PATH_LABEL")}:{" "}
          <code>{page?.path ?? t("content_pages:PLACEHOLDER_DASH")}</code>
        </div>
        <div className="text-sm text-muted-foreground">
          {t("content_pages:EDITOR_TOKEN_LABEL")}:{" "}
          <code>{token ? `${token.slice(0, 6)}...` : t("content_pages:PLACEHOLDER_DASH")}</code>
        </div>
        <div className="text-sm text-muted-foreground">
          {t("content_pages:EDITOR_SELECTED_LABEL")}:{" "}
          <code>{selectedBlockId ?? t("content_pages:PLACEHOLDER_NULL")}</code>
        </div>
        <div className="text-sm text-muted-foreground">
          {t("content_pages:EDITOR_PING_LABEL")}:{" "}
          <code>
            {lastPingRttMs !== null
              ? `${lastPingRttMs}ms`
              : lastPingError
                ? t("content_pages:PLACEHOLDER_ERROR")
                : t("content_pages:PLACEHOLDER_DASH")}
          </code>
        </div>
        <div className="text-sm text-muted-foreground">
          {t("content_pages:EDITOR_SAVE_LABEL")}:{" "}
          <code>
            {saveStatus === "saving"
              ? t("content_pages:EDITOR_SAVE_SAVING")
              : saveStatus === "error"
                ? t("content_pages:EDITOR_SAVE_ERROR")
                : lastSaveRevision
                  ? `${t("content_pages:EDITOR_REV_PREFIX")} ${lastSaveRevision}`
                  : t("content_pages:PLACEHOLDER_DASH")}
          </code>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setChildOverlayMode("off")}
          >
            {t("content_pages:EDITOR_OVERLAY_OFF")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setChildOverlayMode("inspect")}
          >
            {t("content_pages:EDITOR_OVERLAY_INSPECT")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setChildOverlayMode("edit")}
          >
            {t("content_pages:EDITOR_OVERLAY_EDIT")}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => void sendPing()}>
            {t("content_pages:EDITOR_PING_ACTION")}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={publishMutation.isPending}
            onClick={() => publishMutation.mutate()}
          >
            {t("content_pages:EDITOR_PUBLISH_ACTION")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={unpublishMutation.isPending}
            onClick={() => unpublishMutation.mutate()}
          >
            {t("content_pages:EDITOR_UNPUBLISH_ACTION")}
          </Button>
        </div>
      </div>

      {saveError ? (
        <div className="mt-2 text-sm text-destructive">
          {t("content_pages:EDITOR_SAVE_ERROR_DETAIL", { error: saveError })}
        </div>
      ) : null}

      {iframeSrc ? (
        <div
          className={
            layout === "overlay"
              ? "mt-4 min-h-[60vh] w-full flex-1 overflow-hidden rounded-md border"
              : "mt-4 h-[70vh] w-full overflow-hidden rounded-md border"
          }
        >
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            title={t("content_pages:EDITOR_IFRAME_TITLE")}
            className="h-full w-full"
          />
        </div>
      ) : (
        <div className="mt-4 text-sm text-muted-foreground">{t("common:LOADING")}</div>
      )}
    </div>
  );

  if (layout === "overlay") {
    return body;
  }

  return (
    <DefaultPage
      title={t("content_pages:EDITOR_TITLE")}
      description={page?.path ? t("content_pages:EDITOR_DESC", { path: page.path }) : undefined}
      width="full"
    >
      {body}
    </DefaultPage>
  );
}
