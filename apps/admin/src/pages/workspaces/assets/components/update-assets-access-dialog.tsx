import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

export type UpdateAssetsAccessDialogValue = {
  visibility?: string;
  purpose?: string;
  indexable?: boolean;
};

export type UpdateAssetsAccessDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  mode: "single" | "bulk";
  assetCount?: number;

  currentVisibility?: string;
  currentPurpose?: string;
  currentIndexable?: boolean;

  confirmLoading?: boolean;
  onConfirm: (value: UpdateAssetsAccessDialogValue) => Promise<void> | void;
};

const KEEP_VALUE = "__keep__";

type Option = { value: string; label: string };

export function UpdateAssetsAccessDialog(props: UpdateAssetsAccessDialogProps) {
  const { t } = useTranslation();

  const [visibility, setVisibility] = useState<string>(KEEP_VALUE);
  const [purpose, setPurpose] = useState<string>(KEEP_VALUE);
  const [indexable, setIndexable] = useState<string>(KEEP_VALUE);

  useEffect(() => {
    if (!props.open) return;
    if (props.mode === "single") {
      setVisibility((props.currentVisibility || "public").toLowerCase());
      setPurpose((props.currentPurpose || "library").toLowerCase());
      setIndexable(props.currentIndexable ? "true" : "false");
      return;
    }
    setVisibility(KEEP_VALUE);
    setPurpose(KEEP_VALUE);
    setIndexable(KEEP_VALUE);
  }, [
    props.currentIndexable,
    props.currentPurpose,
    props.currentVisibility,
    props.mode,
    props.open,
  ]);

  useEffect(() => {
    if (!props.open) return;
    const v = String(visibility || "").toLowerCase();
    if (props.mode === "single") {
      if (v !== "public") setIndexable("false");
      return;
    }
    if (v !== KEEP_VALUE && v !== "public") setIndexable("false");
  }, [props.mode, props.open, visibility]);

  const visibilityOptions = useMemo<Option[]>(() => {
    const core: Option[] = [
      { value: "public", label: t("assets:ASSET_FILTER_VISIBILITY_PUBLIC") },
      { value: "private", label: t("assets:ASSET_FILTER_VISIBILITY_PRIVATE") },
      { value: "shared", label: t("assets:ASSET_FILTER_VISIBILITY_SHARED") },
    ];
    if (props.mode === "single") return core;
    return [{ value: KEEP_VALUE, label: t("assets:ASSET_EDIT_KEEP") }, ...core];
  }, [props.mode, t]);

  const purposeOptions = useMemo<Option[]>(() => {
    const core: Option[] = [
      { value: "library", label: t("assets:ASSET_PURPOSE_LIBRARY") },
      { value: "avatar", label: t("assets:ASSET_PURPOSE_AVATAR") },
      { value: "site_logo", label: t("assets:ASSET_PURPOSE_SITE_LOGO") },
      { value: "workspace_icon", label: t("assets:ASSET_PURPOSE_WORKSPACE_ICON") },
      { value: "favicon", label: t("assets:ASSET_PURPOSE_FAVICON") },
      { value: "attachment", label: t("assets:ASSET_PURPOSE_ATTACHMENT") },
      { value: "article_cover", label: t("assets:ASSET_PURPOSE_ARTICLE_COVER") },
    ];
    if (props.mode === "single") return core;
    return [{ value: KEEP_VALUE, label: t("assets:ASSET_EDIT_KEEP") }, ...core];
  }, [props.mode, t]);

  const indexableOptions = useMemo<Option[]>(() => {
    const core: Option[] = [
      { value: "false", label: t("assets:ASSET_INDEXABLE_NO") },
      { value: "true", label: t("assets:ASSET_INDEXABLE_YES") },
    ];
    if (props.mode === "single") return core;
    return [{ value: KEEP_VALUE, label: t("assets:ASSET_EDIT_KEEP") }, ...core];
  }, [props.mode, t]);

  const disabled = Boolean(props.confirmLoading);
  const canSubmit = useMemo(() => {
    if (disabled) return false;
    if (props.mode === "single") return true;
    return visibility !== KEEP_VALUE || purpose !== KEEP_VALUE || indexable !== KEEP_VALUE;
  }, [disabled, indexable, props.mode, purpose, visibility]);

  const title =
    props.mode === "single"
      ? t("assets:ASSET_EDIT_ACCESS_TITLE")
      : t("assets:ASSET_BULK_EDIT_ACCESS_TITLE", { count: props.assetCount || 0 });

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={title}
      description={
        props.mode === "single"
          ? t("assets:ASSET_EDIT_ACCESS_DESC")
          : t("assets:ASSET_BULK_EDIT_ACCESS_DESC")
      }
      footer={
        <>
          <Button variant="ghost" disabled={disabled} onClick={() => props.onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button
            loading={props.confirmLoading}
            disabled={!canSubmit}
            onClick={async () => {
              const out: UpdateAssetsAccessDialogValue = {};
              if (props.mode === "single") {
                out.visibility = visibility;
                out.purpose = purpose;
                out.indexable = indexable === "true";
              } else {
                if (visibility !== KEEP_VALUE) out.visibility = visibility;
                if (purpose !== KEEP_VALUE) out.purpose = purpose;
                if (indexable !== KEEP_VALUE) out.indexable = indexable === "true";
              }
              await props.onConfirm(out);
              props.onOpenChange(false);
            }}
          >
            <Save className="size-4" aria-hidden="true" />
            {t("common:CONFIRM")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("assets:ASSET_META_VISIBILITY")}
          </label>
          <div className="text-label-secondary">
            {t("assets:ASSET_EDIT_ACCESS_VISIBILITY_HELP")}
          </div>
          <Select value={visibility} onValueChange={setVisibility} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {visibilityOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">{t("assets:ASSET_META_PURPOSE")}</label>
          <div className="text-label-secondary">{t("assets:ASSET_EDIT_ACCESS_PURPOSE_HELP")}</div>
          <Select value={purpose} onValueChange={setPurpose} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {purposeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("assets:ASSET_META_INDEXABLE")}
          </label>
          <div className="text-label-secondary">{t("assets:ASSET_EDIT_ACCESS_INDEXABLE_HELP")}</div>
          <Select value={indexable} onValueChange={setIndexable} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {indexableOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </SettingDialog>
  );
}
