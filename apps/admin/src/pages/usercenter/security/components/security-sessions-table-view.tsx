import { Monitor, Smartphone, Tablet } from "lucide-react";

import { cn } from "@arclayer/lib/utils";
import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { Button } from "@arclayer/ui/button";

export type SessionRow = {
  sessionId: string;
  current: boolean;
  revocable: boolean;
  device: string;
  location: string;
  lastActiveLabel: string;
};

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

function resolveDeviceGlyph(device: string) {
  const normalized = device.toLowerCase();
  if (
    normalized.includes("iphone") ||
    normalized.includes("android") ||
    normalized.includes("mobile")
  ) {
    return Smartphone;
  }
  if (normalized.includes("ipad") || normalized.includes("tablet")) {
    return Tablet;
  }
  return Monitor;
}

function SessionDeviceCell(props: { row: SessionRow; t: TranslateFn }) {
  const DeviceGlyph = resolveDeviceGlyph(props.row.device);

  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center">
        <DeviceGlyph className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-body text-label-primary">{props.row.device}</div>
        {props.row.current ? (
          <div className="mt-1 text-footnote font-medium text-primary">
            {props.t("account:ME_SECURITY_SESSIONS_CURRENT")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SessionActionCell(props: {
  row: SessionRow;
  isRevoking: boolean;
  revokingSessionId: string | null;
  onRevoke: (session: SessionRow) => void;
  t: TranslateFn;
}) {
  if (!props.row.revocable) {
    return (
      <DataTableActionsCell>
        <Button variant="outline" size="sm" disabled>
          {props.t("account:ME_SECURITY_SESSIONS_KICK")}
        </Button>
      </DataTableActionsCell>
    );
  }

  return (
    <DataTableActionsCell>
      <Button
        variant="outline"
        size="sm"
        loading={props.isRevoking && props.revokingSessionId === props.row.sessionId}
        onClick={() => props.onRevoke(props.row)}
      >
        {props.t("account:ME_SECURITY_SESSIONS_KICK")}
      </Button>
    </DataTableActionsCell>
  );
}

type SecuritySessionsTableContentProps = {
  rows: SessionRow[];
  emptyText: string;
  isRevoking: boolean;
  revokingSessionId: string | null;
  onRevoke: (session: SessionRow) => void;
  t: TranslateFn;
};

export function SecuritySessionsTableContent(props: SecuritySessionsTableContentProps) {
  const actionsColumnMeta = buildDataTableActionsColumnMeta("right");

  if (!props.rows.length) {
    return <div className="py-4 text-callout text-label-secondary">{props.emptyText}</div>;
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="min-w-[42rem] w-full table-fixed border-collapse">
        <thead>
          <tr className="border-b border-border/60">
            <th className="w-[42%] py-2 pr-4 text-left text-footnote font-medium text-label-secondary">
              {props.t("account:ME_SECURITY_SESSIONS_COL_DEVICE")}
            </th>
            <th className="w-[22%] px-4 py-2 text-left text-footnote font-medium text-label-secondary">
              {props.t("account:ME_SECURITY_SESSIONS_COL_LAST_ACTIVE")}
            </th>
            <th className="w-[20%] px-4 py-2 text-left text-footnote font-medium text-label-secondary">
              {props.t("account:ME_SECURITY_SESSIONS_COL_LOCATION")}
            </th>
            <th
              className={cn(
                "w-[16%] py-2 pl-4 text-footnote font-medium text-label-secondary",
                actionsColumnMeta.headerAlign === "center" ? "text-center" : "text-right",
              )}
            >
              {props.t("account:ME_SECURITY_SESSIONS_COL_ACTIONS")}
            </th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.sessionId} className="border-b border-border/50 last:border-b-0">
              <td className="py-4 pr-4 align-top">
                <SessionDeviceCell row={row} t={props.t} />
              </td>
              <td className="px-4 py-4 align-top text-callout text-label-primary">
                <span
                  className={cn("block text-pretty", !row.lastActiveLabel && "text-label-tertiary")}
                >
                  {row.lastActiveLabel}
                </span>
              </td>
              <td className="px-4 py-4 align-top text-callout text-label-primary">
                {row.location}
              </td>
              <td className="py-4 pl-4 align-top text-right">
                <SessionActionCell
                  row={row}
                  isRevoking={props.isRevoking}
                  revokingSessionId={props.revokingSessionId}
                  onRevoke={props.onRevoke}
                  t={props.t}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
