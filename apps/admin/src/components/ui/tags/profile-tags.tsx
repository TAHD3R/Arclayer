import type { ReactNode } from "react";
import { Link2, Link2Off } from "lucide-react";

import { BaseTag, lucideTagIcon } from "./tag-base";

type SharedProps = {
  className?: string;
  label: ReactNode;
};

export function LinkedAccountStatusTag(props: SharedProps & { linked: boolean }) {
  if (props.linked) {
    return (
      <BaseTag color="green" icon={lucideTagIcon(Link2)} className={props.className}>
        {props.label}
      </BaseTag>
    );
  }

  return (
    <BaseTag icon={lucideTagIcon(Link2Off)} className={props.className}>
      {props.label}
    </BaseTag>
  );
}
