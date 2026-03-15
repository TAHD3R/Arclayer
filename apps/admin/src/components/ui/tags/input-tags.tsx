import type { ReactNode } from "react";
import { AlertTriangle, User } from "lucide-react";

import { BaseTag, lucideTagIcon, type TagPresentationProps } from "./tag-base";

type EmailInputTagProps = TagPresentationProps & {
  label: ReactNode;
  invalid: boolean;
  closable: boolean;
  onClose: ((e: React.MouseEvent<HTMLElement>) => void) | undefined;
};

export function EmailInputTag(props: EmailInputTagProps) {
  const icon = props.invalid ? lucideTagIcon(AlertTriangle) : lucideTagIcon(User);

  return (
    <BaseTag
      color={props.invalid ? "error" : "default"}
      icon={icon}
      closable={props.closable}
      onClose={props.onClose}
      className={props.className}
      style={props.style}
      textStyle={props.textStyle}
    >
      {props.label}
    </BaseTag>
  );
}
