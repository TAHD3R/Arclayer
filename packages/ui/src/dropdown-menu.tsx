import * as React from "react";

import {
  DropdownMenu as DropdownMenuPrimitive,
  DropdownMenuContent as DropdownMenuContentPrimitive,
  DropdownMenuGroup as DropdownMenuGroupPrimitive,
  DropdownMenuItem as DropdownMenuItemPrimitive,
  DropdownMenuItemIndicator as DropdownMenuItemIndicatorPrimitive,
  DropdownMenuCheckboxItem as DropdownMenuCheckboxItemPrimitive,
  DropdownMenuRadioGroup as DropdownMenuRadioGroupPrimitive,
  DropdownMenuRadioItem as DropdownMenuRadioItemPrimitive,
  DropdownMenuLabel as DropdownMenuLabelPrimitive,
  DropdownMenuSeparator as DropdownMenuSeparatorPrimitive,
  DropdownMenuShortcut as DropdownMenuShortcutPrimitive,
  DropdownMenuSub as DropdownMenuSubPrimitive,
  DropdownMenuSubContent as DropdownMenuSubContentPrimitive,
  DropdownMenuSubTrigger as DropdownMenuSubTriggerPrimitive,
  DropdownMenuTrigger as DropdownMenuTriggerPrimitive,
  type DropdownMenuProps as DropdownMenuPrimitiveProps,
  type DropdownMenuContentProps as DropdownMenuContentPrimitiveProps,
  type DropdownMenuGroupProps as DropdownMenuGroupPrimitiveProps,
  type DropdownMenuItemProps as DropdownMenuItemPrimitiveProps,
  type DropdownMenuCheckboxItemProps as DropdownMenuCheckboxItemPrimitiveProps,
  type DropdownMenuRadioGroupProps as DropdownMenuRadioGroupPrimitiveProps,
  type DropdownMenuRadioItemProps as DropdownMenuRadioItemPrimitiveProps,
  type DropdownMenuLabelProps as DropdownMenuLabelPrimitiveProps,
  type DropdownMenuSeparatorProps as DropdownMenuSeparatorPrimitiveProps,
  type DropdownMenuShortcutProps as DropdownMenuShortcutPrimitiveProps,
  type DropdownMenuSubProps as DropdownMenuSubPrimitiveProps,
  type DropdownMenuSubContentProps as DropdownMenuSubContentPrimitiveProps,
  type DropdownMenuSubTriggerProps as DropdownMenuSubTriggerPrimitiveProps,
  type DropdownMenuTriggerProps as DropdownMenuTriggerPrimitiveProps,
} from "@arclayer/ui/radix-primitives/radix-dropdown-menu";
import { cn } from "@arclayer/lib/utils";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react";
import { OVERLAY_LAYER_SHADOW_CLASSNAME } from "./layer-shadow";
import { useSidebarHoverPreviewLock } from "./sidebar";

type DropdownMenuProps = DropdownMenuPrimitiveProps;

function DropdownMenu({ open: openProp, defaultOpen, onOpenChange, ...props }: DropdownMenuProps) {
  const hoverPreviewLock = useSidebarHoverPreviewLock();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false);
  const open = openProp ?? uncontrolledOpen;
  const releaseHoverPreviewLockRef = React.useRef<(() => void) | null>(null);

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (openProp === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, openProp],
  );

  React.useEffect(() => {
    if (!hoverPreviewLock) return;

    if (open) {
      releaseHoverPreviewLockRef.current ??= hoverPreviewLock.lockHoverPreview();
      return;
    }

    releaseHoverPreviewLockRef.current?.();
    releaseHoverPreviewLockRef.current = null;
  }, [hoverPreviewLock, open]);

  React.useEffect(
    () => () => {
      releaseHoverPreviewLockRef.current?.();
      releaseHoverPreviewLockRef.current = null;
    },
    [],
  );

  return <DropdownMenuPrimitive open={open} onOpenChange={setOpen} {...props} />;
}

