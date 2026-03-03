import { Button, Input } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { SettingDialog } from "@celestial/ui/setting-dialog";

export type InviteTokenInputDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmLoading?: boolean;
  onSubmit: (token: string) => Promise<void> | void;
};

export function InviteTokenInputDialog(props: InviteTokenInputDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setValue("");
  }, [props.open]);

  const token = value.trim();
  const canSubmit = token.length > 0 && !props.confirmLoading;

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("invite:INVITE_TOKEN_INPUT_TITLE")}
      description={t("invite:INVITE_TOKEN_INPUT_DESC")}
      footer={
        <>
          <Button
            type="text"
            disabled={Boolean(props.confirmLoading)}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            type="primary"
            loading={props.confirmLoading}
            disabled={!canSubmit}
            onClick={async () => {
              await props.onSubmit(token);
              props.onOpenChange(false);
            }}
          >
            {t("invite:INVITE_TOKEN_INPUT_CONFIRM")}
          </Button>
        </>
      }
    >
      <div className="mt-4 grid gap-1.5">
        <label className="font-semibold text-foreground">
          {t("invite:INVITE_TOKEN_INPUT_FIELD_LABEL")}
        </label>
        <div className="text-label-secondary">{t("invite:INVITE_TOKEN_INPUT_FIELD_HELP")}</div>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("invite:INVITE_TOKEN_INPUT_PLACEHOLDER")}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (!canSubmit) return;
            void (async () => {
              await props.onSubmit(token);
              props.onOpenChange(false);
            })();
          }}
        />
      </div>
    </SettingDialog>
  );
}
