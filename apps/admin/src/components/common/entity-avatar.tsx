import type { CSSProperties } from "react";

import { cn } from "@celestial/lib/utils";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { initialsFromName } from "@/lib/auth/user-profile";

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

function resolveAvatarName(name: string | null | undefined, fallbackLabel: string): string {
  const normalized = String(name || "").trim();
  return normalized || fallbackLabel;
}

function EntityAvatar(props: EntityAvatarProps) {
  const label = resolveAvatarName(props.name, props.fallbackLabel);
  const src = resolveAssetRefToPublicUrlPath(props.assetRef) ?? undefined;
  const size = props.size ?? 32;
  const shapeClassName = props.shape === "circle" ? "rounded-full" : "rounded-md";

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
      {src ? (
        <img src={src} alt={label} className="size-full object-cover" />
      ) : (
        <span>{initialsFromName(label)}</span>
      )}
    </div>
  );
}

export function UserAvatar(props: PublicEntityAvatarProps) {
  return <EntityAvatar {...props} fallbackLabel="用户" shape="circle" />;
}

export function WorkspaceAvatar(props: PublicEntityAvatarProps) {
  return <EntityAvatar {...props} fallbackLabel="工作区" shape="square" />;
}

export function OrganizationAvatar(props: PublicEntityAvatarProps) {
  return <EntityAvatar {...props} fallbackLabel="组织" shape="square" />;
}
