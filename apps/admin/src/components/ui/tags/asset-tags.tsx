import type { ReactNode } from "react";
import type { CSSProperties } from "react";
import {
  Ban,
  FileType,
  Folder,
  Globe,
  HelpCircle,
  Lock,
  Search,
  Tag as TagIcon,
  Users,
} from "lucide-react";

import { BaseTag, lucideTagIcon } from "./tag-base";

type SharedProps = {
  className?: string;
  label: ReactNode;
  style?: CSSProperties;
};

export function AssetMimeTag(props: SharedProps & { title?: string }) {
  return (
    <BaseTag
      icon={lucideTagIcon(FileType)}
      className={props.className}
      style={props.style}
      title={props.title}
    >
      {props.label}
    </BaseTag>
  );
}

function visibilityIcon(visibility: string | null | undefined) {
  const v = String(visibility || "").trim();
  if (v === "public") return Globe;
  if (v === "private") return Lock;
  if (v === "shared") return Users;
  return HelpCircle;
}

export function AssetVisibilityTag(props: SharedProps & { visibility: string | null | undefined }) {
  const Icon = visibilityIcon(props.visibility);
  return (
    <BaseTag icon={lucideTagIcon(Icon)} className={props.className} style={props.style}>
      {props.label}
    </BaseTag>
  );
}

export function AssetPurposeTag(props: SharedProps & { purpose: string | null | undefined }) {
  return (
    <BaseTag
      icon={lucideTagIcon(Folder)}
      className={props.className}
      style={props.style}
      title={props.purpose ?? undefined}
    >
      {props.label}
    </BaseTag>
  );
}

export function AssetIndexableTag(props: SharedProps & { indexable: boolean | null | undefined }) {
  const icon =
    props.indexable === true
      ? lucideTagIcon(Search)
      : props.indexable === false
        ? lucideTagIcon(Ban)
        : lucideTagIcon(HelpCircle);
  return (
    <BaseTag icon={icon} className={props.className} style={props.style}>
      {props.label}
    </BaseTag>
  );
}

type AssetUserTagChipProps = {
  label: ReactNode;
  closable: boolean;
  onClose: ((e: React.MouseEvent<HTMLElement>) => void) | undefined;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

export function AssetUserTagChip(props: AssetUserTagChipProps) {
  return (
    <BaseTag
      icon={lucideTagIcon(TagIcon)}
      closable={props.closable}
      onClose={props.onClose}
      className={props.className}
      style={props.style}
    >
      {props.children ?? props.label}
    </BaseTag>
  );
}

type AssetAddTagActionProps = {
  label: ReactNode;
  onClick: () => void;
  className?: string;
  style?: CSSProperties;
};

export function AssetAddTagActionTag(props: AssetAddTagActionProps) {
  return (
    <BaseTag
      icon={lucideTagIcon(TagIcon)}
      className={props.className}
      style={props.style}
      classNames={{ root: "!cursor-pointer !border-dashed" }}
      onClick={props.onClick}
    >
      {props.label}
    </BaseTag>
  );
}
