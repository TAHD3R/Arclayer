import {
  Activity,
  Archive,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type {
  PageDataPlatformAiTaskOut,
  PlatformAiProviderReadinessOut,
  PlatformAiTaskOut,
  SystemAgentCatalogCapabilitiesOut,
  SystemAgentDefinitionSummaryOut,
  SystemAiProviderAvailabilityPreviewOut,
  SystemAiProviderListOut,
  SystemAiProviderOut,
} from "@arclayer/platform-openapi";

import { ProviderIconImage } from "@/ai/ai-provider-icon";
import {
  applyAiProviderAvailability,
  applyAiPolicy,
  deleteAiProvider,
  executeAiTaskAction,
  getAiTaskDossier,
  getAiPolicy,
  getAiProviderReadiness,
  listAiProviders,
  listAiPolicyRevisions,
  listAiTasks,
  PlatformAiServicesApiError,
  previewAiProviderAvailability,
  previewAiPolicy,
  publishAiPolicy,
  saveAiPolicyDraft,
  testAiProviderReadiness,
  updateAiProvider,
} from "@/ai/ai-services-api";
import { AiProviderEditorDialog } from "@/ai/ai-provider-dialogs";
import { AiAssistantEditorDialog, AiAssistantVersionDialog } from "@/ai/ai-assistant-dialogs";
import {
  getAiAssistantCapabilities,
  listAiAssistants,
  retireAiAssistantVersion,
  updateAiAssistant,
} from "@/ai/ai-assistants-api";
import { PlatformPage } from "@/components/platform-page";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type QueryState<T> = { status: string; data?: T };
type TaskAction = "retry" | "cancel" | "reconcile";
type TaskStatusFilter = "" | "failed" | "interrupted" | "running" | "queued";
type TaskActionReason = Readonly<{ copyKey: string }>;
type ProviderLifecycleContinuation = "none" | "archive" | "delete";
type ProviderAvailabilityFlow = Readonly<{
  preview: SystemAiProviderAvailabilityPreviewOut;
  provider: SystemAiProviderOut;
  continuation: ProviderLifecycleContinuation;
}>;

const taskActionReasonCopyKeys: Readonly<Record<string, string>> = {
  AI_PLATFORM_TASK_RETRY_PORT_UNAVAILABLE: "ACTION_RETRY_PORT_UNAVAILABLE",
  AI_PLATFORM_TASK_CANCEL_PORT_UNAVAILABLE: "ACTION_CANCEL_PORT_UNAVAILABLE",
  AI_PLATFORM_TASK_RECONCILE_PORT_UNAVAILABLE: "ACTION_RECONCILE_PORT_UNAVAILABLE",
  AI_PLATFORM_TASK_RETRY_NOT_ELIGIBLE: "ACTION_RETRY_NOT_ELIGIBLE",
  AI_PLATFORM_TASK_RETRY_POLICY_BLOCKED: "ACTION_RETRY_POLICY_BLOCKED",
  AI_PLATFORM_TASK_CANCEL_NOT_ELIGIBLE: "ACTION_CANCEL_NOT_ELIGIBLE",
  AI_PLATFORM_TASK_RECONCILE_NOT_ELIGIBLE: "ACTION_RECONCILE_NOT_ELIGIBLE",
};

function AiPage(
  props: Readonly<{
    title: string;
    description: string;
    primaryAction?: ReactNode;
    secondaryActions?: ReactNode;
    extra?: ReactNode;
    children: ReactNode;
  }>,
) {
  return (
    <PlatformPage
      description={props.description}
      extra={props.extra}
      primaryAction={props.primaryAction}
      secondaryActions={props.secondaryActions}
      title={props.title}
    >
      {props.children}
    </PlatformPage>
  );
}

function AiState<T>(
  props: Readonly<{
    state: QueryState<T>;
    retry: () => void;
    empty: (data: T) => boolean;
    children: (data: T) => ReactNode;
  }>,
) {
  const { t } = useTranslation("ai");
  if (props.state.status === "loading") {
    return (
      <div aria-busy="true" className="space-y-3" role="status">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (props.state.status === "error") {
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("ERROR_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("ERROR_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={props.retry} variant="outline">
            {t("RETRY")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  if (!props.state.data || props.empty(props.state.data)) {
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("EMPTY_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("EMPTY_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return props.children(props.state.data);
}

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

type ProviderData = Readonly<{
  readiness: PlatformAiProviderReadinessOut;
  providers: SystemAiProviderListOut;
}>;

type ProviderFilter = "all" | "active" | "archived";

const providerEmptyCopy: Readonly<
  Record<ProviderFilter, Readonly<{ title: string; description: string }>>
> = {
  all: {
    title: "PROVIDER_EMPTY_ALL_TITLE",
    description: "PROVIDER_EMPTY_ALL_DESCRIPTION",
  },
  active: {
    title: "PROVIDER_EMPTY_ACTIVE_TITLE",
    description: "PROVIDER_EMPTY_ACTIVE_DESCRIPTION",
  },
  archived: {
    title: "PROVIDER_EMPTY_ARCHIVED_TITLE",
    description: "PROVIDER_EMPTY_ARCHIVED_DESCRIPTION",
  },
};

export function AiProvidersPage() {
  const { t } = useTranslation("ai");
  const load = useCallback(
    async (): Promise<ProviderData> => ({
      readiness: await getAiProviderReadiness(),
      providers: await listAiProviders(),
    }),
    [],
  );
  const { state, retry } = useMonitoringQuery(load, []);
  const [editor, setEditor] = useState<{ provider?: SystemAiProviderOut; copy?: boolean } | null>(
    null,
  );
  const [filter, setFilter] = useState<ProviderFilter>("all");
  return (
    <AiPage
      description={t("PROVIDERS_DESCRIPTION")}
      extra={
        <Tabs onValueChange={(value) => setFilter(value as typeof filter)} value={filter}>
          <TabsList>
            <TabsTrigger value="all">{t("FILTER_ALL")}</TabsTrigger>
            <TabsTrigger value="active">{t("FILTER_ACTIVE")}</TabsTrigger>
            <TabsTrigger value="archived">{t("FILTER_ARCHIVED")}</TabsTrigger>
          </TabsList>
        </Tabs>
      }
      primaryAction={
        <Button onClick={() => setEditor({})}>
          <Plus aria-hidden="true" />
          {t("ADD_PROVIDER")}
        </Button>
      }
      title={t("PROVIDERS_TITLE")}
    >
      <AiState empty={() => false} retry={retry} state={state}>
        {(data) => (
          <ProviderConsole
            data={data}
            filter={filter}
            onCopy={(provider) => setEditor({ provider, copy: true })}
            onEdit={(provider) => setEditor({ provider })}
            onRefresh={retry}
          />
        )}
      </AiState>
      {editor ? (
        <AiProviderEditorDialog
          copy={editor.copy}
          onCompleted={(messageKey) => {
            toast.success(t(messageKey));
            retry();
          }}
          onOpenChange={(open) => !open && setEditor(null)}
          open
          provider={editor.provider}
        />
      ) : null}
    </AiPage>
  );
}

function ProviderConsole(
  props: Readonly<{
    data: ProviderData;
    filter: ProviderFilter;
    onRefresh: () => void;
    onEdit: (provider: SystemAiProviderOut) => void;
    onCopy: (provider: SystemAiProviderOut) => void;
  }>,
) {
  const { t, i18n } = useTranslation(["ai", "errors"]);
  const [availabilityFlow, setAvailabilityFlow] = useState<ProviderAvailabilityFlow | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SystemAiProviderOut | null>(null);
  const readinessById = new Map(props.data.readiness.items.map((item) => [item.id, item]));
  const allProviders = props.data.providers.providers ?? [];
  const providers = allProviders.filter((provider) => {
    if (props.filter === "active") return provider.isActive && !provider.isArchived;
    if (props.filter === "archived") return provider.isArchived;
    return true;
  });
  const activeCount = allProviders.filter(
    (provider) => provider.isActive && !provider.isArchived,
  ).length;
  const routableCount = props.data.readiness.items.filter((item) => item.routable).length;
  const pendingTestCount = props.data.readiness.items.filter(
    (item) => !item.archived && item.health === "unknown",
  ).length;
  const publicModelCounts = new Map<string, number>();
  for (const provider of allProviders) {
    for (const mapping of provider.modelMappings ?? []) {
      publicModelCounts.set(
        mapping.publicModel,
        (publicModelCounts.get(mapping.publicModel) ?? 0) + 1,
      );
    }
  }
  const emptyCopy = providerEmptyCopy[props.filter];
  const doAction = async (
    key: string,
    operation: () => Promise<unknown>,
    refreshAfter = true,
    successKey?: string,
  ) => {
    setPending(key);
    try {
      await operation();
      if (successKey) toast.success(t(`ai:${successKey}`));
      if (refreshAfter) props.onRefresh();
    } catch (error) {
      const apiError = error instanceof PlatformAiServicesApiError ? error : null;
      const code = error instanceof Error ? error.message : null;
      const codeKey = apiError ? `errors:${apiError.message}` : null;
      toast.error(t("ai:ACTION_FAILED"), {
        description:
          codeKey && i18n.exists(codeKey)
            ? `${t(codeKey)}${code ? ` · ${code}` : ""}`
            : (code ?? t("ai:ACTION_FAILED")),
      });
    } finally {
      setPending(null);
    }
  };
  const requestAvailabilityPreview = async (
    provider: SystemAiProviderOut,
    desiredIsActive: boolean,
    continuation: ProviderLifecycleContinuation,
  ) => {
    const preview = await previewAiProviderAvailability(provider.id, desiredIsActive);
    setAvailabilityFlow({ preview, provider, continuation });
  };
  const applyAvailabilityFlow = async () => {
    if (!availabilityFlow) return;
    const { preview, provider, continuation } = availabilityFlow;
    await applyAiProviderAvailability(preview.id, preview.desiredIsActive, preview.revision);
    setAvailabilityFlow(null);
    if (continuation === "archive") {
      await updateAiProvider(provider.id, { isArchived: true });
    }
    if (continuation === "delete") {
      setDeleteTarget({ ...provider, isActive: false });
    }
  };
  return (
    <div className="space-y-5">
      {allProviders.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["PROVIDER_METRIC_TOTAL", allProviders.length],
            ["PROVIDER_METRIC_ACTIVE", activeCount],
            ["PROVIDER_METRIC_ROUTABLE", routableCount],
            ["PROVIDER_METRIC_PENDING_TEST", pendingTestCount],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardContent className="px-5 py-4">
                <p className="text-sm text-muted-foreground">{t(String(label))}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("PROVIDER_DIRECTORY")}</CardTitle>
          <CardDescription>{t("PROVIDER_DIRECTORY_DESCRIPTION")}</CardDescription>
        </CardHeader>
        <CardContent className={providers.length ? "overflow-x-auto px-0" : undefined}>
          {providers.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("PROVIDER_SERVICE")}</TableHead>
                  <TableHead>{t("DEFAULT_MODEL")}</TableHead>
                  <TableHead>{t("STATUS")}</TableHead>
                  <TableHead>{t("LAST_CHECK")}</TableHead>
                  <TableHead className="text-right">{t("ACTIONS")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((provider) => {
                  const readiness = readinessById.get(provider.id);
                  const ready = readiness?.routable && readiness.health === "healthy";
                  const responseMismatch =
                    readiness?.healthFailureCode === "AI_PROVIDER_READINESS_RESPONSE_MISMATCH";
                  const test = readiness?.actions.find(
                    (action) => action.action === "test_readiness",
                  );
                  const availability = readiness?.actions.find(
                    (action) => action.action === (provider.isActive ? "disable" : "enable"),
                  );
                  const hasAliasConflict = (provider.modelMappings ?? []).some(
                    (mapping) => (publicModelCounts.get(mapping.publicModel) ?? 0) > 1,
                  );
                  return (
                    <TableRow key={provider.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {provider.icon ? (
                            <span className="flex size-9 items-center justify-center rounded-md border p-1">
                              <ProviderIconImage className="size-7" icon={provider.icon} />
                            </span>
                          ) : (
                            <div className="flex size-9 items-center justify-center rounded-md border bg-muted text-xs font-medium">
                              {provider.label.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{provider.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {provider.provider}
                              {provider.note ? ` · ${provider.note}` : ""}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs">{provider.defaultModel}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("MODEL_COUNT", { count: provider.modelMappings?.length ?? 0 })}
                        </div>
                      </TableCell>
                      <TableCell className="space-x-2">
                        <Badge
                          variant={
                            readiness?.health === "unhealthy" && !responseMismatch
                              ? "destructive"
                              : ready
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {t(
                            provider.isArchived
                              ? "ARCHIVED"
                              : !provider.isActive
                                ? "PROVIDER_STATUS_DISABLED"
                                : responseMismatch
                                  ? "PROVIDER_STATUS_RESPONSE_MISMATCH"
                                  : readiness?.health === "unhealthy"
                                    ? "PROVIDER_STATUS_CONNECTION_ERROR"
                                    : readiness?.health === "unknown"
                                      ? "PROVIDER_STATUS_PENDING_TEST"
                                      : ready
                                        ? "READY"
                                        : "NOT_READY",
                          )}
                        </Badge>
                        {provider.cleanupRequired ? (
                          <Badge variant="destructive">{t("CLEANUP_REQUIRED")}</Badge>
                        ) : null}
                        {hasAliasConflict ? (
                          <Badge variant="destructive">{t("PUBLIC_MODEL_CONFLICT")}</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {provider.readinessCheckedAt
                          ? new Date(provider.readinessCheckedAt).toLocaleString()
                          : t("NEVER_TESTED")}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-label={t("PROVIDER_ACTIONS", { name: provider.label })}
                              size="icon"
                              variant="ghost"
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => props.onEdit(provider)}>
                              <Pencil />
                              {t("EDIT_PROVIDER")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => props.onCopy(provider)}>
                              <Copy />
                              {t("COPY_PROVIDER")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!test?.available || pending === `test:${provider.id}`}
                              title={!test?.available ? t("TEST_UNAVAILABLE_ARCHIVED") : undefined}
                              onSelect={() =>
                                void doAction(
                                  `test:${provider.id}`,
                                  () => testAiProviderReadiness(provider.id),
                                  true,
                                  "PROVIDER_TEST_COMPLETED",
                                )
                              }
                            >
                              <Activity />
                              {t("TEST_READINESS")}
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <a
                                href={`/monitoring/ai-usage?provider=${encodeURIComponent(provider.id)}`}
                              >
                                <Activity />
                                {t("VIEW_USAGE")}
                              </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                !availability?.available || pending === `preview:${provider.id}`
                              }
                              title={
                                !availability?.available
                                  ? t("AVAILABILITY_ACTION_UNAVAILABLE")
                                  : undefined
                              }
                              onSelect={() =>
                                void doAction(
                                  `preview:${provider.id}`,
                                  async () =>
                                    requestAvailabilityPreview(
                                      provider,
                                      !provider.isActive,
                                      "none",
                                    ),
                                  false,
                                )
                              }
                            >
                              <RotateCcw />
                              {provider.isActive ? t("DISABLE") : t("ENABLE")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={pending !== null}
                              title={
                                provider.isActive && !provider.isArchived
                                  ? t("ARCHIVE_WILL_DISABLE")
                                  : undefined
                              }
                              onSelect={() =>
                                void doAction(
                                  `archive:${provider.id}`,
                                  async () => {
                                    if (provider.isArchived) {
                                      await updateAiProvider(provider.id, { isArchived: false });
                                    } else if (provider.isActive) {
                                      await requestAvailabilityPreview(provider, false, "archive");
                                    } else {
                                      await updateAiProvider(provider.id, { isArchived: true });
                                    }
                                  },
                                  !provider.isActive,
                                )
                              }
                            >
                              {provider.isArchived ? <RotateCcw /> : <Archive />}
                              {provider.isArchived ? t("RESTORE") : t("ARCHIVE")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={pending !== null}
                              title={
                                provider.cleanupRequired
                                  ? t("DELETE_RETRIES_CLEANUP")
                                  : provider.isActive || !provider.isArchived
                                    ? t("DELETE_WILL_PREPARE")
                                    : undefined
                              }
                              onSelect={() => {
                                if (provider.isActive) {
                                  void doAction(
                                    `preview-delete:${provider.id}`,
                                    () => requestAvailabilityPreview(provider, false, "delete"),
                                    false,
                                  );
                                } else {
                                  setDeleteTarget(provider);
                                }
                              }}
                            >
                              <Trash2 />
                              {t("DELETE")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Empty className="min-h-64 border-0">
              <EmptyHeader>
                <EmptyTitle>{t(emptyCopy.title)}</EmptyTitle>
                <EmptyDescription>{t(emptyCopy.description)}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
      <AlertDialog
        onOpenChange={(open) => !open && pending === null && setAvailabilityFlow(null)}
        open={Boolean(availabilityFlow)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                availabilityFlow?.continuation === "archive"
                  ? "DISABLE_AND_ARCHIVE"
                  : availabilityFlow?.continuation === "delete"
                    ? "DISABLE_BEFORE_DELETE"
                    : "AVAILABILITY_PREVIEW",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {availabilityFlow?.preview.wouldLeaveNoRoutableProvider
                ? t("NO_ROUTABLE_PROVIDER_WARNING")
                : t("ROUTABLE_PROVIDER_COUNT", {
                    count: availabilityFlow?.preview.routableProviderCountAfter ?? 0,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending?.startsWith("apply:") === true}>
              {t("CANCEL")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pending?.startsWith("apply:") === true}
              onClick={(event) => {
                event.preventDefault();
                const previewId = availabilityFlow?.preview.id;
                if (previewId) {
                  void doAction(
                    `apply:${previewId}`,
                    applyAvailabilityFlow,
                    availabilityFlow?.continuation !== "delete",
                  );
                }
              }}
            >
              {t("CONFIRM")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        onOpenChange={(open) => !open && pending === null && setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("DELETE_PROVIDER_TITLE")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("DELETE_PROVIDER_DESCRIPTION", { name: deleteTarget?.label })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending?.startsWith("delete:") === true}>
              {t("CANCEL")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pending?.startsWith("delete:") === true}
              onClick={(event) => {
                event.preventDefault();
                const target = deleteTarget;
                if (!target) return;
                void doAction(`delete:${target.id}`, async () => {
                  if (!target.isArchived) {
                    await updateAiProvider(target.id, { isArchived: true });
                  }
                  await deleteAiProvider(target.id);
                  setDeleteTarget(null);
                });
              }}
            >
              {t("DELETE")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AiAssistantsPage() {
  const { t } = useTranslation("ai");
  const load = useCallback(
    async () => ({
      capabilities: await getAiAssistantCapabilities(),
      catalog: await listAiAssistants({ scope: "system", page: 1, size: 100 }),
    }),
    [],
  );
  const { state, retry } = useMonitoringQuery(load, []);
  const [pending, setPending] = useState<string | null>(null);
  const [editor, setEditor] = useState<"create" | SystemAgentDefinitionSummaryOut | null>(null);
  const [versionEditor, setVersionEditor] = useState<SystemAgentDefinitionSummaryOut | null>(null);
  const changeLifecycle = async (
    assistant: SystemAgentDefinitionSummaryOut,
    lifecycleState: "active" | "disabled" | "archived",
  ) => {
    setPending(`assistant:${assistant.id}`);
    try {
      await updateAiAssistant(assistant.id, { lifecycleState });
      toast.success(t("ASSISTANT_UPDATED"));
      retry();
    } catch (cause) {
      toast.error(t("ACTION_FAILED"), {
        description: cause instanceof Error ? cause.message : t("ACTION_FAILED"),
      });
    } finally {
      setPending(null);
    }
  };
  const changeVersionState = async (
    assistant: SystemAgentDefinitionSummaryOut,
    state: "published" | "retired",
  ) => {
    const version = assistant.latestVersion;
    if (!version) return;
    setPending(`version:${version.id}`);
    try {
      await retireAiAssistantVersion(assistant.id, version.id, { state });
      toast.success(
        t(state === "published" ? "ASSISTANT_VERSION_PUBLISHED" : "ASSISTANT_VERSION_RETIRED"),
      );
      retry();
    } catch (cause) {
      toast.error(t("ACTION_FAILED"), {
        description: cause instanceof Error ? cause.message : t("ACTION_FAILED"),
      });
    } finally {
      setPending(null);
    }
  };
  return (
    <AiPage description={t("ASSISTANTS_DESCRIPTION")} title={t("ASSISTANTS_TITLE")}>
      <AiState empty={() => false} retry={retry} state={state}>
        {(data) => {
          const approvalProfiles = assistantApprovalProfiles(data.capabilities);
          const publicationAvailable = assistantCapabilityFlag(
            data.capabilities,
            "runtimeValidationPortAvailable",
          );
          return (
            <>
              <div className="flex justify-end">
                <Button disabled={!approvalProfiles.length} onClick={() => setEditor("create")}>
                  <Plus aria-hidden="true" />
                  {t("CREATE_ASSISTANT")}
                </Button>
              </div>
              {!publicationAvailable ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("ASSISTANT_PUBLICATION_UNAVAILABLE_TITLE")}</CardTitle>
                    <CardDescription>
                      {t("ASSISTANT_PUBLICATION_UNAVAILABLE_DESCRIPTION")}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : null}
              {data.catalog.items?.length ? (
                <Card>
                  <CardContent className="px-0">
                    <ul>
                      {data.catalog.items.map((assistant) => (
                        <li
                          className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4"
                          key={assistant.id}
                        >
                          <div>
                            <p className="font-medium">{assistant.displayName}</p>
                            <p className="text-sm text-muted-foreground">{assistant.description}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {assistant.latestVersion
                                ? t("ASSISTANT_LATEST_VERSION", {
                                    number: assistant.latestVersion.versionNumber,
                                    state: t(
                                      `VERSION_STATE_${assistant.latestVersion.state.toUpperCase()}`,
                                    ),
                                  })
                                : t("ASSISTANT_NO_VERSION")}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Badge variant={assistant.isOfficial ? "secondary" : "outline"}>
                              {t(`ASSISTANT_STATE_${assistant.lifecycleState.toUpperCase()}`)}
                            </Badge>
                            {assistant.isOfficial ? (
                              <span className="text-xs text-muted-foreground">
                                {t("OFFICIAL_ASSISTANT_MANAGED")}
                              </span>
                            ) : assistant.lifecycleState === "archived" ? (
                              <>
                                <span className="text-xs text-muted-foreground">
                                  {t("ARCHIVED_ASSISTANT_READ_ONLY")}
                                </span>
                                <Button
                                  disabled={pending === `assistant:${assistant.id}`}
                                  onClick={() => void changeLifecycle(assistant, "active")}
                                  size="sm"
                                  variant="outline"
                                >
                                  {t("RESTORE")}
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  onClick={() => setEditor(assistant)}
                                  size="sm"
                                  variant="ghost"
                                >
                                  <Pencil aria-hidden="true" />
                                  {t("EDIT_ASSISTANT")}
                                </Button>
                                <Button
                                  disabled={!approvalProfiles.length}
                                  onClick={() => setVersionEditor(assistant)}
                                  size="sm"
                                  variant="outline"
                                >
                                  {t("CREATE_VERSION")}
                                </Button>
                                {publicationAvailable &&
                                assistant.latestVersion?.state === "draft" ? (
                                  <Button
                                    disabled={pending === `version:${assistant.latestVersion.id}`}
                                    onClick={() => void changeVersionState(assistant, "published")}
                                    size="sm"
                                  >
                                    {t("PUBLISH")}
                                  </Button>
                                ) : null}
                                {assistant.latestVersion?.state === "published" ? (
                                  <Button
                                    disabled={pending === `version:${assistant.latestVersion.id}`}
                                    onClick={() => void changeVersionState(assistant, "retired")}
                                    size="sm"
                                    variant="outline"
                                  >
                                    {t("RETIRE")}
                                  </Button>
                                ) : null}
                                <Button
                                  disabled={
                                    pending === `assistant:${assistant.id}` ||
                                    assistant.lifecycleState === "active"
                                  }
                                  onClick={() => void changeLifecycle(assistant, "active")}
                                  size="sm"
                                  variant="outline"
                                >
                                  {t("ENABLE")}
                                </Button>
                                <Button
                                  disabled={
                                    pending === `assistant:${assistant.id}` ||
                                    assistant.lifecycleState === "disabled"
                                  }
                                  onClick={() => void changeLifecycle(assistant, "disabled")}
                                  size="sm"
                                  variant="outline"
                                >
                                  {t("DISABLE")}
                                </Button>
                                <Button
                                  disabled={pending === `assistant:${assistant.id}`}
                                  onClick={() => void changeLifecycle(assistant, "archived")}
                                  size="sm"
                                  variant="ghost"
                                >
                                  {t("ARCHIVE")}
                                </Button>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : (
                <Empty className="min-h-72 border bg-card">
                  <EmptyHeader>
                    <EmptyTitle>{t("ASSISTANT_CATALOG_EMPTY_TITLE")}</EmptyTitle>
                    <EmptyDescription>{t("ASSISTANT_CATALOG_EMPTY_DESCRIPTION")}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {editor ? (
                <AiAssistantEditorDialog
                  approvalProfiles={approvalProfiles}
                  approvalProfileCatalog={data.capabilities.approvalProfileCatalog ?? []}
                  assistant={editor === "create" ? undefined : editor}
                  onCompleted={() => {
                    toast.success(
                      t(editor === "create" ? "ASSISTANT_CREATED" : "ASSISTANT_UPDATED"),
                    );
                    retry();
                  }}
                  onOpenChange={(open) => !open && setEditor(null)}
                  open
                  supportedToolGrants={data.capabilities.supportedToolGrants}
                  toolGrantCatalog={data.capabilities.toolGrantCatalog ?? []}
                />
              ) : null}
              {versionEditor ? (
                <AiAssistantVersionDialog
                  approvalProfiles={approvalProfiles}
                  approvalProfileCatalog={data.capabilities.approvalProfileCatalog ?? []}
                  assistant={versionEditor}
                  onCompleted={() => {
                    toast.success(t("ASSISTANT_VERSION_CREATED"));
                    retry();
                  }}
                  onOpenChange={(open) => !open && setVersionEditor(null)}
                  open
                  supportedToolGrants={data.capabilities.supportedToolGrants}
                  toolGrantCatalog={data.capabilities.toolGrantCatalog ?? []}
                />
              ) : null}
            </>
          );
        }}
      </AiState>
    </AiPage>
  );
}

function assistantApprovalProfiles(capabilities: SystemAgentCatalogCapabilitiesOut): string[] {
  const value = capabilities.constraints?.customApprovalProfiles;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function assistantCapabilityFlag(
  capabilities: SystemAgentCatalogCapabilitiesOut,
  key: string,
): boolean {
  return capabilities.constraints?.[key] === true;
}

export function AiPoliciesPage() {
  const { t } = useTranslation("ai");
  const load = useCallback(
    async () => ({
      capabilities: await getAiAssistantCapabilities(),
      policy: await getAiPolicy(),
      revisions: await listAiPolicyRevisions({ page: 1, size: 20 }),
      providers: await listAiProviders(),
    }),
    [],
  );
  const { state, retry } = useMonitoringQuery(load, []);
  const [pending, setPending] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [maxTokens, setMaxTokens] = useState("0");
  const [maxCost, setMaxCost] = useState("0");
  const [maxConcurrentRuns, setMaxConcurrentRuns] = useState("0");
  const [egress, setEgress] = useState(false);
  const [toolAllowlist, setToolAllowlist] = useState<string[]>([]);
  const [approvalClasses, setApprovalClasses] = useState<string[]>([]);
  const [retryLimit, setRetryLimit] = useState("0");
  const [reason, setReason] = useState("");
  const data = state.status === "ready" ? state.data : undefined;
  const policy = data?.policy;
  const draft = policy?.draft;
  const published = policy?.published;
  const revisions = data?.revisions.items ?? [];
  const source = draft ?? published;

  useEffect(() => {
    if (!source) return;
    setModels([...(source.allowedModels ?? [])]);
    setDefaultModel(source.defaultModel ?? "");
    setMaxTokens(String(source.maxTokensPerRequest));
    setMaxCost(String(source.maxCostMicrosPerRequest));
    setMaxConcurrentRuns(String(source.maxConcurrentRuns));
    setEgress(source.externalDataEgressAllowed ?? false);
    setToolAllowlist([...(source.toolAllowlist ?? [])]);
    setApprovalClasses([...(source.approvalRequiredEffectClasses ?? [])]);
    setRetryLimit(String(source.retryLimit));
  }, [source?.id]);

  const modelOptions = data
    ? Array.from(
        new Map(
          (data.providers.providers ?? []).flatMap((provider) =>
            (provider.modelMappings ?? []).map(
              (mapping) =>
                [
                  mapping.publicModel,
                  {
                    id: mapping.publicModel,
                    label: mapping.publicModel,
                    description: `${provider.label} · ${mapping.providerModel}`,
                  },
                ] as const,
            ),
          ),
        ).values(),
      )
    : [];
  const toolOptions = data
    ? data.capabilities.supportedToolGrants.map((id) => ({
        id,
        label: id,
        description: t("POLICY_TOOL_OPTION_DESCRIPTION"),
      }))
    : [];
  const approvalOptions = ["read", "write", "external_egress", "destructive"].map((id) => ({
    id,
    label: t(`POLICY_EFFECT_${id.toUpperCase()}`),
    description: t(`POLICY_EFFECT_${id.toUpperCase()}_DESCRIPTION`),
  }));
  const saveDraft = async () => {
    setPending("save");
    try {
      await saveAiPolicyDraft({
        allowedModels: models,
        defaultModel: defaultModel.trim() || null,
        maxTokensPerRequest: Number(maxTokens),
        maxCostMicrosPerRequest: Number(maxCost),
        maxConcurrentRuns: Number(maxConcurrentRuns),
        externalDataEgressAllowed: egress,
        toolAllowlist,
        approvalRequiredEffectClasses: approvalClasses as (
          | "read"
          | "write"
          | "external_egress"
          | "destructive"
        )[],
        retryLimit: Number(retryLimit),
      });
      toast.success(t("POLICY_DRAFT_SAVED"));
      retry();
    } catch (error) {
      toast.error(t("ACTION_FAILED"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPending(null);
    }
  };
  const publish = async () => {
    if (!draft) return;
    setPending("publish");
    try {
      const preview = await previewAiPolicy({ draftId: draft.id });
      if (!preview.isApplicable) throw new Error("AI_POLICY_UNSUPPORTED_CONTROL");
      await publishAiPolicy({
        draftId: draft.id,
        previewHash: preview.sourceHash,
        reason: reason.trim() || "Platform policy change",
      });
      toast.success(t("POLICY_PUBLISHED"));
      retry();
    } catch (error) {
      toast.error(t("ACTION_FAILED"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPending(null);
    }
  };
  const apply = async () => {
    if (!published) return;
    setPending("apply");
    try {
      await applyAiPolicy({
        revisionId: published.id,
        idempotencyKey: crypto.randomUUID(),
        reason: reason.trim() || "Platform policy apply",
      });
      toast.success(t("POLICY_APPLIED"));
      retry();
    } catch (error) {
      toast.error(t("ACTION_FAILED"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPending(null);
    }
  };
  return (
    <AiPage description={t("POLICIES_DESCRIPTION")} title={t("POLICIES_TITLE")}>
      <AiState empty={() => false} retry={retry} state={state}>
        {() => (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>{t("POLICY_DRAFT_TITLE")}</CardTitle>
                <CardDescription>{t("POLICY_DRAFT_DESCRIPTION")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("POLICY_ALLOWED_MODELS")}</Label>
                  <PolicyMultiSelect
                    label={t("POLICY_ALLOWED_MODELS")}
                    onChange={setModels}
                    options={modelOptions}
                    placeholder={t("POLICY_ALLOWED_MODELS_PLACEHOLDER")}
                    selected={models}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-policy-default-model">{t("POLICY_DEFAULT_MODEL")}</Label>
                  <Select onValueChange={setDefaultModel} value={defaultModel}>
                    <SelectTrigger id="ai-policy-default-model">
                      <SelectValue placeholder={t("POLICY_DEFAULT_MODEL_PLACEHOLDER")} />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions
                        .filter((option) => models.includes(option.id))
                        .map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            <div>
                              <div>{option.label}</div>
                              <div className="text-xs text-muted-foreground">
                                {option.description}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-policy-max-tokens">{t("POLICY_MAX_TOKENS")}</Label>
                  <Input
                    id="ai-policy-max-tokens"
                    min={0}
                    onChange={(event) => setMaxTokens(event.target.value)}
                    placeholder={t("POLICY_MAX_TOKENS_PLACEHOLDER")}
                    type="number"
                    value={maxTokens}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-policy-max-cost">{t("POLICY_MAX_COST")}</Label>
                  <Input
                    id="ai-policy-max-cost"
                    min={0}
                    onChange={(event) => setMaxCost(event.target.value)}
                    placeholder={t("POLICY_MAX_COST_PLACEHOLDER")}
                    type="number"
                    value={maxCost}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-policy-max-concurrent">{t("POLICY_MAX_CONCURRENT")}</Label>
                  <Input
                    id="ai-policy-max-concurrent"
                    min={0}
                    onChange={(event) => setMaxConcurrentRuns(event.target.value)}
                    placeholder={t("POLICY_MAX_CONCURRENT_PLACEHOLDER")}
                    type="number"
                    value={maxConcurrentRuns}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <Checkbox
                    checked={egress}
                    onCheckedChange={(checked) => setEgress(checked === true)}
                  />
                  {t("POLICY_EXTERNAL_EGRESS")}
                </label>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("POLICY_TOOL_ALLOWLIST")}</Label>
                  <PolicyMultiSelect
                    label={t("POLICY_TOOL_ALLOWLIST")}
                    onChange={setToolAllowlist}
                    options={toolOptions}
                    placeholder={t("POLICY_TOOL_ALLOWLIST_PLACEHOLDER")}
                    selected={toolAllowlist}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("POLICY_APPROVAL_CLASSES")}</Label>
                  <PolicyMultiSelect
                    label={t("POLICY_APPROVAL_CLASSES")}
                    onChange={setApprovalClasses}
                    options={approvalOptions}
                    placeholder={t("POLICY_APPROVAL_CLASSES_PLACEHOLDER")}
                    selected={approvalClasses}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("POLICY_RETRY_LIMIT")}</Label>
                  <Select onValueChange={setRetryLimit} value={retryLimit}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("POLICY_RETRY_LIMIT_PLACEHOLDER")} />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 21 }, (_, value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="ai-policy-reason">{t("POLICY_REASON")}</Label>
                  <Input
                    id="ai-policy-reason"
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={t("POLICY_REASON_PLACEHOLDER")}
                    value={reason}
                  />
                </div>
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <Button disabled={pending !== null} onClick={() => void saveDraft()}>
                    {t("SAVE_DRAFT")}
                  </Button>
                  <Button
                    disabled={!draft || pending !== null}
                    onClick={() => void publish()}
                    variant="secondary"
                  >
                    {t("PUBLISH")}
                  </Button>
                  <Button
                    disabled={!published || pending !== null}
                    onClick={() => void apply()}
                    variant="outline"
                  >
                    {t("APPLY")}
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("POLICY_CURRENT_TITLE")}</CardTitle>
                <CardDescription>{t("POLICY_CURRENT_DESCRIPTION")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{t("POLICY_DRAFT_STATUS", { sequence: draft?.sequence ?? t("NONE") })}</p>
                <p>
                  {t("POLICY_PUBLISHED_STATUS", { sequence: published?.sequence ?? t("NONE") })}
                </p>
                <p>
                  {t("POLICY_APPLIED_STATUS", {
                    applied: published?.appliedAt ? t("YES") : t("NO"),
                  })}
                </p>
                <p>
                  {t("POLICY_MODEL_COUNT", {
                    count: draft?.allowedModels?.length ?? published?.allowedModels?.length ?? 0,
                  })}
                </p>
                <p>
                  {t("POLICY_TOOL_COUNT", {
                    count: draft?.toolAllowlist?.length ?? published?.toolAllowlist?.length ?? 0,
                  })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("POLICY_HISTORY_TITLE")}</CardTitle>
                <CardDescription>{t("POLICY_HISTORY_DESCRIPTION")}</CardDescription>
              </CardHeader>
              <CardContent>
                {revisions.length ? (
                  <ol className="space-y-3">
                    {revisions.map((revision) => (
                      <li
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                        key={revision.id}
                      >
                        <div>
                          <p className="font-medium">
                            {t("POLICY_REVISION_LABEL", { sequence: revision.sequence })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t(`POLICY_STATUS_${revision.status.toUpperCase()}`)} ·{" "}
                            {revision.contentHash.slice(0, 12)}
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {revision.appliedAt ? t("POLICY_APPLIED") : t("POLICY_NOT_APPLIED")}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("POLICY_HISTORY_EMPTY")}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </AiState>
    </AiPage>
  );
}

type PolicyOption = Readonly<{ id: string; label: string; description: string }>;

function PolicyMultiSelect(
  props: Readonly<{
    label: string;
    options: readonly PolicyOption[];
    placeholder: string;
    selected: readonly string[];
    onChange: (value: string[]) => void;
  }>,
) {
  const available = props.options.filter((option) => !props.selected.includes(option.id));
  return (
    <div className="space-y-2">
      <Select
        key={props.selected.join("|")}
        onValueChange={(value) => props.onChange([...props.selected, value])}
      >
        <SelectTrigger aria-label={props.label}>
          <SelectValue placeholder={props.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {available.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              <div>
                <div>{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {props.selected.length ? (
        <div className="flex flex-wrap gap-2">
          {props.selected.map((value) => (
            <Button
              key={value}
              onClick={() => props.onChange(props.selected.filter((item) => item !== value))}
              size="sm"
              type="button"
              variant="outline"
            >
              {value}
              <Trash2 aria-hidden="true" />
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
