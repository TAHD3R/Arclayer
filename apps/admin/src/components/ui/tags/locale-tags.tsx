import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";

import { buildLocaleDisplaySummary, getLocaleMetadata } from "@/lib/i18n";
import { BaseTag } from "./tag-base";

export function LocaleFlag(props: { locale: string; className?: string }) {
  const { i18n } = useTranslation();
  const metadata = getLocaleMetadata(props.locale, i18n.t.bind(i18n));

  return (
    <span
      aria-hidden="true"
      className={cn(
        "fi rounded-[2px] text-[0.8rem] leading-none",
        `fi-${metadata.flagCountryCode}`,
        props.className,
      )}
    />
  );
}

export function LocaleTag(props: { locale: string }) {
  const { i18n } = useTranslation();
  const metadata = getLocaleMetadata(props.locale, i18n.t.bind(i18n));

  return (
    <BaseTag icon={<LocaleFlag locale={props.locale} />} color="default">
      {metadata.label}
    </BaseTag>
  );
}

export function LocaleTagList(props: { localeCodes: string }) {
  const { t, i18n } = useTranslation("content");
  const summary = buildLocaleDisplaySummary(props.localeCodes, i18n.t.bind(i18n));

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {summary.visibleMetadata.map((locale) => (
        <LocaleTag key={locale.code} locale={locale.code} />
      ))}
      {summary.remainingCount > 0 ? (
        <span className="text-caption text-label-secondary">
          {t("CONTENT_LIBRARY_LOCALE_MORE", { count: summary.remainingCount })}
        </span>
      ) : null}
    </div>
  );
}
