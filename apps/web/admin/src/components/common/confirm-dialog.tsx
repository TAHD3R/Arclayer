"use client";

import type { ReactNode } from "react";

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
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent showCloseButton className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          {props.description ? (
            <DialogDescription className="mt-2">{props.description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <DialogFooter className="mt-6">
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