type DropdownMenuTriggerProps = DropdownMenuTriggerPrimitiveProps;

function DropdownMenuTrigger(props: DropdownMenuTriggerProps) {
  return <DropdownMenuTriggerPrimitive {...props} />;
}

type DropdownMenuContentProps = DropdownMenuContentPrimitiveProps;
const DROPDOWN_MENU_LAYER_Z_INDEX_CLASSNAME = "z-[2400]";

function DropdownMenuContent({ sideOffset = 4, className, ...props }: DropdownMenuContentProps) {
  return (
    <DropdownMenuContentPrimitive
      sideOffset={sideOffset}
      className={cn(
        "bg-popover text-popover-foreground flex max-h-(--radix-dropdown-menu-content-available-height) min-w-32 origin-[--radix-dropdown-menu-content-transform-origin] flex-col overflow-hidden rounded-md border p-1 outline-none duration-200 ease-out motion-reduce:animate-none! motion-reduce:transition-none! will-change-[opacity,transform] data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        DROPDOWN_MENU_LAYER_Z_INDEX_CLASSNAME,
        OVERLAY_LAYER_SHADOW_CLASSNAME,
        className,
      )}
      {...props}
    />
  );
}

type DropdownMenuGroupProps = DropdownMenuGroupPrimitiveProps;

function DropdownMenuGroup({ ...props }: DropdownMenuGroupProps) {
  return <DropdownMenuGroupPrimitive {...props} />;
}

type DropdownMenuItemProps = DropdownMenuItemPrimitiveProps & {
  inset?: boolean;
  variant?: "default" | "destructive";
};

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  disabled,
  ...props
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuItemPrimitive
      disabled={disabled}
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-footnote outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-label-secondary",
        variant === "destructive"
          ? "data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive dark:data-[highlighted]:bg-destructive/20"
          : "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

