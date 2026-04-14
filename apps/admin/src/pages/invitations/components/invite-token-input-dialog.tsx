import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialogField } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

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
            variant="ghost"
            disabled={Boolean(props.confirmLoading)}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
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
      <SettingDialogField
        title={t("invite:INVITE_TOKEN_INPUT_FIELD_LABEL")}
        description={t("invite:INVITE_TOKEN_INPUT_FIELD_HELP")}
      >
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
      </SettingDialogField>
    </SettingDialog>
  );
}
