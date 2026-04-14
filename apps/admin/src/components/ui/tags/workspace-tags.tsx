import type { ReactNode } from "react";
import { UserRound } from "lucide-react";

import { BaseTag, lucideTagIcon, type TagPresentationProps } from "./tag-base";

type PersonalWorkspaceTagProps = TagPresentationProps & {
  label: ReactNode;
};

export function PersonalWorkspaceTag(props: PersonalWorkspaceTagProps) {
  return (
    <BaseTag
      icon={lucideTagIcon(UserRound)}
      className={props.className}
      textStyle={props.textStyle}
    >
      {props.label}
    </BaseTag>
  );
}
