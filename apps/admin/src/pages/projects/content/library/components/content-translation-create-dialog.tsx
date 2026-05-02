import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";

import { buildSupportedLocaleOptions, SUPPORTED_LOCALES } from "@/lib/i18n";
import type { ContentLibraryTableRow } from "../types";

function availableTargetLocales(row: ContentLibraryTableRow, t: (key: string) => string) {
  const existing = new Set([row.locale, ...(row.translationStatus?.locales ?? [])]);
  return buildSupportedLocaleOptions(SUPPORTED_LOCALES, t).filter(
    (option) => !existing.has(option.value),
  );
}

export function ContentTranslationCreateDialog(props: {
  row: ContentLibraryTableRow | null;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (targetLocale: string) => void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const options = React.useMemo(
    () => (props.row ? availableTargetLocales(props.row, (key) => t(key)) : []),
    [props.row, t],
  );
  const [targetLocale, setTargetLocale] = React.useState<string>("");

  React.useEffect(() => {
    if (!props.row) {
      setTargetLocale("");
      return;
    }
    setTargetLocale(options[0]?.value ?? "");
  }, [options, props.row]);

  const disabled = props.pending || !targetLocale;

  return (
    <SettingDialog
      open={Boolean(props.row)}
      onOpenChange={(open) => {
        if (!open && !props.pending) props.onClose();
      }}
      title={t("CONTENT_TRANSLATION_CREATE_DIALOG_TITLE")}
      description={t("CONTENT_TRANSLATION_CREATE_DIALOG_DESC", {
        name: props.row?.name ?? "",
      })}
      footer={
        <>
          <Button variant="ghost" disabled={props.pending} onClick={props.onClose}>
            {t("common:CANCEL")}
          </Button>
          <Button
            loading={props.pending}
            disabled={disabled}
            onClick={() => {
              if (!targetLocale) return;
              props.onConfirm(targetLocale);
            }}
          >
            {t("CONTENT_TRANSLATION_CREATE_ACTION")}
          </Button>
        </>
      }
    >
      <SettingDialogFields>
        <SettingDialogField
          title={t("CONTENT_TRANSLATION_TARGET_LOCALE_LABEL")}
          description={t("CONTENT_TRANSLATION_TARGET_LOCALE_DESC")}
        >
          <Select value={targetLocale} onValueChange={setTargetLocale} disabled={props.pending}>
            <SelectTrigger>
              <SelectValue placeholder={t("CONTENT_TRANSLATION_TARGET_LOCALE_PLACEHOLDER")} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingDialogField>
      </SettingDialogFields>
    </SettingDialog>
  );
}
