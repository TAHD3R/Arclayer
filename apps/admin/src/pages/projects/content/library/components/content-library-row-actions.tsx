import * as React from "react";
import {
  ArrowUpRight,
  Archive,
  ArchiveRestore,
  Braces,
  Copy,
  Eye,
  Globe,
  Link2,
  Languages,
  MoreHorizontal,
  Settings2,
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
import { isContentLibraryReusableSectionRow } from "../utils";

export function ContentLibraryRowActions(props: {
  row: ContentLibraryTableRow;
  canManageContent?: boolean;
  onOpen: (row: ContentLibraryTableRow) => void;
  onOpenFullEditor?: (row: ContentLibraryTableRow) => void;
  onEditPermalink?: (row: ContentLibraryTableRow) => void;
  onEditSeo?: (row: ContentLibraryTableRow) => void;
  onEditVisibility?: (row: ContentLibraryTableRow) => void;
  onOpenPageSettings?: (row: ContentLibraryTableRow) => void;
  onOpenStructuredFields?: (row: ContentLibraryTableRow) => void;
  onCreateTranslation?: (row: ContentLibraryTableRow) => void;
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
  const canManageContent = props.canManageContent !== false;
  const openLabel = t("CONTENT_LIBRARY_ACTION_OPEN");
  const openTooltip = t("CONTENT_LIBRARY_ACTION_OPEN_ITEM");
  const isReusableSection = isContentLibraryReusableSectionRow(props.row);
  const showWritingActions = props.row.editWith === "writing" || props.row.role === "article";
  const showPageActions =
    !isReusableSection && (props.row.editWith === "canvas" || props.row.role === "page");
  const showReusableSectionActions = isReusableSection;
  const showStructuredActions = !isReusableSection && props.row.editWith === "structured";
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
              <ArrowUpRight className="size-4" />
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
          {showWritingActions && props.onOpenFullEditor ? (
            <>
              <DropdownMenuIconItem
                icon={<ArrowUpRight className="size-4" />}
                disabled={props.pending || !canManageContent}
                onSelect={() => props.onOpenFullEditor?.(props.row)}
              >
                {t("CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={<Link2 className="size-4" />}
                disabled={props.pending || !canManageContent}
                onSelect={() => props.onEditPermalink?.(props.row)}
              >
                {t("CONTENT_LIBRARY_ACTION_EDIT_PERMALINK")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={<Globe className="size-4" />}
                disabled={props.pending || !canManageContent}
                onSelect={() => props.onEditSeo?.(props.row)}
              >
                {t("CONTENT_LIBRARY_ACTION_EDIT_SEO")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={<Eye className="size-4" />}
                disabled={props.pending || !canManageContent}
                onSelect={() => props.onEditVisibility?.(props.row)}
              >
                {t("CONTENT_LIBRARY_ACTION_EDIT_VISIBILITY")}
              </DropdownMenuIconItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {showPageActions ? (
            <>
              <DropdownMenuIconItem
                icon={<Link2 className="size-4" />}
                disabled={props.pending || !canManageContent}
                onSelect={() => props.onEditPermalink?.(props.row)}
              >
                {t("CONTENT_LIBRARY_ACTION_EDIT_PERMALINK")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={<Globe className="size-4" />}
                disabled={props.pending || !canManageContent}
                onSelect={() => props.onEditSeo?.(props.row)}
              >
                {t("CONTENT_LIBRARY_ACTION_EDIT_SEO")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={<Eye className="size-4" />}
                disabled={props.pending || !canManageContent}
                onSelect={() => props.onEditVisibility?.(props.row)}
              >
                {t("CONTENT_LIBRARY_ACTION_EDIT_VISIBILITY")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={<Settings2 className="size-4" />}
                disabled={props.pending || !canManageContent}
                onSelect={() => props.onOpenPageSettings?.(props.row)}
              >
                {t("CONTENT_LIBRARY_ACTION_PAGE_SETTINGS")}
              </DropdownMenuIconItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {showReusableSectionActions ? (
            <>
              {props.onOpenFullEditor ? (
                <DropdownMenuIconItem
                  icon={<ArrowUpRight className="size-4" />}
                  disabled={props.pending || !canManageContent}
                  onSelect={() => props.onOpenFullEditor?.(props.row)}
                >
                  {t("CONTENT_LIBRARY_ACTION_OPEN_STRUCTURED_EDITOR")}
                </DropdownMenuIconItem>
              ) : null}
              <DropdownMenuIconItem
                icon={<Braces className="size-4" />}
                disabled={props.pending || !canManageContent}
                onSelect={() => props.onOpenStructuredFields?.(props.row)}
              >
                {t("CONTENT_LIBRARY_ACTION_EDIT_FIELDS")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={<Eye className="size-4" />}
                disabled={props.pending || !canManageContent}
                onSelect={() => props.onEditVisibility?.(props.row)}
              >
                {t("CONTENT_LIBRARY_ACTION_EDIT_VISIBILITY")}
              </DropdownMenuIconItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {showStructuredActions ? (
            <>
              {props.onOpenFullEditor ? (
                <DropdownMenuIconItem
                  icon={<ArrowUpRight className="size-4" />}
                  disabled={props.pending || !canManageContent}
                  onSelect={() => props.onOpenFullEditor?.(props.row)}
                >
                  {t("CONTENT_LIBRARY_ACTION_OPEN_STRUCTURED_EDITOR")}
                </DropdownMenuIconItem>
              ) : null}
              <DropdownMenuIconItem
                icon={<Braces className="size-4" />}
                disabled={props.pending || !canManageContent}
                onSelect={() => props.onOpenStructuredFields?.(props.row)}
              >
                {t("CONTENT_LIBRARY_ACTION_EDIT_FIELDS")}
              </DropdownMenuIconItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuIconItem
            icon={<Copy className="size-4" />}
            disabled={props.pending || !canManageContent}
            onSelect={() => props.onDuplicate(props.row)}
          >
            {t("CONTENT_LIBRARY_ACTION_DUPLICATE")}
          </DropdownMenuIconItem>
          <DropdownMenuIconItem
            icon={<Languages className="size-4" />}
            disabled={props.pending || !canManageContent}
            onSelect={() => props.onCreateTranslation?.(props.row)}
          >
            {t("CONTENT_LIBRARY_ACTION_CREATE_TRANSLATION")}
          </DropdownMenuIconItem>
          <DropdownMenuIconItem
            icon={<Trash2 className="size-4" />}
            disabled={props.pending || !canManageContent}
            onSelect={() => props.onDelete(props.row)}
          >
            {t("CONTENT_LIBRARY_ACTION_DELETE")}
          </DropdownMenuIconItem>
          <DropdownMenuSeparator />
          <DropdownMenuIconItem
            icon={archiveAction.icon}
            disabled={props.pending || !canManageContent}
            onSelect={archiveAction.onSelect}
          >
            {archiveAction.label}
          </DropdownMenuIconItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