type DropdownMenuItemContentProps = {
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

function DropdownMenuItemContent({ icon, children, className }: DropdownMenuItemContentProps) {
  return (
    <span className={cn("flex min-w-0 flex-1 items-center gap-2", className)}>
      {icon ? (
        <span aria-hidden="true" className="flex min-w-4 shrink-0 items-center justify-center">
          {icon}
        </span>
      ) : (
        <span aria-hidden="true" className="min-w-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1">{children}</span>
    </span>
  );
}

type DropdownMenuIconItemProps = Omit<DropdownMenuItemProps, "children"> & {
  icon?: React.ReactNode;
  children: React.ReactNode;
};

function DropdownMenuIconItem({ icon, children, className, ...props }: DropdownMenuIconItemProps) {
  return (
    <DropdownMenuItem className={className} {...props}>
      <DropdownMenuItemContent icon={icon}>{children}</DropdownMenuItemContent>
    </DropdownMenuItem>
  );
}

type DropdownMenuCheckboxItemProps = DropdownMenuCheckboxItemPrimitiveProps;

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  disabled,
  onCheckedChange,
  onSelect,
  ...props
}: DropdownMenuCheckboxItemProps) {
  const nextChecked = checked === "indeterminate" ? true : !checked;

  return (
    <DropdownMenuCheckboxItemPrimitive
      disabled={disabled}
      className={cn(
        "focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-footnote outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-label-secondary",
        className,
      )}
      checked={checked}
      onSelect={(event) => {
        onSelect?.(event);
        if (!disabled) {
          onCheckedChange?.(nextChecked);
        }
      }}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuItemIndicatorPrimitive>
          <CheckIcon className="size-4" />
        </DropdownMenuItemIndicatorPrimitive>
      </span>
      {children}
    </DropdownMenuCheckboxItemPrimitive>
  );
}

type DropdownMenuRadioGroupProps = DropdownMenuRadioGroupPrimitiveProps;

function DropdownMenuRadioGroup(props: DropdownMenuRadioGroupProps) {
  return <DropdownMenuRadioGroupPrimitive {...props} />;
}

type DropdownMenuRadioItemProps = DropdownMenuRadioItemPrimitiveProps;

function DropdownMenuRadioItem({
  className,
  children,
  disabled,
  ...props
}: DropdownMenuRadioItemProps) {
  return (
    <DropdownMenuRadioItemPrimitive
      disabled={disabled}
      className={cn(
        "focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-footnote outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-label-secondary",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuItemIndicatorPrimitive>
          <CircleIcon className="size-2 fill-current" />
        </DropdownMenuItemIndicatorPrimitive>
      </span>
      {children}
    </DropdownMenuRadioItemPrimitive>
  );
}

type DropdownMenuLabelProps = DropdownMenuLabelPrimitiveProps & {
  inset?: boolean;
};

function DropdownMenuLabel({ className, inset, ...props }: DropdownMenuLabelProps) {
  return (
    <DropdownMenuLabelPrimitive
      data-inset={inset}
      className={cn("px-2 py-1.5 text-caption text-label-secondary data-[inset]:pl-8", className)}
      {...props}
    />
  );
}

type DropdownMenuSeparatorProps = DropdownMenuSeparatorPrimitiveProps;

function DropdownMenuSeparator({ className, ...props }: DropdownMenuSeparatorProps) {
  return (
    <DropdownMenuSeparatorPrimitive
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

type DropdownMenuShortcutProps = DropdownMenuShortcutPrimitiveProps;

function DropdownMenuShortcut({ className, ...props }: DropdownMenuShortcutProps) {
  return (
    <DropdownMenuShortcutPrimitive
      className={cn("text-label-secondary ml-auto text-footnote ", className)}
      {...props}
    />
  );
}

type DropdownMenuSubProps = DropdownMenuSubPrimitiveProps;

function DropdownMenuSub(props: DropdownMenuSubProps) {
  return <DropdownMenuSubPrimitive {...props} />;
}

type DropdownMenuSubTriggerProps = DropdownMenuSubTriggerPrimitiveProps & {
  inset?: boolean;
};

function DropdownMenuSubTrigger({
  disabled,
  className,
  inset,
  children,
  ...props
}: DropdownMenuSubTriggerProps) {
  return (
    <DropdownMenuSubTriggerPrimitive
      disabled={disabled}
      data-inset={inset}
      className={cn(
        "focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-footnote outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-label-secondary",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon data-slot="chevron" className="ml-auto size-4" />
    </DropdownMenuSubTriggerPrimitive>
  );
}

type DropdownMenuSubContentProps = DropdownMenuSubContentPrimitiveProps;

function DropdownMenuSubContent({ className, ...props }: DropdownMenuSubContentProps) {
  return (
    <DropdownMenuSubContentPrimitive
      className={cn(
        "bg-popover text-popover-foreground flex max-h-(--radix-dropdown-menu-content-available-height) min-w-32 origin-[--radix-dropdown-menu-content-transform-origin] flex-col items-stretch overflow-hidden rounded-md border p-1 outline-none duration-200 ease-out motion-reduce:animate-none! motion-reduce:transition-none! will-change-[opacity,transform] data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        DROPDOWN_MENU_LAYER_Z_INDEX_CLASSNAME,
        OVERLAY_LAYER_SHADOW_CLASSNAME,
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuItemContent,
  DropdownMenuIconItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  type DropdownMenuProps,
  type DropdownMenuTriggerProps,
  type DropdownMenuContentProps,
  type DropdownMenuGroupProps,
  type DropdownMenuItemProps,
  type DropdownMenuItemContentProps,
  type DropdownMenuIconItemProps,
  type DropdownMenuCheckboxItemProps,
  type DropdownMenuRadioGroupProps,
  type DropdownMenuRadioItemProps,
  type DropdownMenuLabelProps,
  type DropdownMenuSeparatorProps,
  type DropdownMenuShortcutProps,
  type DropdownMenuSubProps,
  type DropdownMenuSubTriggerProps,
  type DropdownMenuSubContentProps,
};
