import {
  AlertDialog as AlertDialogPrimitive,
  AlertDialogContent as AlertDialogContentPrimitive,
  AlertDialogDescription as AlertDialogDescriptionPrimitive,
  AlertDialogFooter as AlertDialogFooterPrimitive,
  AlertDialogHeader as AlertDialogHeaderPrimitive,
  AlertDialogTitle as AlertDialogTitlePrimitive,
  AlertDialogTrigger as AlertDialogTriggerPrimitive,
  AlertDialogPortal as AlertDialogPortalPrimitive,
  AlertDialogOverlay as AlertDialogOverlayPrimitive,
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
  useAlertDialog,
  type AlertDialogProps as AlertDialogPrimitiveProps,
  type AlertDialogContentProps as AlertDialogContentPrimitiveProps,
  type AlertDialogDescriptionProps as AlertDialogDescriptionPrimitiveProps,
  type AlertDialogFooterProps as AlertDialogFooterPrimitiveProps,
  type AlertDialogHeaderProps as AlertDialogHeaderPrimitiveProps,
  type AlertDialogTitleProps as AlertDialogTitlePrimitiveProps,
  type AlertDialogTriggerProps as AlertDialogTriggerPrimitiveProps,
  type AlertDialogOverlayProps as AlertDialogOverlayPrimitiveProps,
  type AlertDialogActionProps as AlertDialogActionPrimitiveProps,
  type AlertDialogCancelProps as AlertDialogCancelPrimitiveProps,
} from "@arclayer/ui/radix-primitives/radix-alert-dialog";
import { cn } from "@arclayer/lib/utils";
import { SUBTLE_OVERLAY_BACKDROP_CLASSNAME } from "./adaptive-overlay-backdrop";
import { OverlayCloseButton } from "./overlay-close-button";
import { buttonVariants } from "./button-variants";

const ALERT_DIALOG_LAYER_Z_INDEX_CLASSNAME = "z-[2300]";

type AlertDialogProps = AlertDialogPrimitiveProps;

function AlertDialog(props: AlertDialogProps) {
  return <AlertDialogPrimitive {...props} />;
}

type AlertDialogTriggerProps = AlertDialogTriggerPrimitiveProps;

function AlertDialogTrigger(props: AlertDialogTriggerProps) {
  return <AlertDialogTriggerPrimitive {...props} />;
}

type AlertDialogOverlayProps = AlertDialogOverlayPrimitiveProps;

function AlertDialogOverlay({ className, ...props }: AlertDialogOverlayProps) {
  return (
    <AlertDialogOverlayPrimitive
      className={cn(
        "fixed inset-0",
        ALERT_DIALOG_LAYER_Z_INDEX_CLASSNAME,
        SUBTLE_OVERLAY_BACKDROP_CLASSNAME,
        "backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

type AlertDialogContentProps = AlertDialogContentPrimitiveProps & {
  showCloseButton?: boolean;
};

function AlertDialogContent({
  className,
  showCloseButton = true,
  children,
  ...props
}: AlertDialogContentProps) {
  const { setIsOpen } = useAlertDialog();

  return (
    <AlertDialogPortalPrimitive>
      <AlertDialogOverlay />
      <AlertDialogContentPrimitive
        className={cn(
          "bg-card fixed left-1/2 top-1/2 grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border p-6 sm:max-w-lg",
          ALERT_DIALOG_LAYER_Z_INDEX_CLASSNAME,
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? <OverlayCloseButton onClick={() => setIsOpen?.(false)} /> : null}
      </AlertDialogContentPrimitive>
    </AlertDialogPortalPrimitive>
  );
}

type AlertDialogHeaderProps = AlertDialogHeaderPrimitiveProps;

function AlertDialogHeader({ className, ...props }: AlertDialogHeaderProps) {
  return (
    <AlertDialogHeaderPrimitive
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

type AlertDialogFooterProps = AlertDialogFooterPrimitiveProps;

function AlertDialogFooter({ className, ...props }: AlertDialogFooterProps) {
  return (
    <AlertDialogFooterPrimitive
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

type AlertDialogTitleProps = AlertDialogTitlePrimitiveProps;

function AlertDialogTitle({ className, ...props }: AlertDialogTitleProps) {
  return (
    <AlertDialogTitlePrimitive
      className={cn("text-title2 font-bold! mb-0! ", className)}
      {...props}
    />
  );
}

type AlertDialogDescriptionProps = AlertDialogDescriptionPrimitiveProps;

function AlertDialogDescription({ className, ...props }: AlertDialogDescriptionProps) {
  return (
    <AlertDialogDescriptionPrimitive
      className={cn("text-label-secondary! mb-0!", className)}
      {...props}
    />
  );
}

type AlertDialogActionProps = AlertDialogActionPrimitiveProps;

function AlertDialogAction({ className, ...props }: AlertDialogActionPrimitiveProps) {
  return <AlertDialogActionPrimitive className={cn(buttonVariants(), className)} {...props} />;
}

type AlertDialogCancelProps = AlertDialogCancelPrimitiveProps;

function AlertDialogCancel({ className, ...props }: AlertDialogCancelPrimitiveProps) {
  return (
    <AlertDialogCancelPrimitive
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  type AlertDialogProps,
  type AlertDialogTriggerProps,
  type AlertDialogContentProps,
  type AlertDialogHeaderProps,
  type AlertDialogFooterProps,
  type AlertDialogTitleProps,
  type AlertDialogDescriptionProps,
  type AlertDialogActionProps,
  type AlertDialogCancelProps,
};
