import type { CSSProperties } from "react";

import { cn } from "@arclayer/lib/utils";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { initialsFromName } from "@/lib/auth/user-profile";
import { useImageFallback } from "./use-image-fallback";
import { getWorkspaceGlyphIcon } from "./workspace-icon-glyphs";

type EntityAvatarShape = "circle" | "square";

type EntityAvatarProps = {
  name?: string | null;
  assetRef?: string | null;
  size?: number;
  className?: string;
  style?: CSSProperties;
  fallbackLabel: string;
  shape: EntityAvatarShape;
};

type PublicEntityAvatarProps = Omit<EntityAvatarProps, "fallbackLabel" | "shape">;
type WorkspaceIconMode = "initials" | "glyph" | "emoji" | "image";

export type WorkspaceAvatarIdentity = {
  iconMode?: WorkspaceIconMode | null;
  iconColor?: string | null;
  iconGlyph?: string | null;
  iconEmoji?: string | null;
  iconUrl?: string | null;
};

export type WorkspaceAvatarProps = PublicEntityAvatarProps & {
  iconMode?: WorkspaceIconMode | null;
  iconColor?: string | null;
  iconGlyph?: string | null;
  iconEmoji?: string | null;
};

function resolveAvatarName(name: string | null | undefined, fallbackLabel: string): string {
  const normalized = String(name || "").trim();
  return normalized || fallbackLabel;
}

function normalizeHexColor(value?: string | null) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (!/^#[0-9a-f]{3}$/.test(normalized)) return null;

  return `#${normalized
    .slice(1)
    .split("")
    .map((char) => `${char}${char}`)
    .join("")}`;
}

function isBrightHexColor(color: string) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return false;

  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);

  return (red * 299 + green * 587 + blue * 114) / 1000 > 130;
}

function EntityAvatar(props: EntityAvatarProps) {
  const label = resolveAvatarName(props.name, props.fallbackLabel);
  const src = resolveAssetRefToPublicUrlPath(props.assetRef) ?? undefined;
  const size = props.size ?? 32;
  const shapeClassName = props.shape === "circle" ? "rounded-full" : "rounded-md";
  const { canRenderImage, markImageFailed } = useImageFallback(src);

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted text-footnote font-medium text-label-secondary ring-1 ring-border/60",
        shapeClassName,
        props.className,
      )}
      style={{ width: size, height: size, ...props.style }}
      aria-label={label}
    >
      {canRenderImage ? (
        <img src={src} alt={label} className="size-full object-cover" onError={markImageFailed} />
      ) : (
        <span>{initialsFromName(label)}</span>
      )}
    </div>
  );
}

function resolveWorkspaceAvatarKind(props: WorkspaceAvatarProps, src?: string): WorkspaceIconMode {
  if (props.iconMode === "image" && src) return "image";
  if (props.iconMode === "emoji" && props.iconEmoji?.trim()) return "emoji";
  if (props.iconMode === "glyph" && getWorkspaceGlyphIcon(props.iconGlyph)) return "glyph";
  if (!props.iconMode && src) return "image";
  return "initials";
}

export function UserAvatar(props: PublicEntityAvatarProps) {
  return <EntityAvatar {...props} fallbackLabel="用户" shape="circle" />;
}

export function workspaceAvatarPropsFromIdentity(identity?: WorkspaceAvatarIdentity | null) {
  return {
    assetRef: identity?.iconUrl ?? null,
    iconMode: identity?.iconMode ?? undefined,
    iconColor: identity?.iconColor ?? undefined,
    iconGlyph: identity?.iconGlyph ?? undefined,
    iconEmoji: identity?.iconEmoji ?? undefined,
  } satisfies WorkspaceAvatarProps;
}

export function WorkspaceAvatar(props: WorkspaceAvatarProps) {
  const label = resolveAvatarName(props.name, "工作空间");
  const src = resolveAssetRefToPublicUrlPath(props.assetRef) ?? undefined;
  const size = props.size ?? 32;
  const kind = resolveWorkspaceAvatarKind(props, src);
  const backgroundColor = normalizeHexColor(props.iconColor);
  const foregroundColor =
    backgroundColor && isBrightHexColor(backgroundColor) ? "#0f172a" : "#ffffff";
  const GlyphIcon = kind === "glyph" ? getWorkspaceGlyphIcon(props.iconGlyph) : null;
  const emoji = kind === "emoji" ? props.iconEmoji?.trim() : "";
  const hasCustomSurface = kind !== "image" && backgroundColor;
  const { canRenderImage, markImageFailed } = useImageFallback(src);

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted text-footnote font-semibold text-label-secondary ring-1 ring-border/60",
        kind === "emoji" && "text-[0.95em]",
        props.className,
      )}
      style={{
        width: size,
        height: size,
        ...(hasCustomSurface
          ? {
              backgroundColor,
              color: foregroundColor,
            }
          : null),
        ...props.style,
      }}
      aria-label={label}
    >
      {kind === "image" && canRenderImage ? (
        <img src={src} alt={label} className="size-full object-cover" onError={markImageFailed} />
      ) : kind === "emoji" && emoji ? (
        <span className="leading-none">{emoji}</span>
      ) : kind === "glyph" && GlyphIcon ? (
        <GlyphIcon className="size-[58%]" aria-hidden="true" strokeWidth={2.2} />
      ) : (
        <span>{initialsFromName(label)}</span>
      )}
    </div>
  );
}

export function OrganizationAvatar(props: PublicEntityAvatarProps) {
  return <EntityAvatar {...props} fallbackLabel="组织" shape="square" />;
}
