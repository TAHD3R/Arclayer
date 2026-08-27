import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { PageDataPlatformAiTaskOut, PlatformAiTaskOut } from "@arclayer/platform-openapi";

import { executeAiTaskAction, getAiTaskDossier, listAiTasks } from "@/ai/ai-services-api";
import { AiPage, AiState } from "@/ai/ai-page-state";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TaskAction = "retry" | "cancel" | "reconcile";
type TaskStatusFilter = "" | "failed" | "interrupted" | "running" | "queued";
type TaskActionReason = Readonly<{ copyKey: string }>;

const taskActionReasonCopyKeys: Readonly<Record<string, string>> = {
  AI_PLATFORM_TASK_RETRY_PORT_UNAVAILABLE: "ACTION_RETRY_PORT_UNAVAILABLE",
  AI_PLATFORM_TASK_CANCEL_PORT_UNAVAILABLE: "ACTION_CANCEL_PORT_UNAVAILABLE",
  AI_PLATFORM_TASK_RECONCILE_PORT_UNAVAILABLE: "ACTION_RECONCILE_PORT_UNAVAILABLE",
  AI_PLATFORM_TASK_RETRY_NOT_ELIGIBLE: "ACTION_RETRY_NOT_ELIGIBLE",
  AI_PLATFORM_TASK_RETRY_POLICY_BLOCKED: "ACTION_RETRY_POLICY_BLOCKED",
  AI_PLATFORM_TASK_CANCEL_NOT_ELIGIBLE: "ACTION_CANCEL_NOT_ELIGIBLE",
  AI_PLATFORM_TASK_RECONCILE_NOT_ELIGIBLE: "ACTION_RECONCILE_NOT_ELIGIBLE",
};

function actionAvailability(task: PlatformAiTaskOut, action: TaskAction) {
  return task.actions.find((item) => item.action === action);
}

function taskActionReason(
  availability: ReturnType<typeof actionAvailability>,
): TaskActionReason | null {
  if (!availability) {
    return {
      copyKey: "ACTION_AVAILABILITY_MISSING",
    };
  }
  if (availability.available && availability.stateEligible) return null;
  const reasonCode = availability.reasonCode ?? null;
  return {
    copyKey:
      (reasonCode ? taskActionReasonCopyKeys[reasonCode] : undefined) ??
      (availability.available ? "ACTION_STATE_NOT_ELIGIBLE" : "ACTION_PORT_UNAVAILABLE"),
  };
}

function taskActionErrorCode(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "PLATFORM_AI_SERVICES_REQUEST_FAILED";
}

