import { Archive, CheckCircle2, FilePenLine, PenSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BaseTag, lucideTagIcon } from "@/components/ui/tags";
import type { ContentLibraryDerivedStatus } from "../types";

export function ContentLibraryStatusTag(props: { status: ContentLibraryDerivedStatus }) {
  const { t } = useTranslation("content");

  if (props.status === "published") {
    return (
      <BaseTag color="green" icon={lucideTagIcon(CheckCircle2)}>
        {t("CONTENT_LIBRARY_STATUS_PUBLISHED")}
      </BaseTag>
    );
  }

  if (props.status === "changed") {
    return (
      <BaseTag color="gold" icon={lucideTagIcon(FilePenLine)}>
        {t("CONTENT_LIBRARY_STATUS_CHANGED")}
      </BaseTag>
    );
  }

  if (props.status === "archived") {
    return (
      <BaseTag color="red" icon={lucideTagIcon(Archive)}>
        {t("CONTENT_LIBRARY_STATUS_ARCHIVED")}
      </BaseTag>
    );
  }

  return <BaseTag icon={lucideTagIcon(PenSquare)}>{t("CONTENT_LIBRARY_STATUS_DRAFT")}</BaseTag>;
}
