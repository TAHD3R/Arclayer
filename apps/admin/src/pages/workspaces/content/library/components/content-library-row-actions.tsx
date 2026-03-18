import { Archive, Copy, MoreHorizontal, PenLine, Trash2 } from "lucide-react";
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
  onArchive: (row: ContentLibraryTableRow) => void;
  archivePending?: boolean;
}) {
  const { t } = useTranslation("content");
  const canArchive =
    Boolean(props.row.archiveVersionNumber) && props.row.derivedStatus !== "archived";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("CONTENT_LIBRARY_ROW_ACTIONS")}
          disabled={props.archivePending}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuIconItem icon={<PenLine className="size-4" />} disabled>
          {t("CONTENT_LIBRARY_ACTION_EDIT")}
        </DropdownMenuIconItem>
        <DropdownMenuIconItem icon={<Copy className="size-4" />} disabled>
          {t("CONTENT_LIBRARY_ACTION_DUPLICATE")}
        </DropdownMenuIconItem>
        <DropdownMenuIconItem icon={<Trash2 className="size-4" />} disabled>
          {t("CONTENT_LIBRARY_ACTION_DELETE")}
        </DropdownMenuIconItem>
        <DropdownMenuSeparator />
        <DropdownMenuIconItem
          icon={<Archive className="size-4" />}
          disabled={!canArchive || props.archivePending}
          onSelect={() => props.onArchive(props.row)}
        >
          {t("CONTENT_LIBRARY_ACTION_ARCHIVE")}
        </DropdownMenuIconItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
