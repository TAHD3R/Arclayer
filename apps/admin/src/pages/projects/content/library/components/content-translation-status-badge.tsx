import { useTranslation } from "react-i18next";

import { BaseTag } from "@/components/ui/tags";
import type { ContentLibraryTableRow } from "../types";

export function ContentTranslationStatusBadge(props: { row: ContentLibraryTableRow }) {
  const { t } = useTranslation("content");
  const locales = props.row.translationStatus?.locales ?? [props.row.locale];
  const uniqueLocales = Array.from(new Set(locales.filter(Boolean))).sort();

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <BaseTag color={uniqueLocales.length > 1 ? "blue" : "default"}>
        {t("CONTENT_TRANSLATION_STATUS_LOCALES", { count: uniqueLocales.length })}
      </BaseTag>
      <span className="truncate text-footnote text-label-secondary">
        {uniqueLocales.join(", ") || props.row.locale}
      </span>
    </div>
  );
}
