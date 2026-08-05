import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Users } from "lucide-react";

import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { UserAvatar } from "@/components/common/entity-avatar";
import {
  BaseTag,
  ContentModelFieldKeyTag,
  ContentModelKindTag,
  lucideTagIcon,
} from "@/components/ui/tags";
import { Checkbox } from "@arclayer/ui/checkbox";

import { ContentModelsRowActions } from "./content-models-row-actions";
import type { ContentModelsTableRow } from "../types";
import { getContentModelFieldCount, getContentModelPurposeLabelKey } from "../utils";
import { readContentModelFieldRows } from "../fields";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

function EmptyValue(props: { children: React.ReactNode }) {
  return <span className="text-label-secondary">{props.children}</span>;
}

function ContentModelNameCell(props: { model: ContentModelsTableRow; emptyDescription: string }) {
  const description = props.model.description?.trim();

  return (
    <div className="min-w-0">
      <div className="truncate text-headline text-label-primary">{props.model.name}</div>
      <div className="mt-1 truncate text-footnote text-label-secondary">
        {description || props.emptyDescription}
      </div>
    </div>
  );
}

function ApiIdentifierCell(props: { value: string }) {
  return (
    <BaseTag textStyle="caption" className="max-w-full">
      <span className="truncate font-mono">{props.value}</span>
    </BaseTag>
  );
}

function AvailableFieldsCell(props: { model: ContentModelsTableRow; emptyValue: string }) {
  const fields = readContentModelFieldRows(props.model);
  if (fields.length === 0) return <EmptyValue>{props.emptyValue}</EmptyValue>;
  const visibleFields = fields.slice(0, 3);
  const remainingCount = fields.length - visibleFields.length;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {visibleFields.map((field) => (
        <ContentModelFieldKeyTag
          key={field.key}
          label={field.label}
          textStyle="caption"
          className="max-w-36"
        />
      ))}
      {remainingCount > 0 ? <BaseTag textStyle="caption">+{remainingCount}</BaseTag> : null}
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
  canManageModels?: boolean;
  pending?: boolean;
  onEdit: (row: ContentModelsTableRow) => void;
  onDuplicate: (row: ContentModelsTableRow) => void;
  onDelete: (row: ContentModelsTableRow) => void;
}): ColumnDef<ContentModelsTableRow, unknown>[] {
  const emptyValue = params.t("content:CONTENT_MODELS_TABLE_EMPTY_VALUE");
  const emptyDescription = params.t("content:CONTENT_MODELS_TABLE_DESCRIPTION_EMPTY");

  return [
    {
      id: "select",
      enableSorting: false,
      enableHiding: false,
      meta: {
        title: "",
        kind: "select",
        headerAlign: "center",
        pin: "left",
      },
      header: ({ table }) => (
        <div className="flex w-full items-center justify-center">
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            aria-label={params.t("common:SELECT_ALL")}
            onCheckedChange={(checked) => table.toggleAllPageRowsSelected(Boolean(checked))}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex w-full items-center justify-center">
          <Checkbox
            checked={row.getIsSelected()}
            aria-label={params.t("common:SELECT")}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
          />
        </div>
      ),
      size: 52,
      minSize: 52,
    },
    {
      accessorKey: "name",
      meta: {
        title: params.t("content:CONTENT_MODELS_TABLE_COL_NAME"),
        sortKey: "name",
        kind: "primary",
        pin: "left",
      },
      header: params.t("content:CONTENT_MODELS_TABLE_COL_NAME"),
      cell: ({ row }) => (
        <ContentModelNameCell model={row.original} emptyDescription={emptyDescription} />
      ),
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
        return (
          <BaseTag icon={lucideTagIcon(Users)} textStyle="caption" style={{ marginInlineEnd: 0 }}>
            {params.t("content:CONTENT_MODELS_TABLE_FIELD_COUNT", { count })}
          </BaseTag>
        );
      },
      size: 140,
      minSize: 120,
    },
    {
      id: "availableFields",
      accessorFn: (row) =>
        readContentModelFieldRows(row)
          .map((field) => field.label)
          .join(", "),
      meta: {
        title: params.t("content:CONTENT_MODELS_TABLE_COL_AVAILABLE_FIELDS"),
        kind: "meta",
        defaultHidden: true,
      },
      header: params.t("content:CONTENT_MODELS_TABLE_COL_AVAILABLE_FIELDS"),
      cell: ({ row }) => <AvailableFieldsCell model={row.original} emptyValue={emptyValue} />,
      size: 300,
      minSize: 220,
    },
    {
      accessorKey: "singularKey",
      meta: {
        title: params.t("content:CONTENT_MODELS_TABLE_COL_SINGULAR_KEY"),
        sortKey: "singular_key",
        kind: "meta",
        defaultHidden: true,
      },
      header: params.t("content:CONTENT_MODELS_TABLE_COL_SINGULAR_KEY"),
      cell: ({ row }) => <ApiIdentifierCell value={row.original.singularKey} />,
      size: 180,
      minSize: 150,
    },
    {
      accessorKey: "pluralKey",
      meta: {
        title: params.t("content:CONTENT_MODELS_TABLE_COL_PLURAL_KEY"),
        sortKey: "plural_key",
        kind: "meta",
        defaultHidden: true,
      },
      header: params.t("content:CONTENT_MODELS_TABLE_COL_PLURAL_KEY"),
      cell: ({ row }) => <ApiIdentifierCell value={row.original.pluralKey} />,
      size: 180,
      minSize: 150,
    },
    {
      accessorKey: "description",
      meta: {
        title: params.t("content:CONTENT_MODELS_TABLE_COL_DESCRIPTION"),
        kind: "meta",
        defaultHidden: true,
      },
      header: params.t("content:CONTENT_MODELS_TABLE_COL_DESCRIPTION"),
      cell: ({ row }) => {
        const description = row.original.description?.trim();
        return description ? (
          <span className="line-clamp-2 text-label-secondary">{description}</span>
        ) : (
          <EmptyValue>{emptyDescription}</EmptyValue>
        );
      },
      size: 300,
      minSize: 220,
    },
    {
      accessorKey: "modelKind",
      meta: {
        title: params.t("content:CONTENT_MODELS_TABLE_COL_MODEL_KIND"),
        kind: "meta",
      },
      header: params.t("content:CONTENT_MODELS_TABLE_COL_MODEL_KIND"),
      cell: ({ row }) => {
        const modelKind = row.original.modelKind ?? "collection_type";
        return (
          <ContentModelKindTag
            kind={modelKind}
            textStyle="caption"
            label={params.t(getContentModelPurposeLabelKey(row.original))}
          />
        );
      },
      size: 160,
      minSize: 140,
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
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      meta: buildDataTableActionsColumnMeta("right", "right"),
      header: "",
      cell: ({ row }) => (
        <DataTableActionsCell>
          <ContentModelsRowActions
            row={row.original}
            canManageModels={params.canManageModels}
            pending={params.pending}
            onEdit={params.onEdit}
            onDuplicate={params.onDuplicate}
            onDelete={params.onDelete}
          />
        </DataTableActionsCell>
      ),
      size: 84,
      minSize: 84,
    },
  ];
}
