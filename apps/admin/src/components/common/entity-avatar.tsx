import { Avatar, type AvatarProps } from "antd";
import type { CSSProperties } from "react";

import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { initialsFromName } from "@/lib/auth/user-profile";

type EntityAvatarShape = "circle" | "square";

type EntityAvatarProps = {
  name?: string | null;
  assetRef?: string | null;
  size?: AvatarProps["size"];
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

  return (
    <Avatar
      size={props.size}
      shape={props.shape}
      className={props.className}
      style={props.style}
      src={src}
    >
      {initialsFromName(label)}
    </Avatar>
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
