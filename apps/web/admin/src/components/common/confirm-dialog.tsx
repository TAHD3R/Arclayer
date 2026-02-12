"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Button } from "antd";

import { SettingDialog } from "@/components/common/setting-dialog";

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
          <Button type="text" onClick={() => props.onOpenChange(false)} disabled={props.loading}>
            {props.cancelText}
          </Button>
          <Button
            type="primary"
            danger={props.danger}
            loading={props.loading}
            onClick={() => void props.onConfirm()}
          >
            {props.confirmText}
          </Button>
        </>
      }
    >
      <></>
    </SettingDialog>
  );
}
