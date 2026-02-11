"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Button } from "antd";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent showCloseButton className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{displayTitle}</DialogTitle>
          {displayDescription ? (
            <DialogDescription className="mt-2">{displayDescription}</DialogDescription>
          ) : null}
        </DialogHeader>

        <DialogFooter className="mt-0">
          <Button onClick={() => props.onOpenChange(false)} disabled={props.loading}>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
