"use client";

import { useEffect, useState, type ReactNode } from "react";

import { LoaderCircle } from "lucide-react";

import { Button } from "./button";
import { SettingDialog } from "./setting-dialog";

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmText: ReactNode;
  cancelText: ReactNode;
  danger?: boolean;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const [titleSnapshot, setTitleSnapshot] = useState<ReactNode>(props.title);
  const [descriptionSnapshot, setDescriptionSnapshot] = useState<ReactNode>(props.description);

  useEffect(() => {
    if (!props.open) return;
    setTitleSnapshot(props.title);
    setDescriptionSnapshot(props.description);
  }, [props.description, props.open, props.title]);

  const displayTitle = props.open ? props.title : titleSnapshot;
  const displayDescription = props.open ? props.description : descriptionSnapshot;

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={displayTitle}
      description={displayDescription}
      contentClassName="sm:max-w-[520px]"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => props.onOpenChange(false)}
            disabled={Boolean(props.loading)}
          >
            {props.cancelText}
          </Button>
          <Button
            variant={props.danger ? "destructive" : "default"}
            onClick={() => void props.onConfirm()}
            disabled={Boolean(props.loading)}
          >
            {props.loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {props.confirmText}
          </Button>
        </>
      }
    >
      <></>
    </SettingDialog>
  );
}
