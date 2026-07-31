import { AlertTriangle, ChevronRight } from "lucide-react";
import { useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  OperationalSignalAssigneeOut,
  OperationalSignalOut,
  PageDataOperationalSignalOut,
} from "@arclayer/platform-openapi";

import { listOperationalSignalEligibleAssignees } from "@/operations/operations-api";
import { useOperationsQuery } from "@/operations/operations-state";
import { formatAge } from "@/operations/operations-ui";
import { Alert, AlertDescription } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

type SignalQueueProps = Readonly<{
  data: PageDataOperationalSignalOut;
  assigneeNames?: ReadonlyMap<string, string>;
  onOpen: (signalId: string) => void;
  onPageChange: (page: number) => void;
}>;

function openFromRow(
  event: MouseEvent<HTMLTableRowElement> | KeyboardEvent<HTMLTableRowElement>,
  signalId: string,
  onOpen: (signalId: string) => void,
) {
  if (event.target instanceof Element && event.target.closest("button, a, input, select")) return;
  if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
  if ("key" in event) event.preventDefault();
  onOpen(signalId);
}

function SignalRow({
  signal,
  assigneeNames,
  onOpen,
}: Readonly<{
  signal: OperationalSignalOut;
  assigneeNames?: ReadonlyMap<string, string>;
  onOpen: (signalId: string) => void;
}>) {
  const { t } = useTranslation(["inbox"]);
  const stateKey = `inbox:TRIAGE_${signal.triage.state.toUpperCase()}`;
  return (
    <TableRow
      aria-label={t(signal.copy.titleKey)}
      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) => openFromRow(event, signal.id, onOpen)}
      onKeyDown={(event) => openFromRow(event, signal.id, onOpen)}
      tabIndex={0}
    >
      <TableCell className="align-top">
        <div className="flex items-center gap-2">
          <Badge variant="destructive">{t("inbox:SEVERITY_HIGH")}</Badge>
          <span className="font-mono text-caption tabular-nums">#{signal.priority.rank}</span>
        </div>
        <p className="mt-1 text-caption text-label-secondary">
          {signal.priority.reasonKeys.map((key) => t(key)).join(" · ")}
        </p>
      </TableCell>
      <TableCell className="max-w-xl align-top">
        <p className="font-medium text-label-primary">{t(signal.copy.titleKey)}</p>
        <p className="mt-1 text-footnote text-label-secondary">{t(signal.copy.explanationKey)}</p>
      </TableCell>
      <TableCell className="align-top">
        <Badge variant={signal.sourceLifecycle === "resolved" ? "secondary" : "outline"}>
          {signal.sourceLifecycle === "resolved" ? t("inbox:SOURCE_RESOLVED") : t(stateKey)}
        </Badge>
        <p className="mt-1 text-caption text-label-secondary">
          {signal.triage.assigneeUserId
            ? (assigneeNames?.get(signal.triage.assigneeUserId) ??
              t("inbox:ASSIGNED_OPERATOR_PRESENT"))
            : t("inbox:UNASSIGNED")}
        </p>
      </TableCell>
      <TableCell className="align-top text-footnote text-label-secondary">
        {formatAge(signal.freshness.ageSeconds)}
      </TableCell>
      <TableCell className="align-top text-right">
        <Button
          aria-label={t("inbox:OPEN_SIGNAL_DETAILS", { title: t(signal.copy.titleKey) })}
          onClick={() => onOpen(signal.id)}
          size="icon-sm"
          variant="ghost"
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function SignalQueue({ data, assigneeNames, onOpen, onPageChange }: SignalQueueProps) {
  const { t } = useTranslation("inbox");
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("PRIORITY")}</TableHead>
              <TableHead>{t("CONDITION")}</TableHead>
              <TableHead>{t("COORDINATION")}</TableHead>
              <TableHead>{t("LAST_OBSERVED")}</TableHead>
              <TableHead className="text-right">{t("DETAILS")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items?.map((signal) => (
              <SignalRow
                assigneeNames={assigneeNames}
                key={signal.id}
                onOpen={onOpen}
                signal={signal}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 border-t px-4 py-3 text-footnote text-label-secondary sm:flex-row sm:items-center sm:justify-between">
        <span>{t("PAGE_OF", { page: data.page, pages: data.pages, total: data.total })}</span>
        <div className="flex gap-2">
          <Button
            disabled={!data.prev}
            onClick={() => data.prev && onPageChange(data.prev)}
            size="sm"
            variant="outline"
          >
            {t("PREVIOUS")}
          </Button>
          <Button
            disabled={!data.next}
            onClick={() => data.next && onPageChange(data.next)}
            size="sm"
            variant="outline"
          >
            {t("NEXT")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function loadEligibleAssignees(signal: AbortSignal) {
  return listOperationalSignalEligibleAssignees(signal);
}

function skipEligibleAssignees(): Promise<OperationalSignalAssigneeOut[]> {
  return Promise.resolve([]);
}

function assigneeNameMap(assignees: readonly OperationalSignalAssigneeOut[]) {
  return new Map(
    assignees.map((operator) => [
      operator.userId,
      operator.displayName?.trim() || operator.username,
    ]),
  );
}

export function SignalQueueWithAssignees(props: SignalQueueProps) {
  const { t } = useTranslation("inbox");
  const assignmentAllowed = Boolean(
    props.data.items?.some((signal) => signal.allowedTriageActions.includes("assign")),
  );
  const { state, retry } = useOperationsQuery(
    assignmentAllowed ? loadEligibleAssignees : skipEligibleAssignees,
    [assignmentAllowed],
  );
  const assigneeNames = useMemo(
    () => assigneeNameMap(state.status === "ready" ? state.data : []),
    [state],
  );

  return (
    <div className="space-y-3">
      {assignmentAllowed && state.status === "error" && (
        <Alert>
          <AlertTriangle aria-hidden="true" />
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>{t("ASSIGNEES_ERROR")}</span>
            <Button onClick={retry} size="sm" variant="outline">
              {t("RETRY")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <SignalQueue {...props} assigneeNames={assigneeNames} />
    </div>
  );
}
