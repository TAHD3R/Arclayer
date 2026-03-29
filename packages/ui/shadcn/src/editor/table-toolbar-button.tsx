"use client";

import * as React from "react";

import { TablePlugin, useTableMergeState } from "@platejs/table/react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CombineIcon,
  Grid3x3Icon,
  Table2Icon,
  Trash2Icon,
  UngroupIcon,
  XIcon,
} from "lucide-react";
import { KEYS } from "platejs";
import { useEditorPlugin, useEditorSelector } from "platejs/react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { ToolbarButton } from "./ui/toolbar";
import { cn } from "@arclayer/lib/utils";

export function TableToolbarButton() {
  const { t } = useTranslation("content");
  const tableSelected = useEditorSelector(
    (editor) => editor.api.some({ match: { type: KEYS.table } }),
    [],
  );
  const { editor, tf } = useEditorPlugin(TablePlugin);
  const { canMerge, canSplit } = useTableMergeState();
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_TABLE")} isDropdown>
          <Table2Icon />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="ignore-click-outside/toolbar min-w-[13rem]">
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <Grid3x3Icon className="size-4" />
              <span>{t("CONTENT_LIBRARY_EDITOR_TABLE_TABLE")}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[13rem]">
              <DropdownMenuItem
                onSelect={() => {
                  tf.insert.table({ colCount: 3, rowCount: 3 }, { select: true });
                  editor.tf.focus();
                }}
              >
                <Table2Icon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_INSERT")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableSelected}
                onSelect={() => {
                  tf.remove.table();
                  editor.tf.focus();
                }}
              >
                <Trash2Icon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_DELETE")}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              className={cn("gap-2", !tableSelected && "data-[disabled]:opacity-50")}
              disabled={!tableSelected}
            >
              <div className="size-4" />
              <span>{t("CONTENT_LIBRARY_EDITOR_TABLE_CELL")}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[13rem]">
              <DropdownMenuItem
                disabled={!canMerge}
                onSelect={() => {
                  tf.table.merge();
                  editor.tf.focus();
                }}
              >
                <CombineIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_MERGE_CELLS")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canSplit}
                onSelect={() => {
                  tf.table.split();
                  editor.tf.focus();
                }}
              >
                <UngroupIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_SPLIT_CELL")}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              className={cn("gap-2", !tableSelected && "data-[disabled]:opacity-50")}
              disabled={!tableSelected}
            >
              <div className="size-4" />
              <span>{t("CONTENT_LIBRARY_EDITOR_TABLE_ROW")}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[13rem]">
              <DropdownMenuItem
                onSelect={() => {
                  tf.insert.tableRow({ before: true });
                  editor.tf.focus();
                }}
              >
                <ArrowUpIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_INSERT_ROW_BEFORE")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  tf.insert.tableRow();
                  editor.tf.focus();
                }}
              >
                <ArrowDownIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_INSERT_ROW_AFTER")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  tf.remove.tableRow();
                  editor.tf.focus();
                }}
              >
                <XIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_DELETE_ROW")}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              className={cn("gap-2", !tableSelected && "data-[disabled]:opacity-50")}
              disabled={!tableSelected}
            >
              <div className="size-4" />
              <span>{t("CONTENT_LIBRARY_EDITOR_TABLE_COLUMN")}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[13rem]">
              <DropdownMenuItem
                onSelect={() => {
                  tf.insert.tableColumn({ before: true });
                  editor.tf.focus();
                }}
              >
                <ArrowLeftIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_INSERT_COLUMN_BEFORE")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  tf.insert.tableColumn();
                  editor.tf.focus();
                }}
              >
                <ArrowRightIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_INSERT_COLUMN_AFTER")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  tf.remove.tableColumn();
                  editor.tf.focus();
                }}
              >
                <XIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_DELETE_COLUMN")}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
