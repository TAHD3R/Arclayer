import type { ReactNode } from "react";
import { Code, Hash, SlidersHorizontal } from "lucide-react";

import { BaseTag, lucideTagIcon, type TagPresentationProps } from "./tag-base";

type SharedProps = TagPresentationProps & {
  label: ReactNode;
};

export function DevEnvTag(props: SharedProps) {
  return (
    <BaseTag
      icon={lucideTagIcon(Code)}
      className={props.className}
      textStyle={props.textStyle}
      classNames={{ root: "!bg-primary/10 !text-primary" }}
    >
      {props.label}
    </BaseTag>
  );
}

export function DebugHttpStatusTag(props: SharedProps) {
  return (
    <BaseTag icon={lucideTagIcon(Hash)} className={props.className} textStyle={props.textStyle}>
      {props.label}
    </BaseTag>
  );
}

export function ReducedMotionTag(props: SharedProps & { enabled: boolean }) {
  return (
    <BaseTag
      color={props.enabled ? "default" : "green"}
      icon={lucideTagIcon(SlidersHorizontal)}
      className={props.className}
      textStyle={props.textStyle}
    >
      {props.label}
    </BaseTag>
  );
}
