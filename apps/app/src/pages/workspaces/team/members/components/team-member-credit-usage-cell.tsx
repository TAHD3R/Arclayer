import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { MemberCreditUsageItemOut } from "@/api/commerce";
import { Skeleton } from "@arclayer/ui/skeleton";

export function TeamMemberCreditUsageCell(props: {
  usage?: MemberCreditUsageItemOut;
  loading: boolean;
}) {
  const { t, i18n } = useTranslation(["commerce", "team"]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  if (props.loading) {
    return (
      <div className="space-y-2" aria-label={t("team:TEAM_USAGE_LOADING")} role="status">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-3 w-36" />
      </div>
    );
  }
  if (!props.usage) {
    return <span className="text-label-secondary">{t("team:TEAM_USAGE_NOT_AVAILABLE")}</span>;
  }

  const available =
    props.usage.availableCredits == null
      ? t("commerce:MEMBER_LIMIT_UNLIMITED")
      : number.format(props.usage.availableCredits);

  return (
    <div className="min-w-0">
      <div className="text-callout font-medium tabular-nums text-label-primary">
        {number.format(props.usage.committedCredits)}
        <span className="ml-1 font-normal text-label-secondary">
          {t("commerce:MEMBER_USAGE_COLUMN_USED")}
        </span>
      </div>
      <div className="mt-1 truncate text-caption tabular-nums text-label-secondary">
        {t("team:TEAM_USAGE_SUMMARY", {
          reserved: number.format(props.usage.reservedCredits),
          available,
        })}
      </div>
    </div>
  );
}
