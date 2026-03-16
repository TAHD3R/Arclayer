import type { ReactNode } from "react";
import { Star } from "@arclayer/ui/icons/lucide-animated";

import { BaseTag, lucideTagIcon, type TagPresentationProps } from "./tag-base";

type SharedProps = TagPresentationProps & {
  label: ReactNode;
};

export function SysRevisionActiveTag(props: SharedProps) {
  return (
    <BaseTag
      icon={lucideTagIcon(Star)}
      className={props.className}
      textStyle={props.textStyle}
      classNames={{ root: "!rounded-full !bg-primary/10 !text-primary" }}
    >
      {props.label}
    </BaseTag>
  );
}
