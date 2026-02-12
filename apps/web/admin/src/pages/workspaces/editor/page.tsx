import { Alert, Button, Card, Divider, Space, Tag } from "antd";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import type { DocumentIR } from "@celestial/site-block-protocol";
import type { EditorOverlayMode } from "@celestial/site-editor-protocol";
import {
  createEditorHostConnector,
  isHttpOrigin,
  normalizePathname,
} from "@celestial/site-editor-bridge";
import type {
  EditorHostConnector,
  EditorHostPenpalConnection,
} from "@celestial/site-editor-bridge";

import {
  getWorkspaceSitePage,
  publishWorkspaceSitePage,
  saveWorkspaceSitePageDraft,
} from "@/api/workspace-site";
import {
  getErrorMessage,
  notifyErrorText,
  notifyInfoText,
  notifySuccessText,
} from "@/lib/notifications";
import { WorkspaceEditorIframe } from "@/pages/workspaces/editor/workspace-editor-iframe";
import { formatWorkspaceEditorSaveError } from "@/pages/workspaces/editor/workspace-editor-errors";

export type WorkspaceEditorMode = "page" | "article";

type SaveStatus = "idle" | "saving" | "error";
type PublishStatus = "idle" | "publishing" | "error";
type BridgeStatus = "disconnected" | "connecting" | "connected";

export type WorkspaceEditorViewProps = {
  workspaceId: string;
  editorMode: WorkspaceEditorMode;
  entityId: string;
  initialPathname?: string;
};

