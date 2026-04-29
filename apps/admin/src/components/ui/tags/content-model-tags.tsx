import type { ReactNode } from "react";
import { Hash, type LucideIcon } from "lucide-react";

import { BaseTag, lucideTagIcon, type TagPresentationProps } from "./tag-base";

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
      color="blue"
      icon={lucideTagIcon(props.icon)}
      className={props.className}
      style={props.style}
      textStyle={props.textStyle}
    >
      {props.label}
    </BaseTag>
  );
}
