import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { MailTemplate, MailTemplatePreview } from "@/api/mail";
import { LocaleFlag } from "@/components/ui/tags";
import { getLocaleMetadata } from "@/lib/i18n";
import { Button } from "@arclayer/ui/button";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

type PreviewMode = "desktop" | "mobile" | "text";

export function EmailTemplatePreviewDialog(props: {
  open: boolean;
  template: MailTemplate | null;
  preview: MailTemplatePreview | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation(["settings", "account"]);
  const [mode, setMode] = useState<PreviewMode>("desktop");
  const locale = props.template?.locale ?? "";
  const localeMetadata = locale ? getLocaleMetadata(locale, i18n.t.bind(i18n)) : null;

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREVIEW_DIALOG_TITLE")}
      description={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREVIEW_DIALOG_DESC")}
      contentClassName="sm:max-w-5xl"
      bodyClassName="p-0"
      footer={
        <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
          {t("common:CLOSE")}
        </Button>
      }
    >
      <div className="flex min-h-[34rem] min-w-0 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
          <div className="min-w-0">
            <div className="truncate text-headline text-label-primary">
              {props.preview?.subject ?? "-"}
            </div>
            {localeMetadata ? (
              <div className="mt-1 flex items-center gap-2 text-footnote text-label-secondary">
                <LocaleFlag locale={locale} />
                <span>{localeMetadata.label}</span>
                <span className="font-mono">{locale}</span>
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-1 rounded-md bg-muted p-1">
            {(["desktop", "mobile", "text"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={mode === value ? "secondary" : "ghost"}
                onClick={() => setMode(value)}
              >
                {t(`settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREVIEW_MODE_${value.toUpperCase()}`)}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-muted/30 p-5">
          {mode === "text" ? (
            <pre className="min-h-full w-full whitespace-pre-wrap rounded-lg border bg-card p-5 font-mono text-caption text-label-primary">
              {props.preview?.text ?? ""}
            </pre>
          ) : (
            <div className={mode === "mobile" ? "w-[375px] max-w-full" : "w-full max-w-4xl"}>
              <iframe
                title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREVIEW_FRAME_TITLE")}
                sandbox=""
                srcDoc={props.preview?.html ?? ""}
                className="h-[32rem] w-full rounded-lg border bg-white"
              />
            </div>
          )}
        </div>
      </div>
    </SettingDialog>
  );
}
