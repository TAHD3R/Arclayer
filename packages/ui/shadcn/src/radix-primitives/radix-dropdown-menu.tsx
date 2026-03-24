"use client";

import * as React from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

type DropdownMenuProps = React.ComponentProps<typeof DropdownMenuPrimitive.Root>;

function DropdownMenu(props: DropdownMenuProps) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

type DropdownMenuTriggerProps = React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>;

function DropdownMenuTrigger(props: DropdownMenuTriggerProps) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

type DropdownMenuPortalProps = React.ComponentProps<typeof DropdownMenuPrimitive.Portal>;

function DropdownMenuPortal(props: DropdownMenuPortalProps) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

type DropdownMenuGroupProps = React.ComponentProps<typeof DropdownMenuPrimitive.Group>;

function DropdownMenuGroup(props: DropdownMenuGroupProps) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

type DropdownMenuSubProps = React.ComponentProps<typeof DropdownMenuPrimitive.Sub>;

function DropdownMenuSub(props: DropdownMenuSubProps) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

type DropdownMenuRadioGroupProps = React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>;

function DropdownMenuRadioGroup(props: DropdownMenuRadioGroupProps) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

type DropdownMenuSubTriggerProps = React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>;

function DropdownMenuSubTrigger(props: DropdownMenuSubTriggerProps) {
  return <DropdownMenuPrimitive.SubTrigger data-slot="dropdown-menu-sub-trigger" {...props} />;
}

type DropdownMenuSubContentProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>,
  "forceMount"
> &
  Omit<React.ComponentProps<typeof DropdownMenuPrimitive.Portal>, "forceMount">;

function DropdownMenuSubContent({ container, ...props }: DropdownMenuSubContentProps) {
  return (
    <DropdownMenuPortal container={container}>
      <DropdownMenuPrimitive.SubContent data-slot="dropdown-menu-sub-content" {...props} />
    </DropdownMenuPortal>
  );
}

type DropdownMenuContentProps = React.ComponentProps<typeof DropdownMenuPrimitive.Content> &
  Omit<React.ComponentProps<typeof DropdownMenuPrimitive.Portal>, "forceMount">;

function DropdownMenuContent({ container, ...props }: DropdownMenuContentProps) {
  return (
    <DropdownMenuPortal container={container}>
      <DropdownMenuPrimitive.Content data-slot="dropdown-menu-content" {...props} />
    </DropdownMenuPortal>
  );
}

type DropdownMenuItemProps = React.ComponentProps<typeof DropdownMenuPrimitive.Item>;

function DropdownMenuItem(props: DropdownMenuItemProps) {
  return <DropdownMenuPrimitive.Item data-slot="dropdown-menu-item" {...props} />;
}

type DropdownMenuCheckboxItemProps = React.ComponentProps<
  typeof DropdownMenuPrimitive.CheckboxItem
>;

function DropdownMenuCheckboxItem(props: DropdownMenuCheckboxItemProps) {
  return <DropdownMenuPrimitive.CheckboxItem data-slot="dropdown-menu-checkbox-item" {...props} />;
}

type DropdownMenuRadioItemProps = React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>;

function DropdownMenuRadioItem(props: DropdownMenuRadioItemProps) {
  return <DropdownMenuPrimitive.RadioItem data-slot="dropdown-menu-radio-item" {...props} />;
}

type DropdownMenuLabelProps = React.ComponentProps<typeof DropdownMenuPrimitive.Label>;

function DropdownMenuLabel(props: DropdownMenuLabelProps) {
  return <DropdownMenuPrimitive.Label data-slot="dropdown-menu-label" {...props} />;
}

type DropdownMenuSeparatorProps = React.ComponentProps<typeof DropdownMenuPrimitive.Separator>;

function DropdownMenuSeparator(props: DropdownMenuSeparatorProps) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" {...props} />;
}

type DropdownMenuShortcutProps = React.ComponentProps<"span">;

function DropdownMenuShortcut(props: DropdownMenuShortcutProps) {
  return <span data-slot="dropdown-menu-shortcut" {...props} />;
}

type DropdownMenuItemIndicatorProps = React.ComponentProps<
  typeof DropdownMenuPrimitive.ItemIndicator
>;

function DropdownMenuItemIndicator(props: DropdownMenuItemIndicatorProps) {
  return (
    <DropdownMenuPrimitive.ItemIndicator data-slot="dropdown-menu-item-indicator" {...props} />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
  type DropdownMenuProps,
  type DropdownMenuTriggerProps,
  type DropdownMenuContentProps,
  type DropdownMenuItemProps,
  type DropdownMenuItemIndicatorProps,
  type DropdownMenuCheckboxItemProps,
  type DropdownMenuRadioItemProps,
  type DropdownMenuLabelProps,
  type DropdownMenuSeparatorProps,
  type DropdownMenuShortcutProps,
  type DropdownMenuGroupProps,
  type DropdownMenuPortalProps,
  type DropdownMenuSubProps,
  type DropdownMenuSubContentProps,
  type DropdownMenuSubTriggerProps,
  type DropdownMenuRadioGroupProps,
};
