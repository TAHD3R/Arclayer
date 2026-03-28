import * as React from "react";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuItemContent,
  DropdownMenuIconItem,
} from "@arclayer/ui/dropdown-menu";

export function DropdownMenuPortal(props: { children: React.ReactNode }) {
  return <>{props.children}</>;
}
