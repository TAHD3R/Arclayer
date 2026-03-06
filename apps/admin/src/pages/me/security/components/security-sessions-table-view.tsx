import { Button, Alert } from "antd";
import type { ColumnDef, Table as ReactTable } from "@tanstack/react-table";

import { SecurityCurrentSessionTag } from "@/components/ui/tags";
import {
  DataTablePresenter,
  type DataTableDensity,
  type DataTableToolsLabels,
} from "@celestial/ui/data-table";

import {
  SecuritySessionsSearchToolbar,
  SecuritySessionsToolsToolbar,
} from "./security-sessions-table-toolbar";

export type SessionRow = {
  sessionId: string;
  current: boolean;
  revocable: boolean;
  device: string;
  ip: string;
  location: string;
  authMethod: string;
  signedInAt: string;
  lastActiveAt: string;
};

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
type FormatDateTimeFn = (
  value: string | null | undefined,
  options?: { emptyValue?: string },
) => string;

type ColumnFactoryProps = {
  t: TranslateFn;
  formatDateTime: FormatDateTimeFn;
  isRevoking: boolean;
  revokingSessionId: string | null;
  onRevoke: (sessionId: string) => void;
};

function formatAuthMethod(value: string, t: TranslateFn): string {
  if (value === "password") return t("account:ME_SECURITY_SESSIONS_AUTH_METHOD_PASSWORD");
  if (value === "sso") return t("account:ME_SECURITY_SESSIONS_AUTH_METHOD_SSO");
  return value;
}

function renderDeviceCell(row: SessionRow, t: TranslateFn) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="min-w-0 truncate">{row.device}</span>
      {row.current ? (
        <SecurityCurrentSessionTag
          className="shrink-0"
          label={t("account:ME_SECURITY_SESSIONS_CURRENT")}
        />
      ) : null}
    </div>
  );
}

function renderDateCell(value: string, formatDateTime: FormatDateTimeFn) {
  return <span className="truncate">{formatDateTime(value || null, { emptyValue: "-" })}</span>;
}

function buildTextColumn(props: {
  key: "location" | "ip";
  title: string;
  sortKey: "location" | "ip";
  className?: string;
}): ColumnDef<SessionRow, unknown> {
  return {
    accessorKey: props.key,
    header: props.title,
    meta: { title: props.title, sortKey: props.sortKey, defaultHidden: true },
    cell: ({ row }) => <span className={props.className}>{row.original[props.key]}</span>,
    size: props.key === "location" ? 220 : 160,
  };
}

function buildDateColumn(props: {
  key: "signedInAt" | "lastActiveAt";
  title: string;
  formatDateTime: FormatDateTimeFn;
  defaultHidden?: boolean;
}): ColumnDef<SessionRow, unknown> {
  return {
    accessorKey: props.key,
    header: props.title,
    meta: { title: props.title, sortKey: props.key, defaultHidden: props.defaultHidden },
    cell: ({ row }) => renderDateCell(row.original[props.key], props.formatDateTime),
    size: 200,
  };
}

function buildActionColumn(props: ColumnFactoryProps): ColumnDef<SessionRow, unknown> {
  return {
    id: "action",
    header: props.t("account:ME_SECURITY_SESSIONS_COL_ACTIONS"),
    meta: { title: props.t("account:ME_SECURITY_SESSIONS_COL_ACTIONS"), kind: "actions" },
    cell: ({ row }) => (
      <Button
        disabled={!row.original.revocable}
        loading={props.isRevoking && props.revokingSessionId === row.original.sessionId}
        type="link"
        className="px-0!"
        onClick={() => props.onRevoke(row.original.sessionId)}
        autoInsertSpace={false}
      >
        {props.t("account:ME_SECURITY_SESSIONS_KICK")}
      </Button>
    ),
    size: 120,
  };
}

export function buildSessionColumns(props: ColumnFactoryProps): ColumnDef<SessionRow, unknown>[] {
  return [
    {
      accessorKey: "device",
      header: props.t("account:ME_SECURITY_SESSIONS_COL_DEVICE"),
      meta: { title: props.t("account:ME_SECURITY_SESSIONS_COL_DEVICE"), sortKey: "device" },
      cell: ({ row }) => renderDeviceCell(row.original, props.t),
      size: 240,
    },
    buildTextColumn({
      key: "location",
      title: props.t("account:ME_SECURITY_SESSIONS_COL_LOCATION"),
      sortKey: "location",
    }),
    buildTextColumn({
      key: "ip",
      title: props.t("account:ME_SECURITY_SESSIONS_COL_IP"),
      sortKey: "ip",
      className: "font-mono text-footnote",
    }),
    {
      accessorKey: "authMethod",
      header: props.t("account:ME_SECURITY_SESSIONS_COL_AUTH_METHOD"),
      meta: {
        title: props.t("account:ME_SECURITY_SESSIONS_COL_AUTH_METHOD"),
        sortKey: "authMethod",
      },
      cell: ({ row }) => <span>{formatAuthMethod(row.original.authMethod, props.t)}</span>,
      size: 160,
    },
    buildDateColumn({
      key: "signedInAt",
      title: props.t("account:ME_SECURITY_SESSIONS_COL_SIGNED_IN"),
      formatDateTime: props.formatDateTime,
      defaultHidden: true,
    }),
    buildDateColumn({
      key: "lastActiveAt",
      title: props.t("account:ME_SECURITY_SESSIONS_COL_LAST_ACTIVE"),
      formatDateTime: props.formatDateTime,
    }),
    buildActionColumn(props),
  ];
}

type SecuritySessionsTableContentProps = {
  table: ReactTable<SessionRow>;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onRefresh: () => Promise<unknown> | void;
  isFetching: boolean;
  isLoading: boolean;
  onResetColumnVisibility: () => void;
  density: DataTableDensity;
  onDensityChange: (next: DataTableDensity) => void;
  toolsLabels: DataTableToolsLabels;
  searchPlaceholder: string;
  emptyText: string;
  alertTitle: string;
  alertDescription: string;
};

export function SecuritySessionsTableContent(props: SecuritySessionsTableContentProps) {
  return (
    <div className="grid min-w-0 gap-4">
      <Alert
        type="info"
        showIcon
        className="min-w-0"
        title={props.alertTitle}
        description={
          <div className="min-w-0 break-words whitespace-normal">{props.alertDescription}</div>
        }
      />
      <DataTablePresenter
        table={props.table}
        emptyText={props.emptyText}
        className="min-h-0"
        toolbar={{
          left: (
            <SecuritySessionsSearchToolbar
              searchInput={props.searchInput}
              onSearchInputChange={props.onSearchInputChange}
              placeholder={props.searchPlaceholder}
            />
          ),
          right: (
            <SecuritySessionsToolsToolbar
              table={props.table}
              density={props.density}
              onDensityChange={props.onDensityChange}
              onRefresh={props.onRefresh}
              refreshing={props.isFetching}
              onResetColumnVisibility={props.onResetColumnVisibility}
              labels={props.toolsLabels}
            />
          ),
        }}
        density={props.density}
        refreshing={props.isFetching && !props.isLoading}
      />
    </div>
  );
}
