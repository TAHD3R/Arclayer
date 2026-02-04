import { Button, Select } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type UpdateAssetsAccessDialogValue = {
  visibility?: string;
  purpose?: string;
};

export type UpdateAssetsAccessDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  mode: "single" | "bulk";
  assetCount?: number;

  currentVisibility?: string;
  currentPurpose?: string;

  confirmLoading?: boolean;
  onConfirm: (value: UpdateAssetsAccessDialogValue) => Promise<void> | void;
};

const KEEP_VALUE = "__keep__";

type Option = { value: string; label: string };

export function UpdateAssetsAccessDialog(props: UpdateAssetsAccessDialogProps) {
  const { t } = useTranslation();

  const [visibility, setVisibility] = useState<string>(KEEP_VALUE);
  const [purpose, setPurpose] = useState<string>(KEEP_VALUE);

  useEffect(() => {
    if (!props.open) return;
    if (props.mode === "single") {
      setVisibility((props.currentVisibility || "public").toLowerCase());
      setPurpose((props.currentPurpose || "library").toLowerCase());
      return;
    }
    setVisibility(KEEP_VALUE);
    setPurpose(KEEP_VALUE);
  }, [props.currentPurpose, props.currentVisibility, props.mode, props.open]);

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
      { value: "favicon", label: t("assets:ASSET_PURPOSE_FAVICON") },
      { value: "attachment", label: t("assets:ASSET_PURPOSE_ATTACHMENT") },
      { value: "article_cover", label: t("assets:ASSET_PURPOSE_ARTICLE_COVER") },
    ];
    if (props.mode === "single") return core;
    return [{ value: KEEP_VALUE, label: t("assets:ASSET_EDIT_KEEP") }, ...core];
  }, [props.mode, t]);

  const disabled = Boolean(props.confirmLoading);
  const canSubmit = useMemo(() => {
    if (disabled) return false;
    if (props.mode === "single") return true;
    return visibility !== KEEP_VALUE || purpose !== KEEP_VALUE;
  }, [disabled, props.mode, purpose, visibility]);

  const title =
    props.mode === "single"
      ? t("assets:ASSET_EDIT_ACCESS_TITLE")
      : t("assets:ASSET_BULK_EDIT_ACCESS_TITLE", { count: props.assetCount || 0 });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader className="gap-2">
          <DialogTitle className="font-bold! text-xl">{title}</DialogTitle>
          <DialogDescription className="text-base">
            {props.mode === "single"
              ? t("assets:ASSET_EDIT_ACCESS_DESC")
              : t("assets:ASSET_BULK_EDIT_ACCESS_DESC")}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-1">
            <div className="text-sm text-foreground/80">{t("assets:ASSET_META_VISIBILITY")}</div>
            <Select
              style={{ width: "100%" }}
              value={visibility}
              options={visibilityOptions}
              onChange={(v) => setVisibility(String(v))}
              disabled={disabled}
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm text-foreground/80">{t("assets:ASSET_META_PURPOSE")}</div>
            <Select
              style={{ width: "100%" }}
              value={purpose}
              options={purposeOptions}
              onChange={(v) => setPurpose(String(v))}
              disabled={disabled}
            />
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button type="text" disabled={disabled} onClick={() => props.onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button
            type="primary"
            loading={props.confirmLoading}
            disabled={!canSubmit}
            onClick={async () => {
              const out: UpdateAssetsAccessDialogValue = {};
              if (props.mode === "single") {
                out.visibility = visibility;
                out.purpose = purpose;
              } else {
                if (visibility !== KEEP_VALUE) out.visibility = visibility;
                if (purpose !== KEEP_VALUE) out.purpose = purpose;
              }
              await props.onConfirm(out);
              props.onOpenChange(false);
            }}
          >
            {t("common:CONFIRM")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
