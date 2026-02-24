import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import {
  buildEditorIframeHref,
  normalizePathname,
  isHttpOrigin,
} from "@celestial/site-editor-bridge";

import { getWorkspaceSite, issueWorkspaceSitePreviewToken } from "@/api/workspace-site";

export type UseEditorIframeOptions = {
  workspaceId: string;
  pathname: string;
};

export type UseEditorIframeReturn = {
  iframeSrc: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  isLoading: boolean;
  error: string | null;
  portalOrigin: string;
};

export function useEditorIframe(opts: UseEditorIframeOptions): UseEditorIframeReturn {
  const { workspaceId, pathname } = opts;
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);

  const portalOrigin = React.useMemo(() => {
    const raw = import.meta.env.VITE_PORTAL_ORIGIN;
    return raw && isHttpOrigin(raw) ? raw : "http://localhost:3100";
  }, []);

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

  const isLoading = siteQuery.isLoading || tokenQuery.isLoading;

  const error = React.useMemo(() => {
    if (siteQuery.error instanceof Error) return siteQuery.error.message;
    if (tokenQuery.error instanceof Error) return tokenQuery.error.message;
    return null;
  }, [siteQuery.error, tokenQuery.error]);

  return { iframeSrc, iframeRef, isLoading, error, portalOrigin };
}
