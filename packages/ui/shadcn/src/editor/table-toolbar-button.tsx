"use client";

import * as React from "react";

import { TablePlugin } from "@platejs/table/react";
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
import { captureEditorSelection, runEditorTransformPreservingSelection } from "./transforms";
import { ToolbarButton, ToolbarTooltip } from "./ui/toolbar";
import { cn } from "@arclayer/lib/utils";

export function TableToolbarButton() {
  const { t } = useTranslation("content");
  const tableSelected = useEditorSelector(
    (editor) => editor.api.some({ match: { type: KEYS.table } }),
    [],
  );
  const selectionExpanded = useEditorSelector((editor) => editor.api.isExpanded(), []);
  const { editor, tf } = useEditorPlugin(TablePlugin);
  const [open, setOpen] = React.useState(false);
  const selectionRef = React.useRef(captureEditorSelection(editor));
  const canMerge = tableSelected && selectionExpanded;
  const canSplit = tableSelected && !selectionExpanded;

  const runTableAction = React.useCallback(
    (action: () => void) => {
      runEditorTransformPreservingSelection(
        editor,
        () => {
          action();
        },
        {
          focus: false,
          restoreSelection: false,
          selection: selectionRef.current,
        },
      );
    },
    [editor],
  );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          selectionRef.current = captureEditorSelection(editor);
        }
        setOpen(nextOpen);
      }}
      modal={false}
    >
      <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_TABLE")}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton
            pressed={open}
            tooltip={undefined}
            isDropdown
            onMouseDown={(event) => {
              event.preventDefault();
              selectionRef.current = captureEditorSelection(editor);
            }}
          >
            <Table2Icon />
          </ToolbarButton>
        </DropdownMenuTrigger>
      </ToolbarTooltip>

      <DropdownMenuContent
        align="start"
        className="ignore-click-outside/toolbar min-w-[13rem]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          runEditorTransformPreservingSelection(editor, () => undefined, {
            focus: false,
            restoreSelection: false,
            selection: selectionRef.current,
          });
        }}
      >
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <Grid3x3Icon className="size-4" />
              <span>{t("CONTENT_LIBRARY_EDITOR_TABLE_TABLE")}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[13rem]">
              <DropdownMenuItem
                onSelect={() => {
                  runTableAction(() =>
                    tf.insert.table({ colCount: 3, rowCount: 3 }, { select: true }),
                  );
                }}
              >
                <Table2Icon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_INSERT")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableSelected}
                onSelect={() => {
                  runTableAction(() => tf.remove.table());
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
                  runTableAction(() => tf.table.merge());
                }}
              >
                <CombineIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_MERGE_CELLS")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canSplit}
                onSelect={() => {
                  runTableAction(() => tf.table.split());
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
                  runTableAction(() => tf.insert.tableRow({ before: true }));
                }}
              >
                <ArrowUpIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_INSERT_ROW_BEFORE")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  runTableAction(() => tf.insert.tableRow());
                }}
              >
                <ArrowDownIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_INSERT_ROW_AFTER")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  runTableAction(() => tf.remove.tableRow());
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
                  runTableAction(() => tf.insert.tableColumn({ before: true }));
                }}
              >
                <ArrowLeftIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_INSERT_COLUMN_BEFORE")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  runTableAction(() => tf.insert.tableColumn());
                }}
              >
                <ArrowRightIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_TABLE_INSERT_COLUMN_AFTER")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  runTableAction(() => tf.remove.tableColumn());
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
