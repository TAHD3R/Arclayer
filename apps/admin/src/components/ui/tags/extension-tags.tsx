import type { ReactNode } from "react";
import { CheckCircle2, Package, Tags } from "lucide-react";

import { BaseTag, lucideTagIcon } from "./tag-base";

type SharedProps = {
  className?: string;
  label: ReactNode;
};

export function ExtensionInstalledTag(props: SharedProps) {
  return (
    <BaseTag color="green" icon={lucideTagIcon(CheckCircle2)} className={props.className}>
      {props.label}
    </BaseTag>
  );
}

export function ExtensionCategoryTag(props: SharedProps) {
  return (
    <BaseTag icon={lucideTagIcon(Tags)} className={props.className}>
      {props.label}
    </BaseTag>
  );
}

export function ExtensionVersionTag(props: SharedProps) {
  return (
    <BaseTag icon={lucideTagIcon(Package)} className={props.className}>
      {props.label}
    </BaseTag>
  );
}
