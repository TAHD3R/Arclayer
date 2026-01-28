import { Form, Input } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/animate-ui/components/radix/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
import { Button } from "@/components/ui/button";
import { type AppLocale } from "@/utils/i18n";
import { type SetupDefaultsDraft } from "@/stores/useSetupWizardStore";

const COMMON_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Shanghai",
  "Asia/Tokyo",
] as const;

const DATE_FORMAT_ITEMS = [
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2026-01-28)" },
  { value: "YYYY/MM/DD", label: "YYYY/MM/DD (2026/01/28)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (01/28/2026)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (28/01/2026)" },
] as const;

function formatLocaleLabel(locale: AppLocale, t: (key: string) => string): string {
  if (locale === "zh-CN") return t("common:ACCOUNT_LANGUAGE_ZH");
  return t("common:ACCOUNT_LANGUAGE_EN");
}

export function SetupDefaultsStep(props: {
  form: ReturnType<typeof Form.useForm<SetupDefaultsDraft>>[0];
  disabled?: boolean;
  onValuesChange: (
    changed: Partial<SetupDefaultsDraft>,
    values: Partial<SetupDefaultsDraft>,
  ) => void;
}) {
  const { t } = useTranslation();

  const timezone = Form.useWatch("timezone", props.form) as string | undefined;
  const locale = Form.useWatch("locale", props.form) as AppLocale | undefined;
  const dateFormat = Form.useWatch("dateFormat", props.form) as string | undefined;

  const localeItems = useMemo(
    () => [
      { value: "zh-CN" as const, label: formatLocaleLabel("zh-CN", t) },
      { value: "en-US" as const, label: formatLocaleLabel("en-US", t) },
    ],
    [t],
  );

  const timezoneItems = useMemo(() => {
    const base = [...COMMON_TIMEZONES];
    // If the detected/stored timezone isn't in our common list, prepend it so it can be selected.
    if (timezone && !base.includes(timezone as any)) {
      base.unshift(timezone as any);
    }
    return base.map((v) => ({ value: v, label: v }));
  }, [timezone]);

  const currentTimezoneLabel = timezone || timezoneItems[0]?.label || "UTC";
  const currentLocaleLabel = locale ? formatLocaleLabel(locale, t) : localeItems[0]?.label;
  const currentDateFormatLabel =
    DATE_FORMAT_ITEMS.find((it) => it.value === dateFormat)?.label || DATE_FORMAT_ITEMS[0]?.label;

  return (
    <Form<SetupDefaultsDraft>
      form={props.form}
      layout="vertical"
      requiredMark={false}
      autoComplete="off"
      disabled={props.disabled}
      onValuesChange={props.onValuesChange}
    >
      {/* Hidden items register fields for antd validation. */}
      <Form.Item<SetupDefaultsDraft>
        name="timezone"
        rules={[{ required: true, message: t("common:SETUP_VALIDATION_TIMEZONE_REQUIRED") }]}
        hidden
      >
        <Input />
      </Form.Item>
      <Form.Item<SetupDefaultsDraft>
        name="locale"
        rules={[{ required: true, message: t("common:SETUP_VALIDATION_LOCALE_REQUIRED") }]}
        hidden
      >
        <Input />
      </Form.Item>
      <Form.Item<SetupDefaultsDraft>
        name="dateFormat"
        rules={[{ required: true, message: t("common:SETUP_VALIDATION_DATE_FORMAT_REQUIRED") }]}
        hidden
      >
        <Input />
      </Form.Item>

      <Accordion type="single" collapsible className="px-0">
        <AccordionItem value="timezone">
          <AccordionTrigger>
            <div className="flex flex-col gap-1">
              <div className="text-[20px] font-bold leading-tight">
                {t("common:SETUP_FIELD_TIMEZONE_TITLE")}
              </div>
              <div className="text-[16px] text-muted-foreground leading-snug">
                {t("common:SETUP_TIMEZONE_DESC", { current: currentTimezoneLabel })}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="justify-between min-w-[240px]">
                  {t("common:SETUP_SELECT")}
                  <span className="text-muted-foreground text-xs">{currentTimezoneLabel}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[min(360px,calc(100vw-2rem))]">
                <DropdownMenuRadioGroup
                  value={timezone || ""}
                  onValueChange={(v) => {
                    props.form.setFieldValue("timezone", v);
                    // `setFieldValue` is programmatic and may not trigger `onValuesChange`,
                    // so we explicitly sync it to the wizard store.
                    props.onValuesChange({ timezone: v }, props.form.getFieldsValue(true));
                  }}
                >
                  {timezoneItems.map((it) => (
                    <DropdownMenuRadioItem key={it.value} value={it.value}>
                      {it.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="locale">
          <AccordionTrigger>
            <div className="flex flex-col gap-1">
              <div className="text-[20px] font-bold leading-tight">
                {t("common:SETUP_FIELD_LANGUAGE_TITLE")}
              </div>
              <div className="text-[16px] text-muted-foreground leading-snug">
                {t("common:SETUP_LANGUAGE_DESC", { current: currentLocaleLabel })}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="justify-between min-w-[220px]">
                  {t("common:SETUP_SELECT")}
                  <span className="text-muted-foreground text-xs">{currentLocaleLabel}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[min(280px,calc(100vw-2rem))]">
                <DropdownMenuRadioGroup
                  value={locale || ""}
                  onValueChange={(v) => {
                    props.form.setFieldValue("locale", v as AppLocale);
                    props.onValuesChange(
                      { locale: v as AppLocale },
                      props.form.getFieldsValue(true),
                    );
                  }}
                >
                  {localeItems.map((it) => (
                    <DropdownMenuRadioItem key={it.value} value={it.value}>
                      {it.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="dateFormat">
          <AccordionTrigger>
            <div className="flex flex-col gap-1">
              <div className="text-[20px] font-bold leading-tight">
                {t("common:SETUP_FIELD_DATE_FORMAT_TITLE")}
              </div>
              <div className="text-[16px] text-muted-foreground leading-snug">
                {t("common:SETUP_DATE_FORMAT_DESC", { current: currentDateFormatLabel })}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="justify-between min-w-[260px]">
                  {t("common:SETUP_SELECT")}
                  <span className="text-muted-foreground text-xs">{currentDateFormatLabel}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[min(360px,calc(100vw-2rem))]">
                <DropdownMenuRadioGroup
                  value={dateFormat || ""}
                  onValueChange={(v) => {
                    props.form.setFieldValue("dateFormat", v);
                    props.onValuesChange({ dateFormat: v }, props.form.getFieldsValue(true));
                  }}
                >
                  {DATE_FORMAT_ITEMS.map((it) => (
                    <DropdownMenuRadioItem key={it.value} value={it.value}>
                      {it.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Form>
  );
}
