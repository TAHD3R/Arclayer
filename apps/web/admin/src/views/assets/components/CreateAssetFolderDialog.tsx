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

export type CreateAssetFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentLabel?: string;
  confirmLoading?: boolean;
  onCreate: (name: string, description: string | null) => Promise<void> | void;
};

export function CreateAssetFolderDialog(props: CreateAssetFolderDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setName("");
    setDescription("");
  }, [props.open]);

  const canSubmit = name.trim().length > 0 && !props.confirmLoading;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader className="gap-2">
          <DialogTitle className="font-bold! text-xl">
            {t("assets:ASSET_FOLDER_CREATE_TITLE")}
          </DialogTitle>
          <DialogDescription className="text-base">
            {props.parentLabel
              ? t("assets:ASSET_FOLDER_CREATE_DESC_IN", { parent: props.parentLabel })
              : t("assets:ASSET_FOLDER_CREATE_DESC")}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("assets:ASSET_FOLDER_CREATE_PLACEHOLDER")}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (!canSubmit) return;
              void (async () => {
                await props.onCreate(name.trim(), description.trim() || null);
                props.onOpenChange(false);
              })();
            }}
          />
        </div>

        <div className="mt-4 space-y-1">
          <div className="text-sm text-foreground/80">{t("assets:ASSET_FOLDER_DESCRIPTION")}</div>
          <Input.TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("assets:ASSET_FOLDER_DESCRIPTION_PLACEHOLDER")}
            autoSize={{ minRows: 2, maxRows: 5 }}
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
              await props.onCreate(name.trim(), description.trim() || null);
              props.onOpenChange(false);
            }}
          >
            {t("assets:ASSET_FOLDER_CREATE_CONFIRM")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
