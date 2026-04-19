"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";

import { cn } from "@arclayer/lib/utils";

const DIALOG_OVERLAY_ROOT_SELECTOR = "[data-overlay-root=dialog]";
const ROOT_OVERLAY_SELECTORS = [
  "[data-slot=dialog-content]",
  "[data-slot=sheet-content]",
  "[data-slot=alert-dialog-content]",
].join(", ");

type SelectPortalContextValue = {
  portalContainer?: HTMLElement;
  setTriggerElement: (element: HTMLElement | null) => void;
};

const SelectPortalContext = React.createContext<SelectPortalContextValue | null>(null);

function resolveSelectPortalContainer(
  triggerElement?: HTMLElement | null,
): HTMLElement | undefined {
  if (typeof document === "undefined") return undefined;
  if (!triggerElement) return document.body;

  const dialogOverlayRoot = triggerElement.closest(DIALOG_OVERLAY_ROOT_SELECTOR);
  if (dialogOverlayRoot instanceof HTMLElement) return dialogOverlayRoot;

  const overlayRoot = triggerElement.closest(ROOT_OVERLAY_SELECTORS);
  if (overlayRoot instanceof HTMLElement) return overlayRoot;

  return document.body;
}

function Select({ ...props }: React.ComponentProps<typeof SelectPrimitive.Root>) {
  const [portalContainer, setPortalContainerState] = React.useState<HTMLElement | undefined>(() =>
    typeof document === "undefined" ? undefined : document.body,
  );
  const setTriggerElement = React.useCallback((element: HTMLElement | null) => {
    if (!(element instanceof HTMLElement)) return;

    const nextPortalContainer = resolveSelectPortalContainer(element);
    setPortalContainerState((current) =>
      current === nextPortalContainer ? current : nextPortalContainer,
    );
  }, []);
  const portalContextValue = React.useMemo(
    () => ({ portalContainer, setTriggerElement }),
    [portalContainer, setTriggerElement],
  );

  return (
    <SelectPortalContext.Provider value={portalContextValue}>
      <SelectPrimitive.Root data-slot="select" {...props} />
    </SelectPortalContext.Provider>
  );
}

function SelectGroup({ ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({ ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default";
}) {
  const portalContext = React.useContext(SelectPortalContext);
  const handleTriggerRef = React.useCallback(
    (element: HTMLButtonElement | null) => {
      portalContext?.setTriggerElement(element);
    },
    [portalContext],
  );

  return (
    <SelectPrimitive.Trigger
      ref={handleTriggerRef}
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-footnote whitespace-nowrap  transition-[color,background-color,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-label-secondary data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-label-secondary",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const portalContext = React.useContext(SelectPortalContext);

  return (
    <SelectPrimitive.Portal container={portalContext?.portalContainer}>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "relative z-[2400] max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-hidden rounded-md border bg-popover text-popover-foreground  duration-200 ease-out motion-reduce:transition-none will-change-[opacity,transform] data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-2",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-caption text-label-secondary", className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-footnote outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-label-secondary *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
