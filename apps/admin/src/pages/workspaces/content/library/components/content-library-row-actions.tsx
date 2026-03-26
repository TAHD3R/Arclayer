import { Archive, ArchiveRestore, Copy, MoreHorizontal, PenLine, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

import type { ContentLibraryTableRow } from "../types";

export function ContentLibraryRowActions(props: {
  row: ContentLibraryTableRow;
  onContinue: (row: ContentLibraryTableRow) => void;
  onDuplicate: (row: ContentLibraryTableRow) => void;
  onDelete: (row: ContentLibraryTableRow) => void;
  onArchive: (row: ContentLibraryTableRow) => void;
  onUnarchive: (row: ContentLibraryTableRow) => void;
  pending?: boolean;
}) {
  const { t } = useTranslation("content");
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
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={props.pending}
        onClick={() => props.onContinue(props.row)}
      >
        <PenLine className="size-4" />
        {t("CONTENT_LIBRARY_ACTION_CONTINUE")}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("CONTENT_LIBRARY_ROW_ACTIONS")}
            disabled={props.pending}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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
