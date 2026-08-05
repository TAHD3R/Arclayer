import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";

import { getLocaleMetadata } from "@/lib/i18n";

export function LocaleFlag(props: { locale: string; className?: string }) {
  const { i18n } = useTranslation();
  const metadata = getLocaleMetadata(props.locale, i18n.t.bind(i18n));

  return (
    <span
      aria-hidden="true"
      className={cn(
        "fi rounded-[2px] text-caption",
        `fi-${metadata.flagCountryCode}`,
        props.className,
      )}
    />
  );
}
