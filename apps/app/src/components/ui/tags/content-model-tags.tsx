import type { ReactNode } from "react";
import { Hash, type LucideIcon, LayoutGrid, Layers, Package } from "lucide-react";

import { BaseTag, lucideTagIcon, type BaseTagColor, type TagPresentationProps } from "./tag-base";
import type { ContentModelsTableRow } from "@/pages/projects/content/models/types";

type SharedProps = TagPresentationProps & {
  label: ReactNode;
};

export function ContentModelFieldKeyTag(props: SharedProps) {
  return (
    <BaseTag
      icon={lucideTagIcon(Hash)}
      className={props.className}
      style={props.style}
      textStyle={props.textStyle}
    >
      <span className="font-mono">{props.label}</span>
    </BaseTag>
  );
}

export function ContentModelFieldTypeTag(props: SharedProps & { icon: LucideIcon }) {
  return (
    <BaseTag
      icon={lucideTagIcon(props.icon)}
      className={props.className}
      style={props.style}
      textStyle={props.textStyle}
    >
      {props.label}
    </BaseTag>
  );
}

type ContentModelKind = "collection_type" | "single_type" | "component";

const CONTENT_MODEL_KIND_ICON_MAP: Record<ContentModelKind, LucideIcon> = {
  collection_type: LayoutGrid,
  single_type: Layers,
  component: Package,
};

const CONTENT_MODEL_KIND_COLOR_MAP: Record<ContentModelKind, BaseTagColor> = {
  collection_type: "blue",
  single_type: "green",
  component: "gold",
};

export function ContentModelKindTag(
  props: SharedProps & { kind?: ContentModelsTableRow["modelKind"] },
) {
  const normalizedKind: ContentModelKind =
    props.kind === "single_type" || props.kind === "component" ? props.kind : "collection_type";
  const Icon = CONTENT_MODEL_KIND_ICON_MAP[normalizedKind];
  return (
    <BaseTag
      color={CONTENT_MODEL_KIND_COLOR_MAP[normalizedKind]}
      icon={lucideTagIcon(Icon)}
      className={props.className}
      style={props.style}
      textStyle={props.textStyle}
    >
      {props.label}
    </BaseTag>
  );
}
