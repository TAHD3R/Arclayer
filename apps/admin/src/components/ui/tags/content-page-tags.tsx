import type { ReactNode } from "react";
import { LayoutTemplate, Pencil, Rocket, Route, ScrollText } from "lucide-react";

import type { ContentPageRow } from "@/pages/workspaces/content/pages/types";

import { BaseTag, lucideTagIcon } from "./tag-base";

type SharedProps = {
  className?: string;
  label: ReactNode;
};

type PageStatus = ContentPageRow["status"];

export function ContentPageStatusTag(props: SharedProps & { status: PageStatus }) {
  const { status, label, className } = props;

  if (status === "published") {
    return (
      <BaseTag
        color="green"
        icon={lucideTagIcon(Rocket)}
        className={className}
        style={{ marginInlineEnd: 0 }}
      >
        {label}
      </BaseTag>
    );
  }

  return (
    <BaseTag
      color="gold"
      icon={lucideTagIcon(Pencil)}
      className={className}
      style={{ marginInlineEnd: 0 }}
    >
      {label}
    </BaseTag>
  );
}

type PageType = ContentPageRow["pageType"];

export function ContentPageTypeTag(props: SharedProps & { pageType: PageType }) {
  const { pageType, label, className } = props;

  if (pageType === "template") {
    return (
      <BaseTag
        color="purple"
        icon={lucideTagIcon(LayoutTemplate)}
        className={className}
        style={{ marginInlineEnd: 0 }}
      >
        {label}
      </BaseTag>
    );
  }

  return (
    <BaseTag
      color="blue"
      icon={lucideTagIcon(ScrollText)}
      className={className}
      style={{ marginInlineEnd: 0 }}
    >
      {label}
    </BaseTag>
  );
}

export function ContentPagePathTag(props: SharedProps) {
  return (
    <BaseTag icon={lucideTagIcon(Route)} className={props.className} style={{ marginInlineEnd: 0 }}>
      {props.label}
    </BaseTag>
  );
}
