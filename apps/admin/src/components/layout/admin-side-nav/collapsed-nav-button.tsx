import type { AdminNavItem } from "@/types/admin-nav";
import { cn } from "@celestial/lib/utils";
import {
  Button as ButtonPrimitive,
  type ButtonProps as ButtonPrimitiveProps,
} from "@celestial/ui/button-primitive";

import { NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME, NAV_ITEM_HEIGHT_CLASSNAME } from "./nav-utils";
import {
  DISABLED_ITEM_CLASSNAME,
  INTERACTIVE_TRANSITION_CLASSNAME,
  NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
  NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
} from "./nav-node-styles";
import { iconSlot } from "./nav-icon-slot";

type CollapsedNavButtonProps = Omit<ButtonPrimitiveProps, "children" | "asChild"> & {
  label: string;
  Icon: AdminNavItem["icon"] | undefined;
  isActive: boolean;
  isDisabled: boolean;
};

export function CollapsedNavButton({
  label,
  Icon,
  isActive,
  isDisabled,
  className,
  ...props
}: CollapsedNavButtonProps) {
  return (
    <ButtonPrimitive
      type="button"
      data-active={isActive}
      aria-disabled={isDisabled ? "true" : undefined}
      hoverScale={1}
      tapScale={1}
      className={cn(
        "relative z-10 w-full",
        "flex items-center justify-center",
        NAV_ITEM_HEIGHT_CLASSNAME,
        "rounded-lg",
        NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME,
        INTERACTIVE_TRANSITION_CLASSNAME,
        NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
        NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
        isDisabled ? DISABLED_ITEM_CLASSNAME : "hover:cursor-pointer",
        className,
      )}
      {...props}
    >
      {iconSlot(0, Icon, { isActive })}
      <span className="sr-only">{label}</span>
    </ButtonPrimitive>
  );
}
