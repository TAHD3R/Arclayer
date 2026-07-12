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
  decorative?: boolean;
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

function relativeLuminance(color: string): number {
  const normalized = normalizeHexColor(color);
  if (!normalized) return 0;

  const toLinear = (channel: number): number => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const red = toLinear(Number.parseInt(normalized.slice(1, 3), 16));
  const green = toLinear(Number.parseInt(normalized.slice(3, 5), 16));
  const blue = toLinear(Number.parseInt(normalized.slice(5, 7), 16));

  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(firstColor: string, secondColor: string): number {
  const lighter = Math.max(relativeLuminance(firstColor), relativeLuminance(secondColor));
  const darker = Math.min(relativeLuminance(firstColor), relativeLuminance(secondColor));

  return (lighter + 0.05) / (darker + 0.05);
}

function resolveAvatarForegroundColor(backgroundColor: string): string {
  const lightForeground = "#ffffff";
  const darkForeground = "#000000";
  const lightContrast = contrastRatio(backgroundColor, lightForeground);
  const darkContrast = contrastRatio(backgroundColor, darkForeground);

  return darkContrast >= lightContrast ? darkForeground : lightForeground;
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
      aria-label={props.decorative ? undefined : label}
      aria-hidden={props.decorative ? true : undefined}
    >
      {canRenderImage ? (
        <img
          src={src}
          alt={props.decorative ? "" : label}
          className="size-full object-cover"
          onError={markImageFailed}
        />
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
  const foregroundColor = backgroundColor
    ? resolveAvatarForegroundColor(backgroundColor)
    : undefined;
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
      aria-label={props.decorative ? undefined : label}
      aria-hidden={props.decorative ? true : undefined}
    >
      {kind === "image" && canRenderImage ? (
        <img
          src={src}
          alt={props.decorative ? "" : label}
          className="size-full object-cover"
          onError={markImageFailed}
        />
      ) : kind === "emoji" && emoji ? (
        <span>{emoji}</span>
      ) : kind === "glyph" && GlyphIcon ? (
        <GlyphIcon className="size-[58%]" aria-hidden="true" strokeWidth={2.2} />
      ) : (
        <span>{initialsFromName(label)}</span>
      )}
    </div>
  );
}
