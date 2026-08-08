import { Columns3, RefreshCw, Search } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PlatformToolbar } from "@/components/platform-page";

export type CommerceColumn = Readonly<{ id: string; label: string }>;

export function CommerceTableToolbar({
  searchValue,
  searchPlaceholder,
  onSearchChange,
  onRefresh,
  refreshing = false,
  filters,
  columns,
  visibleColumns,
  onVisibleColumnsChange,
  columnsLabel,
  refreshLabel,
}: Readonly<{
  searchValue: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  filters?: ReactNode;
  columns?: readonly CommerceColumn[];
  visibleColumns?: readonly string[];
  onVisibleColumnsChange?: (ids: readonly string[]) => void;
  columnsLabel: string;
  refreshLabel: string;
}>) {
  const toggleColumn = (id: string, checked: boolean) => {
    if (!onVisibleColumnsChange || !visibleColumns) return;
    const next = checked ? [...visibleColumns, id] : visibleColumns.filter((value) => value !== id);
    if (next.length > 0) onVisibleColumnsChange(next);
  };
  return (
    <PlatformToolbar>
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={searchPlaceholder}
          className="pl-9"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          value={searchValue}
        />
      </div>
      {filters}
      {columns && visibleColumns && onVisibleColumnsChange ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={columnsLabel} size="icon" variant="outline">
              <Columns3 aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{columnsLabel}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {columns.map((column) => (
              <DropdownMenuCheckboxItem
                checked={visibleColumns.includes(column.id)}
                key={column.id}
                onCheckedChange={(checked) => toggleColumn(column.id, checked === true)}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Button
        aria-label={refreshLabel}
        disabled={refreshing}
        onClick={onRefresh}
        size="icon"
        variant="outline"
      >
        <RefreshCw aria-hidden="true" className={refreshing ? "animate-spin" : undefined} />
      </Button>
    </PlatformToolbar>
  );
}
