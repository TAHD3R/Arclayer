import { useTranslation } from "react-i18next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import type { AppLocale } from "@/lib/i18n";
import type { LocalizationOption } from "@/lib/settings/general/localization-options";

export function ContentBootstrapStepOnePanel(props: {
  busy: boolean;
  title: string;
  locale: AppLocale;
  localeOptions: Array<LocalizationOption<AppLocale>>;
  onTitleChange: (value: string) => void;
  onLocaleChange: (value: AppLocale) => void;
}) {
  const { t } = useTranslation("content");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="rounded-[28px] border-border/70 bg-white/88 shadow-[0_26px_80px_-54px_rgba(15,23,42,0.38)] backdrop-blur">
        <CardHeader className="space-y-3 pb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-label-secondary">
            {t("CONTENT_BOOTSTRAP_STEP_ONE_LABEL")}
          </div>
          <CardTitle className="text-[1.9rem] tracking-[-0.03em] text-foreground">
            {t("CONTENT_BOOTSTRAP_STEP_ONE_TITLE")}
          </CardTitle>
          <CardDescription className="max-w-2xl text-base leading-7 text-label-secondary">
            {t("CONTENT_BOOTSTRAP_STEP_ONE_DESC")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 pt-0">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">
              {t("CONTENT_BOOTSTRAP_FIELD_TITLE_LABEL")}
            </span>
            <span className="text-sm text-label-secondary">
              {t("CONTENT_BOOTSTRAP_FIELD_TITLE_DESC")}
            </span>
            <Input
              autoFocus
              value={props.title}
              disabled={props.busy}
              onChange={(event) => props.onTitleChange(event.target.value)}
              placeholder={t("CONTENT_BOOTSTRAP_FIELD_TITLE_PLACEHOLDER")}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">
              {t("CONTENT_BOOTSTRAP_FIELD_LOCALE_LABEL")}
            </span>
            <span className="text-sm text-label-secondary">
              {t("CONTENT_BOOTSTRAP_FIELD_LOCALE_DESC")}
            </span>
            <Select
              value={props.locale}
              onValueChange={(value) => props.onLocaleChange(value as AppLocale)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("CONTENT_BOOTSTRAP_FIELD_LOCALE_PLACEHOLDER")} />
              </SelectTrigger>
              <SelectContent>
                {props.localeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-border/70 bg-white/84 shadow-[0_22px_72px_-54px_rgba(15,23,42,0.34)] backdrop-blur">
        <CardHeader>
          <CardTitle className="text-title3 text-foreground">
            {t("CONTENT_BOOTSTRAP_STEP_ONE_ASIDE_TITLE")}
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-label-secondary">
            {t("CONTENT_BOOTSTRAP_STEP_ONE_ASIDE_DESC")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-label-secondary">
          <p>{t("CONTENT_BOOTSTRAP_STEP_ONE_ASIDE_POINT_ONE")}</p>
          <p>{t("CONTENT_BOOTSTRAP_STEP_ONE_ASIDE_POINT_TWO")}</p>
          <p>{t("CONTENT_BOOTSTRAP_STEP_ONE_ASIDE_POINT_THREE")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
