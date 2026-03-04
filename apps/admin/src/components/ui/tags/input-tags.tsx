import type { ReactNode } from "react";
import type { CSSProperties } from "react";
import { AtSign, AlertTriangle } from "lucide-react";

import { BaseTag, lucideTagIcon } from "./tag-base";

type EmailInputTagProps = {
  label: ReactNode;
  invalid: boolean;
  closable: boolean;
  onClose: ((e: React.MouseEvent<HTMLElement>) => void) | undefined;
  className?: string;
  style?: CSSProperties;
};

export function EmailInputTag(props: EmailInputTagProps) {
  const icon = props.invalid ? lucideTagIcon(AlertTriangle) : lucideTagIcon(AtSign);

  return (
    <BaseTag
      color={props.invalid ? "error" : "default"}
      icon={icon}
      closable={props.closable}
      onClose={props.onClose}
      className={props.className}
      style={props.style}
    >
      {props.label}
    </BaseTag>
  );
}
