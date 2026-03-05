import { Button } from "antd";
import * as React from "react";

import type { DataTableIconButtonProps } from "@celestial/ui/data-table";

export const DataTableToolbarAntdIconButton = React.forwardRef<
  HTMLButtonElement,
  DataTableIconButtonProps
>(function DataTableToolbarAntdIconButton(props, ref) {
  return (
    <Button
      ref={ref}
      type="text"
      size="small"
      autoInsertSpace={false}
      icon={props.children}
      disabled={props.disabled}
      onClick={props.onClick}
      aria-label={props.label}
    />
  );
});
DataTableToolbarAntdIconButton.displayName = "DataTableToolbarAntdIconButton";
