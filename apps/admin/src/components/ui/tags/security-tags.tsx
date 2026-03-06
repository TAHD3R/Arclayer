import type { ReactNode } from "react";

import { BaseTag } from "./tag-base";

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
