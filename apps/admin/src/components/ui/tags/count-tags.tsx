import type { ReactNode } from "react";
import { CheckSquare2, Users } from "lucide-react";

import { BaseTag, lucideTagIcon } from "./tag-base";

type SharedProps = {
  className?: string;
  label: ReactNode;
};

export function SelectedCountTag(props: SharedProps) {
  return (
    <BaseTag
      icon={lucideTagIcon(CheckSquare2)}
      className={props.className}
      classNames={{ root: "!rounded-full !bg-muted" }}
    >
      {props.label}
    </BaseTag>
  );
}

export function UsesCountTag(props: SharedProps) {
  return (
    <BaseTag
      color="blue"
      icon={lucideTagIcon(Users)}
      className={props.className}
      style={{ marginInlineEnd: 0 }}
    >
      {props.label}
    </BaseTag>
  );
}
