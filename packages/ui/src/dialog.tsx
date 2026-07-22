import * as React from "react";

import {
  Dialog as DialogPrimitive,
  DialogContent as DialogContentPrimitive,
  DialogDescription as DialogDescriptionPrimitive,
  DialogFooter as DialogFooterPrimitive,
  DialogHeader as DialogHeaderPrimitive,
  DialogTitle as DialogTitlePrimitive,
  DialogTrigger as DialogTriggerPrimitive,
  DialogPortal as DialogPortalPrimitive,
  DialogOverlay as DialogOverlayPrimitive,
  DialogClose as DialogClosePrimitive,
  type DialogProps as DialogPrimitiveProps,
  type DialogContentProps as DialogContentPrimitiveProps,
  type DialogDescriptionProps as DialogDescriptionPrimitiveProps,
  type DialogFooterProps as DialogFooterPrimitiveProps,
  type DialogHeaderProps as DialogHeaderPrimitiveProps,
  type DialogTitleProps as DialogTitlePrimitiveProps,
  type DialogTriggerProps as DialogTriggerPrimitiveProps,
  type DialogOverlayProps as DialogOverlayPrimitiveProps,
  type DialogCloseProps as DialogClosePrimitiveProps,
} from "@arclayer/ui/radix-primitives/radix-dialog";
import { cn } from "@arclayer/lib/utils";
import { SUBTLE_OVERLAY_BACKDROP_CLASSNAME } from "./adaptive-overlay-backdrop";
import { OverlayCloseButton } from "./overlay-close-button";

const ALLOWED_EXTERNAL_DIALOG_INTERACTION_SELECTOR = [
  "[data-slot=select-content]",
  ".ant-select-dropdown",
  ".ant-picker-dropdown",
  ".ant-cascader-dropdown",
  ".ant-dropdown",
  ".ant-popover",
  ".ant-tooltip",
].join(", ");
const DIALOG_LAYER_Z_INDEX_CLASSNAME = "z-[2300]";

function isAllowedExternalDialogInteractionTarget(target: EventTarget | null): boolean {
  const element =
    target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null;
  if (!element) return false;
  return element.closest(ALLOWED_EXTERNAL_DIALOG_INTERACTION_SELECTOR) instanceof HTMLElement;
}

function resolveOutsideInteractionTarget(
  event: Parameters<NonNullable<DialogContentPrimitiveProps["onInteractOutside"]>>[0],
): EventTarget | null {
  const originalTarget = (event as { detail?: { originalEvent?: Event } }).detail?.originalEvent
    ?.target;
  return originalTarget ?? event.target;
}

type DialogProps = DialogPrimitiveProps;

function Dialog(props: DialogProps) {
  return <DialogPrimitive {...props} />;
}

type DialogTriggerProps = DialogTriggerPrimitiveProps;

function DialogTrigger(props: DialogTriggerProps) {
  return <DialogTriggerPrimitive {...props} />;
}

type DialogCloseProps = DialogClosePrimitiveProps;

function DialogClose(props: DialogCloseProps) {
  return <DialogClosePrimitive {...props} />;
}

type DialogOverlayProps = DialogOverlayPrimitiveProps;

function DialogOverlay({ className, ...props }: DialogOverlayProps) {
  return (
    <DialogOverlayPrimitive
      className={cn(
        "fixed inset-0",
        DIALOG_LAYER_Z_INDEX_CLASSNAME,
        SUBTLE_OVERLAY_BACKDROP_CLASSNAME,
        className,
      )}
      {...props}
    />
  );
}

type DialogContentProps = DialogContentPrimitiveProps & {
  showCloseButton?: boolean;
  closeButtonClassName?: string;
  closeButtonLabel?: string;
  overlayClassName?: string;
};

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeButtonClassName,
  closeButtonLabel,
  overlayClassName,
  onInteractOutside,
  ...props
}: DialogContentProps) {
  const handleInteractOutside = React.useCallback(
    (event: Parameters<NonNullable<DialogContentPrimitiveProps["onInteractOutside"]>>[0]) => {
      if (isAllowedExternalDialogInteractionTarget(resolveOutsideInteractionTarget(event))) {
        event.preventDefault();
        return;
      }
      onInteractOutside?.(event);
    },
    [onInteractOutside],
  );

  return (
    <DialogPortalPrimitive>
      <DialogOverlay className={overlayClassName} />
      <div
        data-overlay-root="dialog"
        className={cn(
          "pointer-events-none fixed inset-0 flex items-center justify-center p-4",
          DIALOG_LAYER_Z_INDEX_CLASSNAME,
        )}
      >
        <DialogContentPrimitive
          className={cn(
            "bg-card grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border p-6  sm:max-w-lg",
            "relative",
            className,
          )}
          onInteractOutside={handleInteractOutside}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogClosePrimitive asChild>
              <OverlayCloseButton className={closeButtonClassName} srLabel={closeButtonLabel} />
            </DialogClosePrimitive>
          )}
        </DialogContentPrimitive>
      </div>
    </DialogPortalPrimitive>
  );
}

type DialogHeaderProps = DialogHeaderPrimitiveProps;

function DialogHeader({ className, ...props }: DialogHeaderProps) {
  return (
    <DialogHeaderPrimitive
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

type DialogFooterProps = DialogFooterPrimitiveProps;

function DialogFooter({ className, ...props }: DialogFooterProps) {
  return (
    <DialogFooterPrimitive
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

type DialogTitleProps = DialogTitlePrimitiveProps;

function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <DialogTitlePrimitive className={cn("text-title2 font-bold! mb-0! ", className)} {...props} />
  );
}

type DialogDescriptionProps = DialogDescriptionPrimitiveProps;

function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return (
    <DialogDescriptionPrimitive
      className={cn("text-label-secondary mb-0!", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  type DialogProps,
  type DialogTriggerProps,
  type DialogCloseProps,
  type DialogContentProps,
  type DialogHeaderProps,
  type DialogFooterProps,
  type DialogTitleProps,
  type DialogDescriptionProps,
};
