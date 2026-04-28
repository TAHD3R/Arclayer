import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";

import { UserAvatar } from "@/components/common/entity-avatar";
import type { ContentModelsTableRow } from "../types";
import { getContentModelFieldCount } from "../utils";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

function EmptyValue(props: { children: React.ReactNode }) {
  return <span className="text-label-secondary">{props.children}</span>;
}

function ContentModelNameCell(props: { model: ContentModelsTableRow; emptyValue: string }) {
  const description = props.model.description?.trim();

  return (
    <div className="min-w-0">
      <div className="truncate text-headline text-label-primary">{props.model.name}</div>
      <div className="mt-1 truncate text-footnote text-label-secondary">
        {description || props.emptyValue}
      </div>
    </div>
  );
}

function resolveUserName(user: ContentModelsTableRow["updatedBy"]): string {
  if (!user) return "";
  return (user.displayName || user.username || user.email || user.userId || "").trim();
}

function UpdatedByCell(props: { model: ContentModelsTableRow; emptyValue: string }) {
  const name = resolveUserName(props.model.updatedBy);
  if (!props.model.updatedBy || !name) return <EmptyValue>{props.emptyValue}</EmptyValue>;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <UserAvatar
        name={name}
        assetRef={props.model.updatedBy.avatarUrl}
        size={24}
        className="shrink-0"
      />
      <span className="truncate text-label-primary">{name}</span>
    </div>
  );
}

export function buildContentModelsTableColumns(params: {
  t: TranslateFn;
  formatDateTime: (value: string | null | undefined) => string;
}): ColumnDef<ContentModelsTableRow, unknown>[] {
  const emptyValue = params.t("content:CONTENT_MODELS_TABLE_EMPTY_VALUE");

  return [
    {
      accessorKey: "name",
      meta: {
        title: params.t("content:CONTENT_MODELS_TABLE_COL_NAME"),
        sortKey: "name",
        kind: "primary",
        pin: "left",
      },
      header: params.t("content:CONTENT_MODELS_TABLE_COL_NAME"),
      cell: ({ row }) => <ContentModelNameCell model={row.original} emptyValue={emptyValue} />,
      size: 360,
      minSize: 280,
    },
    {
      id: "fieldCount",
      accessorFn: getContentModelFieldCount,
      meta: {
        title: params.t("content:CONTENT_MODELS_TABLE_COL_FIELDS"),
        sortKey: "field_count",
        kind: "meta",
      },
      header: params.t("content:CONTENT_MODELS_TABLE_COL_FIELDS"),
      cell: ({ row }) => {
        const count = getContentModelFieldCount(row.original);
        return params.t("content:CONTENT_MODELS_TABLE_FIELD_COUNT", { count });
      },
      size: 140,
      minSize: 120,
    },
    {
      accessorKey: "updatedBy",
      meta: {
        title: params.t("content:CONTENT_MODELS_TABLE_COL_UPDATED_BY"),
        sortKey: "updated_by_user_id",
        kind: "meta",
      },
      header: params.t("content:CONTENT_MODELS_TABLE_COL_UPDATED_BY"),
      cell: ({ row }) => <UpdatedByCell model={row.original} emptyValue={emptyValue} />,
      size: 220,
      minSize: 180,
    },
    {
      accessorKey: "updatedAt",
      meta: {
        title: params.t("content:CONTENT_MODELS_TABLE_COL_UPDATED_AT"),
        sortKey: "updated_at",
        kind: "time",
      },
      header: params.t("content:CONTENT_MODELS_TABLE_COL_UPDATED_AT"),
      cell: ({ row }) => {
        const formatted = params.formatDateTime(row.original.updatedAt);
        return formatted || <EmptyValue>{emptyValue}</EmptyValue>;
      },
      size: 190,
      minSize: 160,
    },
  ];
}
