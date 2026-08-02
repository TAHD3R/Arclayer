import { type ReactNode, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PageDataPlatformAiTaskOut,
  PageDataSystemAgentDefinitionSummaryOut,
  PlatformAiProviderReadinessOut,
  PlatformAiTaskOut,
  SystemAgentDefinitionSummaryOut,
  SystemAgentVersionOut,
  SystemAiProviderAvailabilityPreviewOut,
  SystemAiProviderListOut,
} from "@arclayer/platform-openapi";

import {
  applyAiProviderAvailability,
  createAiProvider,
  executeAiTaskAction,
  getAiProviderReadiness,
  listAiProviders,
  listAiTasks,
  previewAiProviderAvailability,
  testAiProviderReadiness,
  updateAiProvider,
} from "@/ai/ai-services-api";
import {
  listAiAssistants,
  retireAiAssistantVersion,
  updateAiAssistant,
} from "@/ai/ai-assistants-api";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import { Skeleton } from "@arclayer/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

type QueryState<T> = { status: string; data?: T };
type TaskAction = "retry" | "cancel" | "reconcile";
type TaskActionResult = Readonly<{ action: TaskAction; task: PlatformAiTaskOut }>;
type TaskActionFailure = Readonly<{ action: TaskAction; code: string }>;
type TaskActionReason = Readonly<{ copyKey: string; reasonCode: string | null }>;

const taskActionReasonCopyKeys: Readonly<Record<string, string>> = {
  AI_PLATFORM_TASK_RETRY_PORT_UNAVAILABLE: "ACTION_RETRY_PORT_UNAVAILABLE",
  AI_PLATFORM_TASK_CANCEL_PORT_UNAVAILABLE: "ACTION_CANCEL_PORT_UNAVAILABLE",
  AI_PLATFORM_TASK_RECONCILE_PORT_UNAVAILABLE: "ACTION_RECONCILE_PORT_UNAVAILABLE",
  AI_PLATFORM_TASK_RETRY_NOT_ELIGIBLE: "ACTION_RETRY_NOT_ELIGIBLE",
  AI_PLATFORM_TASK_CANCEL_NOT_ELIGIBLE: "ACTION_CANCEL_NOT_ELIGIBLE",
  AI_PLATFORM_TASK_RECONCILE_NOT_ELIGIBLE: "ACTION_RECONCILE_NOT_ELIGIBLE",
};

function AiPage(props: Readonly<{ title: string; description: string; children: ReactNode }>) {
  const { t } = useTranslation("ai");
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-7 px-5 py-8 md:px-8 md:py-10">
      <header className="max-w-3xl space-y-2">
        <p className="text-caption font-semibold tracking-[0.16em] text-label-secondary uppercase">
          {t("EYEBROW")}
        </p>
        <h1 className="text-largetitle">{props.title}</h1>
        <p className="text-body text-label-secondary">{props.description}</p>
      </header>
      {props.children}
    </section>
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
      reasonCode: "AI_PLATFORM_TASK_ACTION_AVAILABILITY_MISSING",
    };
  }
  if (availability.available && availability.stateEligible) return null;
  const reasonCode = availability.reasonCode ?? null;
  return {
    copyKey:
      (reasonCode ? taskActionReasonCopyKeys[reasonCode] : undefined) ??
      (availability.available ? "ACTION_STATE_NOT_ELIGIBLE" : "ACTION_PORT_UNAVAILABLE"),
    reasonCode,
  };
}

function taskActionErrorCode(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "PLATFORM_AI_SERVICES_REQUEST_FAILED";
}

