"use client";

import { useEffect, useState, type ReactNode } from "react";

import { LoaderCircle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "./radix-primitives/radix-alert-dialog";
import { Button } from "./button";

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
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent className="sm:max-w-[520px]">
        <AlertDialogHeader>
          <AlertDialogTitle>{displayTitle}</AlertDialogTitle>
          {displayDescription ? (
            <AlertDialogDescription>{displayDescription}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancelPrimitive asChild>
            <Button
              variant="ghost"
              onClick={() => props.onOpenChange(false)}
              disabled={Boolean(props.loading)}
            >
              {props.cancelText}
            </Button>
          </AlertDialogCancelPrimitive>
          <AlertDialogActionPrimitive asChild>
            <Button
              variant={props.danger ? "destructive" : "default"}
              onClick={() => void props.onConfirm()}
              disabled={Boolean(props.loading)}
            >
              {props.loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {props.confirmText}
            </Button>
          </AlertDialogActionPrimitive>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
