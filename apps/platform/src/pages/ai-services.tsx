import { Pencil, Plus } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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

import {
  applyAiProviderAvailability,
  executeAiTaskAction,
  getAiProviderReadiness,
  listAiProviders,
  listAiTasks,
  previewAiProviderAvailability,
  testAiProviderReadiness,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  return (
    <PlatformPage description={props.description} title={props.title}>
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
                      <TableCell className="font-mono text-xs">{task.workspaceId}</TableCell>
                      <TableCell>
                        <Badge variant={task.outcome === "failed" ? "destructive" : "outline"}>
                          {t(`OUTCOME_${task.outcome.toUpperCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>{task.executionMode}</TableCell>
                      <TableCell className="space-y-1">
                        <p>{task.statusKey ?? task.durableJobStatus ?? t("NO_PROGRESS")}</p>
                        <p className="text-xs text-muted-foreground">
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
                                    className="mt-1 max-w-48 text-xs text-muted-foreground"
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
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [providerEditor, setProviderEditor] = useState<"create" | SystemAiProviderOut | null>(null);
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
      <div className="flex justify-end">
        <Button onClick={() => setProviderEditor("create")}>
          <Plus aria-hidden="true" />
          {t("ADD_PROVIDER")}
        </Button>
      </div>
      {successKey ? (
        <Alert>
          <AlertDescription>{t(successKey)}</AlertDescription>
        </Alert>
      ) : null}
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
                    <p className="text-sm text-muted-foreground">
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
                    disabled={pending === `edit:${provider.id}`}
                    onClick={() => setProviderEditor(provider)}
                    size="sm"
                    variant="ghost"
                  >
                    <Pencil aria-hidden="true" />
                    {t("EDIT_PROVIDER")}
                  </Button>
                  {readiness?.actions
                    .filter(
                      (action) =>
                        ["rotate_credentials", "remove_credentials"].includes(action.action) &&
                        !action.available,
                    )
                    .map((action) => (
                      <span
                        className="self-center text-xs text-muted-foreground"
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
      {providerEditor ? (
        <AiProviderEditorDialog
          open
          onCompleted={(key) => {
            setSuccessKey(key);
            props.onRefresh();
          }}
          onOpenChange={(open) => !open && setProviderEditor(null)}
          provider={providerEditor === "create" ? undefined : providerEditor}
        />
      ) : null}
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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changeLifecycle = async (
    assistant: SystemAgentDefinitionSummaryOut,
    lifecycleState: "active" | "disabled" | "archived",
  ) => {
    setPending(`assistant:${assistant.id}`);
    setError(null);
    try {
      await updateAiAssistant(assistant.id, { lifecycleState });
      setMessage(t("ASSISTANT_UPDATED"));
      retry();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("ACTION_FAILED"));
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
    setError(null);
    try {
      await retireAiAssistantVersion(assistant.id, version.id, { state });
      setMessage(
        t(state === "published" ? "ASSISTANT_VERSION_PUBLISHED" : "ASSISTANT_VERSION_RETIRED"),
      );
      retry();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("ACTION_FAILED"));
    } finally {
      setPending(null);
    }
  };
  return (
    <AiPage description={t("ASSISTANTS_DESCRIPTION")} title={t("ASSISTANTS_TITLE")}>
      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("ACTION_FAILED")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
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
                <Alert>
                  <AlertTitle>{t("ASSISTANT_PUBLICATION_UNAVAILABLE_TITLE")}</AlertTitle>
                  <AlertDescription>
                    {t("ASSISTANT_PUBLICATION_UNAVAILABLE_DESCRIPTION")}
                  </AlertDescription>
                </Alert>
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
                              <span className="text-xs text-muted-foreground">
                                {t("ARCHIVED_ASSISTANT_READ_ONLY")}
                              </span>
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
                  assistant={editor === "create" ? undefined : editor}
                  onCompleted={() => {
                    setMessage(t(editor === "create" ? "ASSISTANT_CREATED" : "ASSISTANT_UPDATED"));
                    retry();
                  }}
                  onOpenChange={(open) => !open && setEditor(null)}
                  open
                  supportedToolGrants={data.capabilities.supportedToolGrants}
                />
              ) : null}
              {versionEditor ? (
                <AiAssistantVersionDialog
                  approvalProfiles={approvalProfiles}
                  assistant={versionEditor}
                  onCompleted={() => {
                    setMessage(t("ASSISTANT_VERSION_CREATED"));
                    retry();
                  }}
                  onOpenChange={(open) => !open && setVersionEditor(null)}
                  open
                  supportedToolGrants={data.capabilities.supportedToolGrants}
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
  return (
    <AiPage description={t("POLICIES_DESCRIPTION")} title={t("POLICIES_TITLE")}>
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("POLICIES_UNAVAILABLE_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("POLICIES_UNAVAILABLE_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </AiPage>
  );
}