export function AiTasksPage() {
  const { t } = useTranslation("ai");
  const load = useCallback(() => listAiTasks({ page: 1, size: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<TaskActionFailure | null>(null);
  const [result, setResult] = useState<TaskActionResult | null>(null);
  const idempotencyKeys = useRef<Map<string, string>>(new Map());
  const execute = async (task: PlatformAiTaskOut, action: TaskAction) => {
    const operationKey = `${task.id}:${action}`;
    const idempotencyKey = idempotencyKeys.current.get(operationKey) ?? crypto.randomUUID();
    idempotencyKeys.current.set(operationKey, idempotencyKey);
    setPending(operationKey);
    setFailure(null);
    setResult(null);
    try {
      const currentTask = await executeAiTaskAction(task.id, action, { idempotencyKey });
      idempotencyKeys.current.delete(operationKey);
      setResult({ action, task: currentTask });
      retry();
    } catch (error) {
      setFailure({ action, code: taskActionErrorCode(error) });
    } finally {
      setPending(null);
    }
  };
  return (
    <AiPage description={t("TASKS_DESCRIPTION")} title={t("TASKS_TITLE")}>
      {result ? (
        <Alert>
          <AlertTitle>{t("TASK_ACTION_RESULT_TITLE")}</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>
              {t("TASK_ACTION_RESULT_DESCRIPTION", {
                action: t(`ACTION_${result.action.toUpperCase()}`),
                outcome: t(`OUTCOME_${result.task.outcome.toUpperCase()}`),
              })}
            </p>
            <p>{t("TASK_ACTION_RESULT_SEQUENCE", { sequence: result.task.lastSequence })}</p>
          </AlertDescription>
        </Alert>
      ) : null}
      {failure ? (
        <Alert variant="destructive">
          <AlertTitle>{t("TASK_ACTION_UNCONFIRMED")}</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>{t("TASK_ACTION_UNCONFIRMED_DESCRIPTION")}</p>
            <code>{failure.code}</code>
          </AlertDescription>
        </Alert>
      ) : null}
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
                    <TableHead>{t("ACTIONS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-mono text-caption">{task.workspaceId}</TableCell>
                      <TableCell>
                        <Badge variant={task.outcome === "failed" ? "destructive" : "outline"}>
                          {t(`OUTCOME_${task.outcome.toUpperCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>{task.executionMode}</TableCell>
                      <TableCell className="space-y-1">
                        <p>{task.statusKey ?? task.durableJobStatus ?? t("NO_PROGRESS")}</p>
                        <p className="text-caption text-label-secondary">
                          {t("EVIDENCE_SEQUENCE", { sequence: task.lastSequence })}
                        </p>
                        {task.errorCode ? <code>{task.errorCode}</code> : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
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
                                  title={reason?.reasonCode ?? undefined}
                                  variant={action === "cancel" ? "outline" : "secondary"}
                                >
                                  {pending === `${task.id}:${action}`
                                    ? t("WORKING")
                                    : t(`ACTION_${action.toUpperCase()}`)}
                                </Button>
                                {reason ? (
                                  <p
                                    className="mt-1 max-w-48 text-caption text-label-secondary"
                                    id={reasonId}
                                  >
                                    {t(reason.copyKey)}
                                    {reason.reasonCode ? (
                                      <code className="block">{reason.reasonCode}</code>
                                    ) : null}
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
    </AiPage>
  );
}

type ProviderData = Readonly<{
  readiness: PlatformAiProviderReadinessOut;
  providers: SystemAiProviderListOut;
}>;

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
  return (
    <AiPage description={t("PROVIDERS_DESCRIPTION")} title={t("PROVIDERS_TITLE")}>
      <AiState empty={() => false} retry={retry} state={state}>
        {(data) => <ProviderConsole data={data} onRefresh={retry} />}
      </AiState>
    </AiPage>
  );
}

function ProviderConsole(props: Readonly<{ data: ProviderData; onRefresh: () => void }>) {
  const { t } = useTranslation("ai");
  const [preview, setPreview] = useState<SystemAiProviderAvailabilityPreviewOut | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const readinessById = new Map(props.data.readiness.items.map((item) => [item.id, item]));
  const doAction = async (key: string, operation: () => Promise<unknown>) => {
    setPending(key);
    setMessage(null);
    try {
      await operation();
      props.onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("ACTION_FAILED"));
    } finally {
      setPending(null);
    }
  };
  return (
    <div className="space-y-5">
      {message ? (
        <Alert variant="destructive">
          <AlertTitle>{t("ACTION_FAILED")}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("PROVIDER_READINESS")}</CardTitle>
          <CardDescription>
            {props.data.readiness.missingPrerequisiteCodes.length
              ? t("PROVIDER_MISSING")
              : t("PROVIDER_READY")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {props.data.providers.providers?.map((provider) => {
            const readiness = readinessById.get(provider.id);
            const ready = readiness?.routable && readiness.health === "healthy";
            const test = readiness?.actions.find((action) => action.action === "test_readiness");
            const availability = readiness?.actions.find(
              (action) => action.action === (provider.isActive ? "disable" : "enable"),
            );
            return (
              <div className="border-t py-3" key={provider.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{provider.label}</p>
                    <p className="text-footnote text-label-secondary">
                      {provider.provider} · {provider.requestModel}
                    </p>
                  </div>
                  <Badge variant={ready ? "secondary" : "outline"}>
                    {ready ? t("READY") : t("NOT_READY")}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    disabled={!test?.available || pending === `test:${provider.id}`}
                    onClick={() =>
                      void doAction(`test:${provider.id}`, () =>
                        testAiProviderReadiness(provider.id),
                      )
                    }
                    size="sm"
                    variant="outline"
                  >
                    {t("TEST_READINESS")}
                  </Button>
                  <Button
                    disabled={!availability?.available || pending === `preview:${provider.id}`}
                    onClick={() =>
                      void doAction(`preview:${provider.id}`, async () =>
                        setPreview(
                          await previewAiProviderAvailability(provider.id, !provider.isActive),
                        ),
                      )
                    }
                    size="sm"
                    variant="outline"
                  >
                    {provider.isActive ? t("DISABLE") : t("ENABLE")}
                  </Button>
                  <Button
                    disabled={pending === `label:${provider.id}`}
                    onClick={() => {
                      const label = window.prompt(t("PROVIDER_LABEL_PROMPT"), provider.label);
                      if (label?.trim())
                        void doAction(`label:${provider.id}`, () =>
                          updateAiProvider(provider.id, { label: label.trim() }),
                        );
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    {t("EDIT_LABEL")}
                  </Button>
                  {readiness?.actions
                    .filter(
                      (action) =>
                        ["rotate_credentials", "remove_credentials"].includes(action.action) &&
                        !action.available,
                    )
                    .map((action) => (
                      <span
                        className="self-center text-caption text-label-secondary"
                        key={action.action}
                      >
                        {t(`UNAVAILABLE_${action.action.toUpperCase()}`)}: {action.reasonCode}
                      </span>
                    ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      {preview ? (
        <Alert>
          <AlertTitle>{t("AVAILABILITY_PREVIEW")}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {preview.wouldLeaveNoRoutableProvider
                ? t("NO_ROUTABLE_PROVIDER_WARNING")
                : t("ROUTABLE_PROVIDER_COUNT", { count: preview.routableProviderCountAfter })}
            </p>
            <div className="flex gap-2">
              <Button
                disabled={pending === `apply:${preview.id}`}
                onClick={() =>
                  void doAction(`apply:${preview.id}`, () =>
                    applyAiProviderAvailability(
                      preview.id,
                      preview.desiredIsActive,
                      preview.revision,
                    ).then(() => setPreview(null)),
                  )
                }
                size="sm"
              >
                {t("CONFIRM")}
              </Button>
              <Button onClick={() => setPreview(null)} size="sm" variant="outline">
                {t("CANCEL")}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
      <ProviderCreateForm onCreated={props.onRefresh} />
    </div>
  );
}

function ProviderCreateForm(props: Readonly<{ onCreated: () => void }>) {
  const { t } = useTranslation("ai");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("ADD_PROVIDER")}</CardTitle>
        <CardDescription>{t("ADD_PROVIDER_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            setPending(true);
            setError(null);
            void createAiProvider({
              label: String(values.get("label") ?? ""),
              provider: String(values.get("provider") ?? ""),
              compatibility: "openai_compatible",
              providerApiKey: String(values.get("apiKey") ?? ""),
              requestModel: String(values.get("model") ?? ""),
              baseUrl: String(values.get("baseUrl") ?? "") || null,
            })
              .then(
                () => {
                  event.currentTarget.reset();
                  props.onCreated();
                },
                (reason: unknown) =>
                  setError(reason instanceof Error ? reason.message : t("ACTION_FAILED")),
              )
              .finally(() => setPending(false));
          }}
        >
          <Input aria-label={t("LABEL")} name="label" placeholder={t("LABEL")} required />
          <Input aria-label={t("PROVIDER")} name="provider" placeholder={t("PROVIDER")} required />
          <Input aria-label={t("MODEL")} name="model" placeholder={t("MODEL")} required />
          <Input aria-label={t("BASE_URL")} name="baseUrl" placeholder={t("BASE_URL")} />
          <Input
            aria-label={t("API_KEY")}
            name="apiKey"
            placeholder={t("API_KEY")}
            required
            type="password"
          />
          <div className="flex items-center gap-3">
            <Button disabled={pending} type="submit">
              {pending ? t("WORKING") : t("ADD_PROVIDER")}
            </Button>
            {error ? <span className="text-footnote text-destructive">{error}</span> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function AiAssistantsPage() {
  const { t } = useTranslation("ai");
  const load = useCallback(() => listAiAssistants({ scope: "system", page: 1, size: 100 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  const [pending, setPending] = useState<string | null>(null);
  const changeLifecycle = async (
    assistant: SystemAgentDefinitionSummaryOut,
    lifecycleState: "active" | "disabled" | "archived",
  ) => {
    setPending(assistant.id);
    try {
      await updateAiAssistant(assistant.id, { lifecycleState });
      retry();
    } finally {
      setPending(null);
    }
  };
  return (
    <AiPage description={t("ASSISTANTS_DESCRIPTION")} title={t("ASSISTANTS_TITLE")}>
      <AiState
        empty={(data: PageDataSystemAgentDefinitionSummaryOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardContent className="px-0">
              <ul>
                {data.items?.map((assistant) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4"
                    key={assistant.id}
                  >
                    <div>
                      <p className="font-medium">{assistant.displayName}</p>
                      <p className="text-footnote text-label-secondary">{assistant.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={assistant.isOfficial ? "secondary" : "outline"}>
                        {assistant.lifecycleState}
                      </Badge>
                      <Button
                        disabled={pending === assistant.id || assistant.lifecycleState === "active"}
                        onClick={() => void changeLifecycle(assistant, "active")}
                        size="sm"
                        variant="outline"
                      >
                        {t("ENABLE")}
                      </Button>
                      <Button
                        disabled={
                          pending === assistant.id || assistant.lifecycleState === "disabled"
                        }
                        onClick={() => void changeLifecycle(assistant, "disabled")}
                        size="sm"
                        variant="outline"
                      >
                        {t("DISABLE")}
                      </Button>
                      <Button
                        disabled={
                          pending === assistant.id || assistant.lifecycleState === "archived"
                        }
                        onClick={() => void changeLifecycle(assistant, "archived")}
                        size="sm"
                        variant="ghost"
                      >
                        {t("ARCHIVE")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </AiState>
    </AiPage>
  );
}

export function AiPoliciesPage() {
  const { t } = useTranslation("ai");
  const load = useCallback(() => listAiAssistants({ scope: "system", page: 1, size: 100 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  const [pending, setPending] = useState<string | null>(null);
  const transition = async (assistantId: string, version: SystemAgentVersionOut) => {
    setPending(version.id);
    try {
      await retireAiAssistantVersion(assistantId, version.id, {
        state: version.state === "draft" ? "published" : "retired",
      });
      retry();
    } finally {
      setPending(null);
    }
  };
  return (
    <AiPage description={t("POLICIES_DESCRIPTION")} title={t("POLICIES_TITLE")}>
      <AiState
        empty={(data: PageDataSystemAgentDefinitionSummaryOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <div className="grid gap-4">
            {data.items?.map((assistant) => {
              const version = assistant.latestVersion;
              return (
                <Card key={assistant.id}>
                  <CardHeader>
                    <CardTitle>{assistant.displayName}</CardTitle>
                    <CardDescription>
                      {version
                        ? t("POLICY_SUMMARY", { modes: version.supportedExecutionModes.join(", ") })
                        : t("NO_POLICY_VERSION")}
                    </CardDescription>
                  </CardHeader>
                  {version ? (
                    <CardContent className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-footnote text-label-secondary">
                        <p>
                          {t("POLICY_APPROVAL", { profile: version.approvalProfile.profileId })}
                        </p>
                        <p>
                          {t("POLICY_ROUTING", {
                            routing: version.modelPolicy.routingPolicy ?? "workspace_default",
                          })}
                        </p>
                      </div>
                      <Button
                        disabled={pending === version.id || version.state === "retired"}
                        onClick={() => void transition(assistant.id, version)}
                        size="sm"
                        variant="outline"
                      >
                        {version.state === "draft" ? t("PUBLISH") : t("RETIRE")}
                      </Button>
                    </CardContent>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </AiState>
    </AiPage>
  );
}
