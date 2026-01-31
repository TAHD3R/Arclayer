import { Button, Input } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/animate-ui/components/radix/dialog";

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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader className="gap-2">
          <DialogTitle className="font-bold! text-xl">
            {t("invite:INVITE_TOKEN_INPUT_TITLE")}
          </DialogTitle>
          <DialogDescription className="text-base">
            {t("invite:INVITE_TOKEN_INPUT_DESC")}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
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

        <DialogFooter className="mt-6">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
