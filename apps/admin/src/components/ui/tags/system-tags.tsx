import type { ReactNode } from "react";
import { Star } from "lucide-react";

import { BaseTag, lucideTagIcon } from "./tag-base";

type SharedProps = {
  className?: string;
  label: ReactNode;
};

export function SysRevisionActiveTag(props: SharedProps) {
  return (
    <BaseTag
      icon={lucideTagIcon(Star)}
      className={props.className}
      classNames={{ root: "!rounded-full !bg-primary/10 !text-primary !text-[11px]" }}
    >
      {props.label}
    </BaseTag>
  );
}
