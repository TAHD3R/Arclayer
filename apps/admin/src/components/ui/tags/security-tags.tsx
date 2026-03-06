import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

import { BaseTag, lucideTagIcon } from "./tag-base";

type SharedProps = {
  className?: string;
  label: ReactNode;
};

export function SecurityNotConfiguredTag(props: SharedProps) {
  return (
    <BaseTag
      className={props.className}
      classNames={{ root: "!rounded-full !bg-muted/40 !text-label-secondary" }}
      style={{ marginInlineEnd: 0 }}
    >
      {props.label}
    </BaseTag>
  );
}

export function SecurityConfiguredTag(props: SharedProps) {
  return (
    <BaseTag
      color="green"
      icon={lucideTagIcon(CheckCircle2)}
      className={props.className}
      style={{ marginInlineEnd: 0 }}
    >
      {props.label}
    </BaseTag>
  );
}

export function SecurityCurrentSessionTag(props: SharedProps) {
  return (
    <BaseTag
      color="blue"
      className={props.className}
      classNames={{ root: "!rounded-full" }}
      style={{ marginInlineEnd: 0 }}
    >
      {props.label}
    </BaseTag>
  );
}
