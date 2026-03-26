import * as React from "react";
import {
  Archive,
  ArchiveRestore,
  Copy,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";

import type { ContentLibraryTableRow } from "../types";

export function ContentLibraryRowActions(props: {
  row: ContentLibraryTableRow;
  onOpen: (row: ContentLibraryTableRow) => void;
  onDuplicate: (row: ContentLibraryTableRow) => void;
  onDelete: (row: ContentLibraryTableRow) => void;
  onArchive: (row: ContentLibraryTableRow) => void;
  onUnarchive: (row: ContentLibraryTableRow) => void;
  pending?: boolean;
  persistVisible?: boolean;
  previewOpen?: boolean;
  className?: string;
}) {
  const { t } = useTranslation(["content", "common"]);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const openLabel = props.previewOpen ? t("common:CLOSE") : t("CONTENT_LIBRARY_ACTION_OPEN");
  const openTooltip = props.previewOpen
    ? t("CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW")
    : t("CONTENT_LIBRARY_ACTION_OPEN_IN_SIDEBAR_PREVIEW");
  const archiveAction =
    props.row.derivedStatus === "archived"
      ? {
          icon: <ArchiveRestore className="size-4" />,
          label: t("CONTENT_LIBRARY_ACTION_UNARCHIVE"),
          onSelect: () => props.onUnarchive(props.row),
        }
      : {
          icon: <Archive className="size-4" />,
          label: t("CONTENT_LIBRARY_ACTION_ARCHIVE"),
          onSelect: () => props.onArchive(props.row),
        };

  return (
    <div
      data-testid="content-library-row-actions"
      data-visible={props.persistVisible || menuOpen ? "true" : "false"}
      className={cn("flex items-center justify-end gap-1", props.className)}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild focusTrigger={false}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={props.pending}
              onClick={(event) => {
                event.stopPropagation();
                props.onOpen(props.row);
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
            >
              {props.previewOpen ? (
                <PanelRightClose className="size-4" />
              ) : (
                <PanelRightOpen className="size-4" />
              )}
              {openLabel}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{openTooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("CONTENT_LIBRARY_ROW_ACTIONS")}
            disabled={props.pending}
            className="!rounded-lg data-[state=open]:bg-accent/70"
            onClick={(event) => {
              event.stopPropagation();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <DropdownMenuIconItem
            icon={<Copy className="size-4" />}
            disabled={props.pending}
            onSelect={() => props.onDuplicate(props.row)}
          >
            {t("CONTENT_LIBRARY_ACTION_DUPLICATE")}
          </DropdownMenuIconItem>
          <DropdownMenuIconItem
            icon={<Trash2 className="size-4" />}
            disabled={props.pending}
            onSelect={() => props.onDelete(props.row)}
          >
            {t("CONTENT_LIBRARY_ACTION_DELETE")}
          </DropdownMenuIconItem>
          <DropdownMenuSeparator />
          <DropdownMenuIconItem
            icon={archiveAction.icon}
            disabled={props.pending}
            onSelect={archiveAction.onSelect}
          >
            {archiveAction.label}
          </DropdownMenuIconItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
