import { Braces, FilePenLine, LayoutTemplate, Sparkles, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BaseTag, lucideTagIcon } from "./tag-base";

type ContentRuntime = "text" | "visual" | "data" | "unknown";

type RuntimePresentation = {
  color: "default" | "blue" | "gold";
  icon: LucideIcon;
  labelKey: string;
};

const RUNTIME_PRESENTATION: Record<ContentRuntime, RuntimePresentation> = {
  text: {
    color: "blue",
    icon: FilePenLine,
    labelKey: "CONTENT_LIBRARY_RUNTIME_WRITING",
  },
  visual: {
    color: "gold",
    icon: LayoutTemplate,
    labelKey: "CONTENT_LIBRARY_RUNTIME_VISUAL",
  },
  data: {
    color: "default",
    icon: Braces,
    labelKey: "CONTENT_LIBRARY_RUNTIME_STRUCTURED",
  },
  unknown: {
    color: "default",
    icon: Sparkles,
    labelKey: "CONTENT_LIBRARY_RUNTIME_FLEXIBLE",
  },
};

export function ContentRuntimeTag(props: { runtime: ContentRuntime }) {
  const { t } = useTranslation("content");
  const presentation = RUNTIME_PRESENTATION[props.runtime];

  return (
    <BaseTag color={presentation.color} icon={lucideTagIcon(presentation.icon)}>
      {t(presentation.labelKey)}
    </BaseTag>
  );
}
