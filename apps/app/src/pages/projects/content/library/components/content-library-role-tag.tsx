import {
  Blocks,
  Braces,
  FileText,
  LayoutTemplate,
  Settings2,
  Sparkles,
  Tags,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { BaseTag, lucideTagIcon } from "@/components/ui/tags";
import type { ContentLibraryRole } from "../types";

type RolePresentation = {
  color: "default" | "blue" | "green" | "gold" | "red";
  icon: LucideIcon;
  labelKey: string;
};

const ROLE_PRESENTATION: Record<ContentLibraryRole, RolePresentation> = {
  page: {
    color: "gold",
    icon: LayoutTemplate,
    labelKey: "CONTENT_LIBRARY_ROLE_PAGE",
  },
  article: {
    color: "blue",
    icon: FileText,
    labelKey: "CONTENT_LIBRARY_ROLE_ARTICLE",
  },
  "reusable-section": {
    color: "default",
    icon: Blocks,
    labelKey: "CONTENT_LIBRARY_ROLE_REUSABLE_SECTION",
  },
  taxonomy: {
    color: "green",
    icon: Tags,
    labelKey: "CONTENT_LIBRARY_ROLE_TAXONOMY",
  },
  person: {
    color: "blue",
    icon: UserRound,
    labelKey: "CONTENT_LIBRARY_ROLE_PERSON",
  },
  settings: {
    color: "red",
    icon: Settings2,
    labelKey: "CONTENT_LIBRARY_ROLE_SETTINGS",
  },
  data: {
    color: "default",
    icon: Braces,
    labelKey: "CONTENT_LIBRARY_ROLE_DATA",
  },
  general: {
    color: "default",
    icon: Sparkles,
    labelKey: "CONTENT_LIBRARY_ROLE_GENERAL",
  },
};

export function getContentLibraryRoleLabelKey(role: ContentLibraryRole): string {
  return ROLE_PRESENTATION[role].labelKey;
}

export function getContentLibraryRoleIcon(role: ContentLibraryRole): LucideIcon {
  return ROLE_PRESENTATION[role].icon;
}

export function ContentLibraryRoleTag(props: { role: ContentLibraryRole; className?: string }) {
  const { t } = useTranslation("content");
  const presentation = ROLE_PRESENTATION[props.role];

  return (
    <BaseTag
      color={presentation.color}
      icon={lucideTagIcon(presentation.icon)}
      className={props.className}
      classNames={{ content: "min-w-0 max-w-full truncate" }}
    >
      {t(presentation.labelKey)}
    </BaseTag>
  );
}