export function WorkspaceEditorView(props: WorkspaceEditorViewProps) {
  const { workspaceId, editorMode, entityId, initialPathname } = props;
  const { t } = useTranslation(["content_pages", "content_library", "common"]);
  const navigate = useNavigate();

  const isPageMode = editorMode === "page";
  const portalOrigin = React.useMemo(() => {
    const raw = import.meta.env.VITE_PORTAL_ORIGIN;
    return raw && isHttpOrigin(raw) ? raw : "http://localhost:3100";
  }, []);

  const [pathname, setPathname] = React.useState(() => normalizePathname(initialPathname || "/"));
  const [iframeElement, setIframeElement] = React.useState<HTMLIFrameElement | null>(null);

  const [overlayMode, setOverlayMode] = React.useState<EditorOverlayMode>("inspect");
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = React.useState<BridgeStatus>("disconnected");
  const [bridgeError, setBridgeError] = React.useState<string | null>(null);
  const [lastPingRttMs, setLastPingRttMs] = React.useState<number | null>(null);
  const [lastPingError, setLastPingError] = React.useState<string | null>(null);

  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [lastSavedRevision, setLastSavedRevision] = React.useState<number | null>(null);

  const [publishStatus, setPublishStatus] = React.useState<PublishStatus>("idle");
  const [publishError, setPublishError] = React.useState<string | null>(null);
  const [lastPublishedRevision, setLastPublishedRevision] = React.useState<number | null>(null);

  const [hasDraftOverride, setHasDraftOverride] = React.useState(false);
  const [lastPresenceAtMs, setLastPresenceAtMs] = React.useState<number | null>(null);

  const portalRef = React.useRef<EditorHostPenpalConnection["portal"] | null>(null);
  const connectorRef = React.useRef<EditorHostConnector | null>(null);
  const overlayModeRef = React.useRef<EditorOverlayMode>("inspect");
  const pingSeqRef = React.useRef(0);
  const draftRevisionRef = React.useRef<number | null>(null);
  const lastSaveRequestRef = React.useRef<{
    pathname: string;
    document: DocumentIR;
  } | null>(null);

  React.useEffect(() => {
    if (!initialPathname) return;
    setPathname(normalizePathname(initialPathname));
  }, [initialPathname]);

  const pageDetailQuery = useQuery({
    queryKey: ["workspace", workspaceId, "site", "pages", entityId],
    enabled: isPageMode && Boolean(workspaceId) && Boolean(entityId),
    queryFn: async () => getWorkspaceSitePage(workspaceId, entityId),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  React.useEffect(() => {
    if (!isPageMode) {
      draftRevisionRef.current = null;
      setLastSavedRevision(null);
      setLastPublishedRevision(null);
      return;
    }

    const draftRevision = pageDetailQuery.data?.draftRevision;
    if (typeof draftRevision === "number" && Number.isFinite(draftRevision)) {
      const normalized = Math.max(0, draftRevision);
      draftRevisionRef.current = normalized;
      setLastSavedRevision(normalized);
    }

    const publishedRevision = pageDetailQuery.data?.publishedRevision;
    if (typeof publishedRevision === "number" && Number.isFinite(publishedRevision)) {
      setLastPublishedRevision(Math.max(0, publishedRevision));
    }
  }, [isPageMode, pageDetailQuery.data?.draftRevision, pageDetailQuery.data?.publishedRevision]);

  React.useEffect(() => {
    overlayModeRef.current = overlayMode;
  }, [overlayMode]);

  React.useEffect(() => {
    return () => {
      portalRef.current = null;
      connectorRef.current?.disconnect();
      connectorRef.current = null;
    };
  }, []);

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
    if (mode === "off") {
      setSelectedBlockId(null);
    }
  }, []);

  const persistPageDraft = React.useCallback(
    async (payload: { pathname: string; document: DocumentIR }) => {
      if (!isPageMode) {
        notifyInfoText(t("content_pages:EDITOR_SHELL_SAVE_DISABLED_NON_PAGE"));
        return;
      }

      const normalizedPath = normalizePathname(payload.pathname);
      setPathname((prev) => (prev === normalizedPath ? prev : normalizedPath));

      setSaveStatus("saving");
      setSaveError(null);

      try {
        const out = await saveWorkspaceSitePageDraft(workspaceId, entityId, {
          document: payload.document,
          expectedRevision: draftRevisionRef.current,
        });

        draftRevisionRef.current = out.revision;
        setLastSavedRevision(out.revision);
        setSaveStatus("idle");
      } catch (err) {
        const text = formatWorkspaceEditorSaveError(err, t);
        setSaveStatus("error");
        setSaveError(text);
        notifyErrorText(text);
      }
    },
    [entityId, isPageMode, t, workspaceId],
  );

  const onSaveFromHeader = React.useCallback(() => {
    if (!isPageMode) {
      notifyInfoText(t("content_pages:EDITOR_SHELL_SAVE_DISABLED_NON_PAGE"));
      return;
    }

    const lastRequest = lastSaveRequestRef.current;
    if (!lastRequest) {
      notifyInfoText(t("content_pages:EDITOR_SHELL_SAVE_NEEDS_SHORTCUT"));
      return;
    }

    void persistPageDraft(lastRequest);
  }, [isPageMode, persistPageDraft, t]);

  const onPublish = React.useCallback(() => {
    if (!isPageMode) {
      notifyInfoText(t("content_pages:EDITOR_SHELL_PUBLISH_DISABLED_NON_PAGE"));
      return;
    }

    void (async () => {
      setPublishStatus("publishing");
      setPublishError(null);

      try {
        const revision = draftRevisionRef.current;
        const out = await publishWorkspaceSitePage(
          workspaceId,
          entityId,
          revision === null ? {} : { revision },
        );

        setPublishStatus("idle");
        setLastPublishedRevision(out.revision);
        notifySuccessText(
          t("content_pages:EDITOR_SHELL_PUBLISH_SUCCESS", {
            revision: out.revision,
          }),
        );
      } catch (err) {
        const text = getErrorMessage(err);
        setPublishStatus("error");
        setPublishError(text);
        notifyErrorText(text);
      }
    })();
  }, [entityId, isPageMode, t, workspaceId]);

  React.useEffect(() => {
    if (!iframeElement) return;

    const connector = createEditorHostConnector({
      iframe: iframeElement,
      childOrigin: portalOrigin,
      methods: {
        ready: () => {
          setBridgeError(null);
        },
        selectionChanged: ({ blockId }) => {
          setSelectedBlockId(blockId);
        },
        requestSave: ({ pathname: requestPathname, document }) => {
          const normalizedPath = normalizePathname(requestPathname);
          setPathname((prev) => (prev === normalizedPath ? prev : normalizedPath));
          lastSaveRequestRef.current = {
            pathname: normalizedPath,
            document,
          };
          void persistPageDraft({
            pathname: normalizedPath,
            document,
          });
        },
        reportPresence: ({ presence }) => {
          const normalizedPath = normalizePathname(presence.pathname);
          setPathname((prev) => (prev === normalizedPath ? prev : normalizedPath));
          setHasDraftOverride(presence.hasDraftOverride);
          setLastPresenceAtMs(presence.updatedAtMs);
        },
      },
      onConnected: async (portal) => {
        portalRef.current = portal;
        setBridgeStatus("connected");
        setBridgeError(null);
        void sendPing({ silent: true });
        await portal.setOverlayMode({ mode: overlayModeRef.current });
      },
      onError: (err) => {
        setBridgeStatus("disconnected");
        setBridgeError(err instanceof Error ? err.message : String(err));
      },
    });

    connectorRef.current = connector;

    const connect = () => {
      setBridgeStatus("connecting");
      setBridgeError(null);
      void connector.connect();
    };

    const onLoad = () => {
      portalRef.current = null;
      connect();
    };

    iframeElement.addEventListener("load", onLoad);
    const timer = window.setTimeout(connect, 0);

    return () => {
      iframeElement.removeEventListener("load", onLoad);
      window.clearTimeout(timer);
      portalRef.current = null;
      connector.disconnect();
      if (connectorRef.current === connector) {
        connectorRef.current = null;
      }
      setBridgeStatus("disconnected");
    };
  }, [iframeElement, persistPageDraft, portalOrigin, sendPing]);

  const isBusy = saveStatus === "saving" || publishStatus === "publishing";
  const saveDisabled = !isPageMode || isBusy;
  const publishDisabled = !isPageMode || isBusy;

  const bridgeColor =
    bridgeStatus === "connected" ? "green" : bridgeStatus === "connecting" ? "blue" : "default";

  const bridgeText =
    bridgeStatus === "connected"
      ? t("content_pages:EDITOR_SHELL_BRIDGE_CONNECTED")
      : bridgeStatus === "connecting"
        ? t("content_pages:EDITOR_SHELL_BRIDGE_CONNECTING")
        : t("content_pages:EDITOR_SHELL_BRIDGE_DISCONNECTED");

  const saveText =
    saveStatus === "saving"
      ? t("content_pages:EDITOR_SHELL_SAVE_STATUS_SAVING")
      : saveStatus === "error"
        ? t("content_pages:EDITOR_SHELL_SAVE_STATUS_ERROR")
        : t("content_pages:EDITOR_SHELL_SAVE_STATUS_IDLE");

  const publishText =
    publishStatus === "publishing"
      ? t("content_pages:EDITOR_SHELL_PUBLISH_STATUS_PUBLISHING")
      : publishStatus === "error"
        ? t("content_pages:EDITOR_SHELL_PUBLISH_STATUS_ERROR")
        : t("content_pages:EDITOR_SHELL_PUBLISH_STATUS_IDLE");

  const presenceTime =
    lastPresenceAtMs === null
      ? t("content_pages:PLACEHOLDER_DASH")
      : new Date(lastPresenceAtMs).toLocaleTimeString();

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <header className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color="blue">
                {isPageMode
                  ? t("content_pages:EDITOR_SHELL_MODE_PAGE")
                  : t("content_pages:EDITOR_SHELL_MODE_ARTICLE")}
              </Tag>
              <Tag color={bridgeColor}>{bridgeText}</Tag>
              <Tag>{`${t("content_pages:EDITOR_SHELL_OVERLAY_LABEL")} ${overlayMode}`}</Tag>
              <span className="truncate text-sm text-muted-foreground">{entityId}</span>
            </div>
            <h1 className="text-2xl font-semibold">{t("content_pages:EDITOR_SHELL_TITLE")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("content_pages:EDITOR_SHELL_SUBTITLE")}
            </p>
          </div>

          <Space wrap>
            <Button
              onClick={() => {
                if (isPageMode) {
                  void navigate({
                    to: "/w/$workspaceId/content/pages",
                    params: { workspaceId },
                  });
                  return;
                }

                void navigate({
                  to: "/w/$workspaceId/content/library",
                  params: { workspaceId },
                });
              }}
            >
              {isPageMode
                ? t("content_pages:EDITOR_SHELL_BACK_TO_PAGES")
                : t("content_pages:EDITOR_SHELL_BACK_TO_LIBRARY")}
            </Button>
            <Button onClick={() => void sendPing()}>{t("content_pages:EDITOR_SHELL_ACTION_PING")}</Button>
            <Button loading={saveStatus === "saving"} disabled={saveDisabled} onClick={onSaveFromHeader}>
              {t("content_pages:EDITOR_SHELL_ACTION_SAVE")}
            </Button>
            <Button
              type="primary"
              loading={publishStatus === "publishing"}
              disabled={publishDisabled}
              onClick={onPublish}
            >
              {t("content_pages:EDITOR_SHELL_ACTION_PUBLISH")}
            </Button>
          </Space>
        </div>
      </header>

      {pageDetailQuery.error ? (
        <Alert
          type="error"
          showIcon
          message={t("content_pages:EDITOR_SHELL_PAGE_LOAD_ERROR")}
          description={getErrorMessage(pageDetailQuery.error)}
        />
      ) : null}

      {bridgeError ? (
        <Alert
          type="warning"
          showIcon
          message={t("content_pages:EDITOR_SHELL_BRIDGE_ERROR")}
          description={bridgeError}
        />
      ) : null}

      {saveError ? (
        <Alert type="error" showIcon message={t("content_pages:EDITOR_SHELL_SAVE_ERROR")} description={saveError} />
      ) : null}

      {publishError ? (
        <Alert
          type="error"
          showIcon
          message={t("content_pages:EDITOR_SHELL_PUBLISH_ERROR")}
          description={publishError}
        />
      ) : null}

      <div className="grid flex-1 min-h-0 grid-cols-12 gap-3">
        <aside className="col-span-12 lg:col-span-3">
          <Card title={t("content_pages:EDITOR_SHELL_LEFT_TITLE")} className="h-full">
            <div className="flex flex-col gap-3 text-sm">
              <div>{t("content_pages:EDITOR_SHELL_PANEL_SITE_CHROME")}</div>
              <div>{t("content_pages:EDITOR_SHELL_PANEL_BLOCKS")}</div>
              <div>{t("content_pages:EDITOR_SHELL_PANEL_METADATA")}</div>

              <Divider className="my-1" />

              <div className="flex flex-wrap gap-2">
                <Button size="small" onClick={() => setChildOverlayMode("off")}>
                  {t("content_pages:EDITOR_SHELL_OVERLAY_OFF")}
                </Button>
                <Button size="small" onClick={() => setChildOverlayMode("inspect")}>
                  {t("content_pages:EDITOR_SHELL_OVERLAY_INSPECT")}
                </Button>
                <Button size="small" onClick={() => setChildOverlayMode("edit")}>
                  {t("content_pages:EDITOR_SHELL_OVERLAY_EDIT")}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                {t("content_pages:EDITOR_SHELL_SAVE_SHORTCUT_HINT")}
              </p>
            </div>
          </Card>
        </aside>

        <main className="col-span-12 lg:col-span-6">
          <Card title={t("content_pages:EDITOR_SHELL_CENTER_TITLE")} className="h-full">
            <WorkspaceEditorIframe
              workspaceId={workspaceId}
              pathname={pathname}
              onPathnameChange={setPathname}
              portalOrigin={portalOrigin}
              onIframeRefChange={setIframeElement}
            />
          </Card>
        </main>

        <aside className="col-span-12 lg:col-span-3">
          <Card title={t("content_pages:EDITOR_SHELL_RIGHT_TITLE")} className="h-full">
            <div className="flex flex-col gap-3 text-sm">
              <div>{`${t("content_pages:EDITOR_SHELL_PING_LABEL")} ${lastPingRttMs ?? t("content_pages:PLACEHOLDER_DASH")}`}</div>
              <div>{`${t("content_pages:EDITOR_SHELL_SELECTED_LABEL")} ${selectedBlockId ?? t("content_pages:PLACEHOLDER_NULL")}`}</div>
              <div>{`${t("content_pages:EDITOR_SHELL_SAVE_LABEL")} ${saveText}`}</div>
              <div>{`${t("content_pages:EDITOR_SHELL_PUBLISH_LABEL")} ${publishText}`}</div>
              <div>{`${t("content_pages:EDITOR_SHELL_DRAFT_REV_LABEL")} ${lastSavedRevision ?? t("content_pages:PLACEHOLDER_DASH")}`}</div>
              <div>{`${t("content_pages:EDITOR_SHELL_PUBLISHED_REV_LABEL")} ${lastPublishedRevision ?? t("content_pages:PLACEHOLDER_DASH")}`}</div>
              <div>{`${t("content_pages:EDITOR_SHELL_PRESENCE_LABEL")} ${presenceTime}`}</div>
              <div>{`${t("content_pages:EDITOR_SHELL_DRAFT_OVERRIDE_LABEL")} ${hasDraftOverride ? t("content_pages:EDITOR_SHELL_VALUE_YES") : t("content_pages:EDITOR_SHELL_VALUE_NO")}`}</div>
              {lastPingError ? (
                <div className="text-destructive">{`${t("content_pages:EDITOR_SHELL_PING_ERROR")}${lastPingError}`}</div>
              ) : null}
            </div>
          </Card>
        </aside>
      </div>

      <footer className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
        {t("content_pages:EDITOR_SHELL_FOOTER_HINT")}
      </footer>
    </div>
  );
}
