import type { ReactNode } from "react";
import { Link2, Link2Off } from "lucide-react";

import { BaseTag, lucideTagIcon, type TagPresentationProps } from "./tag-base";

type SharedProps = TagPresentationProps & {
  label: ReactNode;
};

export function LinkedAccountStatusTag(props: SharedProps & { linked: boolean }) {
  if (props.linked) {
    return (
      <BaseTag
        color="green"
        icon={lucideTagIcon(Link2)}
        className={props.className}
        textStyle={props.textStyle}
      >
        {props.label}
      </BaseTag>
    );
  }

  return (
    <BaseTag icon={lucideTagIcon(Link2Off)} className={props.className} textStyle={props.textStyle}>
      {props.label}
    </BaseTag>
  );
}
