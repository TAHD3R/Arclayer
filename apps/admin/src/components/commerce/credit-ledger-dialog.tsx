import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  listWorkspaceCreditLedger,
  type CreditLedgerEntry,
  type CreditLedgerEntryType,
} from "@/api/commerce";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Button } from "@arclayer/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

const LEDGER_PAGE_SIZE = 20;

const ENTRY_LABEL_KEYS: Record<CreditLedgerEntryType, string> = {
  period_grant: "LEDGER_TYPE_PERIOD_GRANT",
  reservation: "LEDGER_TYPE_RESERVATION",
  commit: "LEDGER_TYPE_COMMIT",
  release: "LEDGER_TYPE_RELEASE",
  adjustment: "LEDGER_TYPE_ADJUSTMENT",
  expiration: "LEDGER_TYPE_EXPIRATION",
};

const REFERENCE_LABEL_KEYS: Readonly<Record<string, string>> = {
  ai_request: "LEDGER_REFERENCE_AI_REQUEST",
  operator_adjustment: "LEDGER_REFERENCE_OPERATOR_ACTION",
  operator_change: "LEDGER_REFERENCE_OPERATOR_ACTION",
  period_refresh: "LEDGER_REFERENCE_PERIOD_REFRESH",
  subscription: "LEDGER_REFERENCE_SUBSCRIPTION",
  subscription_change_request: "LEDGER_REFERENCE_PLAN_APPROVAL",
  subscription_period: "LEDGER_REFERENCE_PERIOD_REFRESH",
};

type CreditLedgerDialogProps = {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function signedCredits(value: number, formatter: Intl.NumberFormat): string {
  if (value === 0) return "—";
  return `${value > 0 ? "+" : "−"}${formatter.format(Math.abs(value))}`;
}

function LedgerChange(props: { entry: CreditLedgerEntry; formatter: Intl.NumberFormat }) {
  const { t } = useTranslation("commerce");
  return (
    <dl className="flex min-w-36 flex-col gap-1 text-caption">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-label-secondary">{t("LEDGER_BALANCE_CHANGE")}</dt>
        <dd className="font-semibold text-label-primary">
          {signedCredits(props.entry.deltaBalanceCredits, props.formatter)}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-3">
        <dt className="text-label-secondary">{t("LEDGER_RESERVED_CHANGE")}</dt>
        <dd className="font-semibold text-label-primary">
          {signedCredits(props.entry.deltaReservedCredits, props.formatter)}
        </dd>
      </div>
    </dl>
  );
}

export function CreditLedgerDialog({ workspaceId, open, onOpenChange }: CreditLedgerDialogProps) {
  const { t, i18n } = useTranslation(["commerce", "common"]);
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (open) setPage(1);
  }, [open, workspaceId]);

  const ledgerQuery = useQuery({
    queryKey: ["commerce", "workspace", workspaceId, "credits", "ledger", page],
    queryFn: ({ signal }) =>
      listWorkspaceCreditLedger(workspaceId, { page, size: LEDGER_PAGE_SIZE }, signal),
    enabled: open,
    retry: false,
  });
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    [locale],
  );
  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const items = ledgerQuery.data?.items ?? [];
  const pages = ledgerQuery.data?.pages ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-6xl"
        closeButtonLabel={t("common:CLOSE")}
      >
        <DialogHeader>
          <DialogTitle>{t("LEDGER_DIALOG_TITLE")}</DialogTitle>
          <DialogDescription>{t("LEDGER_DIALOG_DESCRIPTION")}</DialogDescription>
        </DialogHeader>

        <ContentGuard
          loading={ledgerQuery.isLoading}
          error={ledgerQuery.error}
          empty={!ledgerQuery.isLoading && !ledgerQuery.error && items.length === 0}
          onRetry={() => void ledgerQuery.refetch()}
          loadingVariant="table"
          variant="compact"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("LEDGER_COLUMN_EVENT")}</TableHead>
                <TableHead>{t("LEDGER_COLUMN_CHANGE")}</TableHead>
                <TableHead>{t("LEDGER_COLUMN_BALANCE")}</TableHead>
                <TableHead>{t("LEDGER_COLUMN_REFERENCE")}</TableHead>
                <TableHead>{t("LEDGER_COLUMN_TIME")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="min-w-56 py-3">
                    <div className="font-semibold text-label-primary">
                      {t(ENTRY_LABEL_KEYS[entry.entryType])}
                    </div>
                    <div className="mt-1 text-caption text-label-secondary">
                      {entry.description}
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <LedgerChange entry={entry} formatter={number} />
                  </TableCell>
                  <TableCell className="min-w-36 py-3">
                    <div className="font-semibold text-label-primary">
                      {number.format(entry.balanceAfterCredits - entry.reservedAfterCredits)}
                    </div>
                    <div className="mt-1 text-caption text-label-secondary">
                      {t("LEDGER_BALANCE_BREAKDOWN", {
                        balance: number.format(entry.balanceAfterCredits),
                        reserved: number.format(entry.reservedAfterCredits),
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-52 py-3">
                    <div className="text-caption text-label-secondary">
                      {t(
                        REFERENCE_LABEL_KEYS[entry.referenceType] ??
                          "LEDGER_REFERENCE_UNRECOGNIZED",
                      )}
                    </div>
                    <code className="mt-1 block break-all text-caption text-label-primary">
                      {entry.referenceId ?? "—"}
                    </code>
                  </TableCell>
                  <TableCell className="min-w-40 py-3 text-caption text-label-secondary">
                    {dateTime.format(new Date(entry.createdAt))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ContentGuard>

        {pages > 1 ? (
          <DialogFooter className="items-center sm:justify-between">
            <span className="text-caption text-label-secondary">
              {t("LEDGER_PAGE", { page, pages })}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || ledgerQuery.isFetching}
                onClick={() => setPage((current) => current - 1)}
              >
                <ChevronLeft data-icon="inline-start" />
                {t("LEDGER_PREVIOUS")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pages || ledgerQuery.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                {t("LEDGER_NEXT")}
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
