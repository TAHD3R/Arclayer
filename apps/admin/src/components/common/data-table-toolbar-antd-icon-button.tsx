import * as React from "react";

import { cn } from "@celestial/lib/utils";
import { Button as ButtonPrimitive } from "@celestial/ui/button-primitive";
import { buttonVariants } from "@celestial/ui/button";
import type { DataTableIconButtonProps } from "@celestial/ui/data-table";

export const DataTableToolbarAntdIconButton = React.forwardRef<
  HTMLButtonElement,
  DataTableIconButtonProps
>(function DataTableToolbarAntdIconButton(props, ref) {
  return (
    <ButtonPrimitive
      ref={ref}
      type="button"
      aria-label={props.label}
      className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
      disabled={props.disabled}
      onClick={props.onClick}
      tapScale={1}
    >
      {props.children}
    </ButtonPrimitive>
  );
});
DataTableToolbarAntdIconButton.displayName = "DataTableToolbarAntdIconButton";
