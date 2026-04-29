import * as React from "react";
import { Copy, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

import type { ContentModelsTableRow } from "../types";

type ContentModelsRowActionsProps = {
  row: ContentModelsTableRow;
  canManageModels?: boolean;
  pending?: boolean;
  triggerVariant?: "ghost" | "outline";
  onEdit?: (row: ContentModelsTableRow) => void;
  onCopyId?: (row: ContentModelsTableRow) => void;
  onDuplicate?: (row: ContentModelsTableRow) => void;
  onDelete?: (row: ContentModelsTableRow) => void;
};

export function ContentModelsRowActions(props: ContentModelsRowActionsProps) {
  const { t } = useTranslation(["content", "common"]);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const canManageModels = props.canManageModels !== false;

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={props.triggerVariant ?? "ghost"}
          size="icon-sm"
          aria-label={t("common:MORE")}
          disabled={props.pending}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        {props.onEdit ? (
          <DropdownMenuIconItem
            icon={<Pencil className="size-4" />}
            disabled={props.pending || !canManageModels}
            onSelect={() => props.onEdit?.(props.row)}
          >
            {t("content:CONTENT_MODELS_ACTION_EDIT")}
          </DropdownMenuIconItem>
        ) : null}
        {props.onCopyId ? (
          <DropdownMenuIconItem
            icon={<Copy className="size-4" />}
            disabled={props.pending}
            onSelect={() => props.onCopyId?.(props.row)}
          >
            {t("content:CONTENT_MODELS_COPY_ID_ACTION")}
          </DropdownMenuIconItem>
        ) : null}
        {props.onDuplicate ? (
          <DropdownMenuIconItem
            icon={<Copy className="size-4" />}
            disabled={props.pending || !canManageModels}
            onSelect={() => props.onDuplicate?.(props.row)}
          >
            {t("common:DUPLICATE")}
          </DropdownMenuIconItem>
        ) : null}
        {props.onDelete && (props.onEdit || props.onCopyId || props.onDuplicate) ? (
          <DropdownMenuSeparator />
        ) : null}
        {props.onDelete ? (
          <DropdownMenuIconItem
            icon={<Trash2 className="size-4" />}
            disabled={props.pending || !canManageModels}
            variant="destructive"
            onSelect={() => props.onDelete?.(props.row)}
          >
            {t("common:DELETE")}
          </DropdownMenuIconItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
