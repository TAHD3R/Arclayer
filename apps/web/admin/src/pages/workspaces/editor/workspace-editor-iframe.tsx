import { Alert, Button, Input, Space, Spin, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { buildEditorIframeHref, normalizePathname } from "@celestial/site-editor-bridge";

import { getWorkspaceSite, issueWorkspaceSitePreviewToken } from "@/api/workspace-site";

type WorkspaceEditorIframeProps = {
  workspaceId: string;
  pathname: string;
  onPathnameChange: (pathname: string) => void;
  portalOrigin: string;
  onIframeRefChange: (iframe: HTMLIFrameElement | null) => void;
  hideToolbar?: boolean;
  canvasWidthPx?: number;
  zoomPercent?: number;
  showBounds?: boolean;
  showGuides?: boolean;
};

export function WorkspaceEditorIframe(props: WorkspaceEditorIframeProps) {
  const {
    workspaceId,
    pathname,
    onPathnameChange,
    portalOrigin,
    onIframeRefChange,
    hideToolbar = false,
    canvasWidthPx = 1280,
    zoomPercent = 100,
    showBounds = true,
    showGuides = false,
  } = props;
  const { t } = useTranslation(["content_pages", "common"]);

  const [pathInput, setPathInput] = React.useState(pathname);

  React.useEffect(() => {
    setPathInput(pathname);
  }, [pathname]);

  const hostOrigin = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const siteQuery = useQuery({
    queryKey: ["workspace", workspaceId, "site"],
    queryFn: () => getWorkspaceSite(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const tokenQuery = useQuery({
    queryKey: ["workspace", workspaceId, "site", "previewToken"],
    queryFn: () => issueWorkspaceSitePreviewToken(workspaceId, { ttlSeconds: 600 }),
    enabled: Boolean(workspaceId) && Boolean(siteQuery.data?.siteId),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const normalizedPath = React.useMemo(() => normalizePathname(pathname || "/"), [pathname]);

  const iframeSrc = React.useMemo(() => {
    const siteId = siteQuery.data?.siteId;
    const token = tokenQuery.data?.token;
    if (!hostOrigin || !siteId || !token) return "";

    return buildEditorIframeHref({
      portalOrigin,
      siteId,
      pathname: normalizedPath,
      token,
      parentOrigin: hostOrigin,
    });
  }, [hostOrigin, normalizedPath, portalOrigin, siteQuery.data?.siteId, tokenQuery.data?.token]);

  const hasError = Boolean(siteQuery.error) || Boolean(tokenQuery.error);

  const onSubmitPath = () => {
    onPathnameChange(normalizePathname(pathInput || "/"));
  };

  const scale = Math.min(2, Math.max(0.25, zoomPercent / 100));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {!hideToolbar ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
          <Input
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
            onPressEnter={onSubmitPath}
            placeholder={t("content_pages:EDITOR_SHELL_PATH_PLACEHOLDER")}
            className="w-full md:w-80"
          />
          <Button onClick={onSubmitPath}>{t("content_pages:EDITOR_SHELL_PATH_APPLY")}</Button>
          <Button onClick={() => tokenQuery.refetch()}>{t("content_pages:EDITOR_SHELL_TOKEN_REFRESH")}</Button>

          {siteQuery.data?.slug ? <Tag>{siteQuery.data.slug}</Tag> : null}
          {tokenQuery.data?.token ? <Tag color="green">{t("content_pages:EDITOR_SHELL_TOKEN_READY")}</Tag> : null}
        </div>
      ) : null}

      {hasError ? (
        <Alert
          type="error"
          showIcon
          message={t("content_pages:EDITOR_SHELL_IFRAME_ERROR")}
          description={
            (siteQuery.error instanceof Error && siteQuery.error.message) ||
            (tokenQuery.error instanceof Error && tokenQuery.error.message) ||
            t("common:REQUEST_FAILED")
          }
        />
      ) : null}

      <div className="relative flex-1 min-h-[340px] overflow-auto rounded-md border bg-[#f5f6f8]">
        {siteQuery.isLoading || tokenQuery.isLoading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
            <Space align="center">
              <Spin size="small" />
              <span className="text-sm text-muted-foreground">
                {t("content_pages:EDITOR_SHELL_LOADING_PREVIEW")}
              </span>
            </Space>
          </div>
        ) : null}

        {iframeSrc ? (
          <div className="relative flex min-h-full items-start justify-center p-10">
            <div
              className="relative"
              style={{
                width: `${canvasWidthPx}px`,
                transform: `scale(${scale})`,
                transformOrigin: "top center",
              }}
            >
              {showGuides ? (
                <>
                  <div className="pointer-events-none absolute left-1/2 top-0 z-20 h-full w-px bg-blue-200/80" />
                  <div className="pointer-events-none absolute left-0 top-1/2 z-20 h-px w-full bg-blue-200/80" />
                </>
              ) : null}
              <div
                className="relative h-[960px] overflow-hidden rounded-xl bg-background shadow-[0_20px_60px_rgba(15,23,42,0.22)]"
                style={{
                  borderWidth: showBounds ? 1 : 0,
                  borderStyle: "solid",
                  borderColor: "rgba(148,163,184,0.5)",
                }}
              >
                <iframe
                  ref={onIframeRefChange}
                  title="workspace-editor-iframe"
                  src={iframeSrc}
                  className="h-full w-full border-0"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("content_pages:EDITOR_SHELL_IFRAME_EMPTY")}
          </div>
        )}
      </div>
    </div>
  );
}
