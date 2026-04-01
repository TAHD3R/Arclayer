"use client";

import * as React from "react";

import * as ToolbarPrimitive from "@radix-ui/react-toolbar";
import { type VariantProps, cva } from "class-variance-authority";
import { ChevronDown } from "lucide-react";

import { buttonVariants } from "@arclayer/ui/button";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
} from "@arclayer/ui/dropdown-menu";
import { Separator } from "@arclayer/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";

export function Toolbar({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Root>) {
  return (
    <ToolbarPrimitive.Root
      className={cn("relative flex select-none items-center", className)}
      {...props}
    />
  );
}

export function ToolbarToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.ToolbarToggleGroup>) {
  return (
    <ToolbarPrimitive.ToolbarToggleGroup
      className={cn("flex items-center", className)}
      {...props}
    />
  );
}

export function ToolbarLink({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Link>) {
  return (
    <ToolbarPrimitive.Link
      className={cn("font-medium underline underline-offset-4", className)}
      {...props}
    />
  );
}

export function ToolbarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Separator>) {
  return (
    <ToolbarPrimitive.Separator
      className={cn("mx-2 my-1 w-px shrink-0 bg-border", className)}
      {...props}
    />
  );
}

// From toggleVariants
const toolbarButtonVariants = cva(
  cn(
    buttonVariants({ size: "icon-sm", variant: "ghost" }),
    "cursor-pointer data-[state=on]:bg-accent data-[state=on]:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
  ),
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-9 min-w-9 px-3 has-[>svg]:px-2.5",
        lg: "h-10 min-w-10 px-4 has-[>svg]:px-3",
        sm: "h-8 min-w-8 px-2.5",
      },
      variant: {
        default: "bg-transparent",
        outline:
          "border bg-card hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
      },
    },
  },
);

const dropdownArrowVariants = cva(
  cn(
    "inline-flex items-center justify-center rounded-r-md font-semibold text-label-primary text-footnote transition-colors disabled:pointer-events-none disabled:opacity-50",
  ),
  {
    defaultVariants: {
      size: "sm",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-9 w-6",
        lg: "h-10 w-8",
        sm: "h-8 w-4",
      },
      variant: {
        default:
          "bg-transparent hover:bg-muted hover:text-label-secondary aria-checked:bg-accent aria-checked:text-accent-foreground",
        outline:
          "border border-input border-l-0 bg-transparent hover:bg-accent hover:text-accent-foreground",
      },
    },
  },
);

type ToolbarButtonProps = {
  isDropdown?: boolean;
  pressed?: boolean;
} & Omit<React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Button>, "asChild"> &
  VariantProps<typeof toolbarButtonVariants>;

type ToolbarTooltipProps = {
  tooltip?: React.ReactNode;
};

export function ToolbarTooltip(props: { children: React.ReactElement; tooltip?: React.ReactNode }) {
  if (!props.tooltip) return props.children;

  return (
    <Tooltip>
      <TooltipTrigger asChild focusTrigger={false}>
        {props.children}
      </TooltipTrigger>
      <TooltipContent>{props.tooltip}</TooltipContent>
    </Tooltip>
  );
}

export const ToolbarButton = React.forwardRef<
  HTMLButtonElement,
  ToolbarButtonProps & ToolbarTooltipProps
>(function ToolbarButton(
  { children, className, isDropdown, pressed, size = "sm", tooltip, variant, ...props },
  ref,
) {
  return (
    <ToolbarPrimitive.Button
      ref={ref}
      type="button"
      data-state={pressed ? "on" : undefined}
      aria-pressed={pressed}
      title={typeof tooltip === "string" ? tooltip : undefined}
      aria-label={typeof tooltip === "string" ? tooltip : props["aria-label"]}
      className={cn(
        toolbarButtonVariants({
          size,
          variant,
        }),
        isDropdown && "justify-start gap-1.5 pr-1.5",
        className,
      )}
      {...props}
    >
      {isDropdown ? (
        <>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">{children}</div>
          <div className="flex shrink-0 items-center">
            <ChevronDown className="size-3.5 text-label-secondary" data-icon />
          </div>
        </>
      ) : (
        children
      )}
    </ToolbarPrimitive.Button>
  );
});

export function ToolbarSplitButton({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ToolbarButton>) {
  return (
    <ToolbarButton
      className={cn("group flex gap-0 px-0 hover:bg-transparent", className)}
      {...props}
    />
  );
}

type ToolbarSplitButtonPrimaryProps = Omit<
  React.ComponentPropsWithoutRef<typeof ToolbarToggleItem>,
  "value"
> &
  VariantProps<typeof toolbarButtonVariants>;

export function ToolbarSplitButtonPrimary({
  children,
  className,
  size = "sm",
  variant,
  ...props
}: ToolbarSplitButtonPrimaryProps) {
  return (
    <span
      className={cn(
        toolbarButtonVariants({
          size,
          variant,
        }),
        "rounded-r-none",
        "group-data-[pressed=true]:bg-accent group-data-[pressed=true]:text-accent-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function ToolbarSplitButtonSecondary({
  className,
  size,
  variant,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & VariantProps<typeof dropdownArrowVariants>) {
  return (
    <span
      className={cn(
        dropdownArrowVariants({
          size,
          variant,
        }),
        "group-data-[pressed=true]:bg-accent group-data-[pressed=true]:text-accent-foreground",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      role="button"
      {...props}
    >
      <ChevronDown className="size-3.5 text-label-secondary" data-icon />
    </span>
  );
}

export const ToolbarToggleItem = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof ToolbarPrimitive.ToggleItem> &
    VariantProps<typeof toolbarButtonVariants>
>(function ToolbarToggleItem({ className, size = "sm", variant, ...props }, ref) {
  return (
    <ToolbarPrimitive.ToggleItem
      ref={ref}
      className={cn(toolbarButtonVariants({ size, variant }), className)}
      {...props}
    />
  );
});

export function ToolbarGroup({ children, className }: React.ComponentProps<"div">) {
  return (
    <div className={cn("group/toolbar-group", "relative hidden has-[button]:flex", className)}>
      <div className="flex items-center">{children}</div>

      <div className="group-last/toolbar-group:hidden! mx-1.5 py-0.5">
        <Separator orientation="vertical" />
      </div>
    </div>
  );
}

export function ToolbarMenuGroup({
  children,
  className,
  label,
  ...props
}: React.ComponentProps<typeof DropdownMenuRadioGroup> & { label?: string }) {
  return (
    <>
      <DropdownMenuSeparator
        className={cn(
          "hidden",
          "mb-0 shrink-0 peer-has-[button]/menu-group:block peer-has-[[role=menuitem]]/menu-group:block peer-has-[[role=menuitemradio]]/menu-group:block peer-has-[[role=option]]/menu-group:block",
        )}
      />

      <DropdownMenuRadioGroup
        {...props}
        className={cn(
          "hidden",
          "peer/menu-group group/menu-group my-1.5 has-[button]:block has-[[role=menuitem]]:block has-[[role=menuitemradio]]:block has-[[role=option]]:block",
          className,
        )}
      >
        {label && (
          <DropdownMenuLabel className="select-none font-semibold text-label-secondary text-caption">
            {label}
          </DropdownMenuLabel>
        )}
        {children}
      </DropdownMenuRadioGroup>
    </>
  );
}