export function AiTasksPage() {
  const { t, i18n } = useTranslation(["ai", "errors"]);
  const [filters, setFilters] = useState<{
    status: TaskStatusFilter;
    provider: string;
    model: string;
    failureClass: string;
    correlation: string;
  }>({
    status: "",
    provider: "",
    model: "",
    failureClass: "",
    correlation: "",
  });
  const load = useCallback(
    () =>
      listAiTasks({
        page: 1,
        size: 50,
        status: filters.status || undefined,
        provider: filters.provider || undefined,
        model: filters.model || undefined,
        failureClass: filters.failureClass || undefined,
        correlation: filters.correlation || undefined,
      }),
    [filters],
  );
  const { state, retry } = useMonitoringQuery(load, [filters]);
  const [pending, setPending] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const idempotencyKeys = useRef<Map<string, string>>(new Map());
  const execute = async (task: PlatformAiTaskOut, action: TaskAction) => {
    const operationKey = `${task.id}:${action}`;
    const idempotencyKey = idempotencyKeys.current.get(operationKey) ?? crypto.randomUUID();
    idempotencyKeys.current.set(operationKey, idempotencyKey);
    setPending(operationKey);
    try {
      const currentTask = await executeAiTaskAction(task.id, action, { idempotencyKey });
      idempotencyKeys.current.delete(operationKey);
      toast.success(t("ai:TASK_ACTION_RESULT_TITLE"), {
        description: `${t("ai:TASK_ACTION_RESULT_DESCRIPTION", {
          action: t(`ai:ACTION_${action.toUpperCase()}`),
          outcome: t(`ai:OUTCOME_${currentTask.outcome.toUpperCase()}`),
        })} ${t("ai:TASK_ACTION_RESULT_SEQUENCE", { sequence: currentTask.lastSequence })}`,
      });
      retry();
    } catch (error) {
      const code = taskActionErrorCode(error);
      const actionErrorCopyKey = taskActionReasonCopyKeys[code];
      toast.error(t("ai:TASK_ACTION_UNCONFIRMED"), {
        description: actionErrorCopyKey
          ? t(`ai:${actionErrorCopyKey}`)
          : i18n.exists(`errors:${code}`)
            ? t(`errors:${code}`)
            : t("ai:TASK_ACTION_UNCONFIRMED_DESCRIPTION"),
      });
    } finally {
      setPending(null);
    }
  };
  return (
    <AiPage description={t("TASKS_DESCRIPTION")} title={t("TASKS_TITLE")}>
      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-2 xl:grid-cols-5">
          <Select
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                status: (value === "all" ? "" : value) as TaskStatusFilter,
              }))
            }
            value={filters.status || "all"}
          >
            <SelectTrigger aria-label={t("STATUS")}>
              <SelectValue placeholder={t("TASK_STATUS_FILTER_PLACEHOLDER")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("TASK_STATUS_ALL")}</SelectItem>
              {[
                ["failed", "TASK_STATUS_FAILED_DESCRIPTION"],
                ["interrupted", "TASK_STATUS_INTERRUPTED_DESCRIPTION"],
                ["running", "TASK_STATUS_RUNNING_DESCRIPTION"],
                ["queued", "TASK_STATUS_QUEUED_DESCRIPTION"],
              ].map(([value, descriptionKey]) => (
                <SelectItem key={value} value={value}>
                  <span className="flex flex-col">
                    <span>{t(`STATUS_${value.toUpperCase()}`)}</span>
                    <span className="text-xs text-muted-foreground">{t(descriptionKey)}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label={t("PROVIDER")}
            onChange={(event) =>
              setFilters((current) => ({ ...current, provider: event.target.value }))
            }
            placeholder={t("TASK_PROVIDER_PLACEHOLDER")}
            value={filters.provider}
          />
          <Input
            aria-label={t("MODEL")}
            onChange={(event) =>
              setFilters((current) => ({ ...current, model: event.target.value }))
            }
            placeholder={t("TASK_MODEL_PLACEHOLDER")}
            value={filters.model}
          />
          <Input
            aria-label={t("FAILURE_CLASS")}
            onChange={(event) =>
              setFilters((current) => ({ ...current, failureClass: event.target.value }))
            }
            placeholder={t("TASK_FAILURE_CLASS_PLACEHOLDER")}
            value={filters.failureClass}
          />
          <Input
            aria-label={t("CORRELATION")}
            onChange={(event) =>
              setFilters((current) => ({ ...current, correlation: event.target.value }))
            }
            placeholder={t("TASK_CORRELATION_PLACEHOLDER")}
            value={filters.correlation}
          />
        </CardContent>
      </Card>
      <AiState
        empty={(data: PageDataPlatformAiTaskOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardHeader>
              <CardTitle>{t("TASK_QUEUE")}</CardTitle>
              <CardDescription>{t("TASK_QUEUE_DESCRIPTION")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("WORKSPACE")}</TableHead>
                    <TableHead>{t("STATUS")}</TableHead>
                    <TableHead>{t("MODE")}</TableHead>
                    <TableHead>{t("LAST_PROGRESS")}</TableHead>
                    <TableHead>{t("ERROR_CODE")}</TableHead>
                    <TableHead>{t("ACTIONS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-mono text-xs">
                        {t("WORKSPACE_REFERENCE", { value: task.workspaceId.slice(0, 8) })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={task.outcome === "failed" ? "destructive" : "outline"}>
                          {t(`OUTCOME_${task.outcome.toUpperCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>{t(`MODE_${task.executionMode.toUpperCase()}`)}</TableCell>
                      <TableCell className="space-y-1">
                        <p>{t(`STATUS_${task.status.toUpperCase()}`)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("EVIDENCE_SEQUENCE", { sequence: task.lastSequence })}
                        </p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {task.errorCode ? t("ERROR_RECORDED") : t("NO_ERROR_CODE")}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => setDetailTaskId(task.id)}
                            size="sm"
                            variant="ghost"
                          >
                            {t("VIEW_DETAILS")}
                          </Button>
                          {(["retry", "cancel", "reconcile"] as const).map((action) => {
                            const availability = actionAvailability(task, action);
                            const reason = taskActionReason(availability);
                            const reasonId = `task-${task.id}-${action}-reason`;
                            const available = Boolean(
                              availability?.available && availability.stateEligible,
                            );
                            return (
                              <div key={action}>
                                <Button
                                  aria-describedby={reason ? reasonId : undefined}
                                  disabled={!available || pending === `${task.id}:${action}`}
                                  onClick={() => void execute(task, action)}
                                  size="sm"
                                  variant={action === "cancel" ? "outline" : "secondary"}
                                >
                                  {pending === `${task.id}:${action}`
                                    ? t("WORKING")
                                    : t(`ACTION_${action.toUpperCase()}`)}
                                </Button>
                                {reason ? (
                                  <p
                                    className="mt-1 max-w-48 text-xs text-muted-foreground"
                                    id={reasonId}
                                  >
                                    {t(reason.copyKey)}
                                  </p>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </AiState>
      {detailTaskId ? (
        <AiTaskDetailSheet taskId={detailTaskId} onClose={() => setDetailTaskId(null)} />
      ) : null}
    </AiPage>
  );
}

function AiTaskDetailSheet(props: Readonly<{ taskId: string; onClose: () => void }>) {
  const { t } = useTranslation("ai");
  const load = useCallback(() => getAiTaskDossier(props.taskId), [props.taskId]);
  const { state, retry } = useMonitoringQuery(load, [props.taskId]);
  const dossier = state.status === "ready" ? state.data : undefined;
  const task = dossier?.task;
  return (
    <Sheet onOpenChange={(open) => !open && props.onClose()} open>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("TASK_DETAILS_TITLE")}</SheetTitle>
          <SheetDescription>{t("TASK_DETAILS_DESCRIPTION")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-6 pb-8">
          {state.status === "loading" ? <Skeleton className="h-52 w-full" /> : null}
          {state.status === "error" ? (
            <Empty className="border bg-card">
              <EmptyHeader>
                <EmptyTitle>{t("TASK_DETAILS_ERROR_TITLE")}</EmptyTitle>
                <EmptyDescription>{t("TASK_DETAILS_ERROR_DESCRIPTION")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={retry} variant="outline">
                  {t("RETRY")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : null}
          {task ? (
            <Card>
              <CardContent className="space-y-3 pt-6 text-sm">
                <p>
                  <span className="font-medium">{t("STATUS")}:</span>{" "}
                  {t(`STATUS_${task.status.toUpperCase()}`)}
                </p>
                <p>
                  <span className="font-medium">{t("OUTCOME")}:</span>{" "}
                  {t(`OUTCOME_${task.outcome.toUpperCase()}`)}
                </p>
                <p>
                  <span className="font-medium">{t("PROGRESS")}:</span> {task.progressCompleted}
                  {task.progressTotal === null ? "" : ` / ${task.progressTotal}`}
                </p>
                <p>
                  <span className="font-medium">{t("ERROR_CODE")}:</span>{" "}
                  {task.errorCode ?? t("NO_ERROR_CODE")}
                </p>
                <p>
                  <span className="font-medium">{t("INTERRUPT_REASON")}:</span>{" "}
                  {task.interruptReason ?? t("NO_INTERRUPT_REASON")}
                </p>
                <p>
                  <span className="font-medium">{t("EVIDENCE_SEQUENCE_LABEL")}:</span>{" "}
                  {task.lastSequence}
                </p>
                <p className="break-all font-mono text-xs text-muted-foreground">{task.id}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <p>
                    {t("MESSAGES")}: {dossier?.messages.total ?? 0}
                  </p>
                  <p>
                    {t("ATTEMPTS")}: {dossier?.attempts.length ?? 0}
                  </p>
                  <p>
                    {t("TELEMETRY")}:{" "}
                    {dossier?.usage.telemetryAvailable ? t("AVAILABLE") : t("NOT_AVAILABLE")}
                  </p>
                </div>
                {dossier?.diagnostics.failureClassification ? (
                  <p>
                    <span className="font-medium">{t("FAILURE_CLASS")}:</span>{" "}
                    {dossier.diagnostics.failureClassification}
                  </p>
                ) : null}
                {dossier?.timeline.length ? (
                  <div className="space-y-2 border-t pt-3">
                    <p className="font-medium">{t("TIMELINE")}</p>
                    <ol className="space-y-2 text-xs text-muted-foreground">
                      {dossier.timeline.map((entry, index) => (
                        <li className="flex gap-2" key={`${entry.occurredAt}-${index}`}>
                          <time className="shrink-0 font-mono">
                            {new Date(entry.occurredAt).toLocaleTimeString()}
                          </time>
                          <span>{entry.summary}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
