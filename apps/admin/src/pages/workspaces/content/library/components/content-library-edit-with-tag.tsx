import { Braces, FilePenLine, LayoutTemplate, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BaseTag, lucideTagIcon } from "@/components/ui/tags";

import type { ContentLibraryEditWith } from "../types";

type EditWithPresentation = {
  color: "default" | "blue" | "gold";
  icon: LucideIcon;
  labelKey: string;
};

const EDIT_WITH_PRESENTATION: Record<ContentLibraryEditWith, EditWithPresentation> = {
  writing: {
    color: "blue",
    icon: FilePenLine,
    labelKey: "CONTENT_LIBRARY_EDIT_WITH_WRITING",
  },
  canvas: {
    color: "gold",
    icon: LayoutTemplate,
    labelKey: "CONTENT_LIBRARY_EDIT_WITH_CANVAS",
  },
  structured: {
    color: "default",
    icon: Braces,
    labelKey: "CONTENT_LIBRARY_EDIT_WITH_STRUCTURED",
  },
};

export function getContentLibraryEditWithLabelKey(editWith: ContentLibraryEditWith): string {
  return EDIT_WITH_PRESENTATION[editWith].labelKey;
}

export function ContentLibraryEditWithTag(props: { editWith: ContentLibraryEditWith }) {
  const { t } = useTranslation("content");
  const presentation = EDIT_WITH_PRESENTATION[props.editWith];

  return (
    <BaseTag color={presentation.color} icon={lucideTagIcon(presentation.icon)}>
      {t(presentation.labelKey)}
    </BaseTag>
  );
}
