"use client";

import { useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";

import { getAppConfig } from "@/constants/app-config";
import { useAuthStore } from "@/stores/use-auth-store";
import { cn } from "@/lib/utils";

export interface PluginIconProps {
  name: string;
  iconUrl?: string | null;
  size?: number;
  className?: string;
  imgClassName?: string;
  fallbackIconClassName?: string;
}

function isAbsoluteUrl(value: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function joinPath(a: string, b: string): string {
  const left = a.endsWith("/") ? a.slice(0, -1) : a;
  const right = b.startsWith("/") ? b : `/${b}`;
  return `${left}${right}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  const s = (baseUrl || "").trim();
  if (!s) return "";
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

function resolveApiUrl(path: string): string {
  const raw = (path || "").trim();
  if (!raw) return raw;
  if (isAbsoluteUrl(raw)) return raw;

  const { apiBaseUrl, apiPrefix } = getAppConfig();
  const fullPath = raw.startsWith("/api/") || raw === "/api" ? raw : joinPath(apiPrefix, raw);
  const base = normalizeBaseUrl(apiBaseUrl);
  if (base) return new URL(fullPath, base).toString();

  // Dev proxy mode: return relative URL so browser hits Vite server and proxy forwards to API.
  return fullPath;
}

export function PluginIcon(props: PluginIconProps) {
  const [failed, setFailed] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const iconUrl = (props.iconUrl || "").trim();
  const size =
    Number.isFinite(props.size) && (props.size as number) > 0 ? (props.size as number) : null;
  const accessToken = useAuthStore((s) => s.accessToken);

  const resolved = useMemo(() => {
    if (!iconUrl) return null;
    // Absolute icon URLs can be rendered directly without auth header.
    if (isAbsoluteUrl(iconUrl)) return { kind: "direct" as const, src: iconUrl };
    return { kind: "api" as const, src: resolveApiUrl(iconUrl) };
  }, [iconUrl]);

  useEffect(() => {
    setFailed(false);
    setBlobUrl(null);
  }, [iconUrl]);

  useEffect(() => {
    if (!resolved || resolved.kind !== "api") return;
    if (!accessToken) return;

    const ctrl = new AbortController();
    let alive = true;
    let objectUrl: string | null = null;

    const run = async () => {
      try {
        const res = await fetch(resolved.src, {
          method: "GET",
          headers: {
            // Authorization is required because plugin icon endpoint is workspace-RBAC protected.
            authorization: accessToken.startsWith("Bearer ")
              ? accessToken
              : `Bearer ${accessToken}`,
            accept: "image/*",
          },
          signal: ctrl.signal,
        });
        if (!res.ok) {
          throw new Error(`Icon fetch failed (${res.status})`);
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!alive) return;
        setBlobUrl(objectUrl);
      } catch {
        if (!alive) return;
        setFailed(true);
      }
    };

    void run();

    return () => {
      alive = false;
      ctrl.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, resolved]);

  const imgSrc = resolved?.kind === "direct" ? resolved.src : blobUrl;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md bg-muted",
        "flex items-center justify-center",
        props.className,
      )}
      style={size ? { width: size, height: size } : undefined}
    >
      {imgSrc && !failed ? (
        <img
          src={imgSrc}
          alt={props.name}
          className={cn("h-full w-full object-cover", props.imgClassName)}
          width={size ?? 64}
          height={size ?? 64}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package
          className={cn("size-5 text-muted-foreground", props.fallbackIconClassName)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
