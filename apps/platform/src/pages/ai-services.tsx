import { type ReactNode, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type {
  PageDataPlatformAiTaskOut,
  PlatformAiProviderReadinessOut,
  PageDataSystemAgentDefinitionSummaryOut,
} from "@arclayer/platform-openapi";

import { getAiProviderReadiness, listAiTasks } from "@/ai/ai-services-api";
import { listAiAssistants } from "@/ai/ai-assistants-api";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@arclayer/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@arclayer/ui/empty";
import { Skeleton } from "@arclayer/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

function AiPage({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-7 px-5 py-8 md:px-8 md:py-10">
      <header className="max-w-3xl space-y-2">
        <p className="text-caption font-semibold tracking-[0.16em] text-label-secondary uppercase">
          AI services
        </p>
        <h1 className="text-largetitle">{title}</h1>
        <p className="text-body text-label-secondary">{description}</p>
      </header>
      {children}
    </section>
  );
}

function AiState<T>({
  state,
  retry,
  empty,
  children,
}: Readonly<{
  state: { status: string; data?: T };
  retry: () => void;
  empty: (data: T) => boolean;
  children: (data: T) => ReactNode;
}>) {
  const { t } = useTranslation("ai");
  if (state.status === "loading")
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  if (state.status === "error")
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("ERROR_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("ERROR_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
        <button className="rounded border px-3 py-2" onClick={retry} type="button">
          {t("RETRY")}
        </button>
      </Empty>
    );
  if (!state.data || empty(state.data))
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("EMPTY_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("EMPTY_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return children(state.data);
}

export function AiTasksPage() {
  const { t } = useTranslation("ai");
  const load = useCallback(() => listAiTasks({ page: 1, size: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <AiPage title={t("TASKS_TITLE")} description={t("TASKS_DESCRIPTION")}>
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
                    <TableHead>{t("PROGRESS")}</TableHead>
                    <TableHead>{t("LAST_PROGRESS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-caption">{item.workspaceId}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === "failed" ? "destructive" : "outline"}>
                          {t(`STATUS_${item.status.toUpperCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.executionMode}</TableCell>
                      <TableCell>
                        {item.progressTotal
                          ? `${item.progressCompleted}/${item.progressTotal}`
                          : item.progressCompleted}
                      </TableCell>
                      <TableCell>
                        {item.statusKey ??
                          item.interruptReason ??
                          item.errorCode ??
                          t("NO_PROGRESS")}
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

export function AiProvidersPage() {
  const { t } = useTranslation("ai");
  const load = useCallback(() => getAiProviderReadiness(), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <AiPage title={t("PROVIDERS_TITLE")} description={t("PROVIDERS_DESCRIPTION")}>
      <AiState empty={() => false} retry={retry} state={state}>
        {(data: PlatformAiProviderReadinessOut) => (
          <Card>
            <CardHeader>
              <CardTitle>{t("PROVIDER_READINESS")}</CardTitle>
              <CardDescription>
                {data.missingPrerequisiteCodes.length ? t("PROVIDER_MISSING") : t("PROVIDER_READY")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.items.map((provider) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 border-t py-3"
                  key={provider.id}
                >
                  <div>
                    <p className="font-medium">{provider.label}</p>
                    <p className="text-footnote text-label-secondary">
                      {provider.provider} · {provider.requestModel}
                    </p>
                  </div>
                  <Badge
                    variant={provider.isActive && provider.configured ? "secondary" : "outline"}
                  >
                    {provider.isActive && provider.configured ? t("READY") : t("NOT_READY")}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </AiState>
    </AiPage>
  );
}

export function AiAssistantsPage() {
  const { t } = useTranslation("ai");
  const load = useCallback(
    () => listAiAssistants({ scope: "system", lifecycleState: "active", page: 1, size: 100 }),
    [],
  );
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <AiPage title={t("ASSISTANTS_TITLE")} description={t("ASSISTANTS_DESCRIPTION")}>
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
                    <Badge variant={assistant.isOfficial ? "secondary" : "outline"}>
                      {assistant.isOfficial ? t("OFFICIAL") : t("CUSTOM")}
                    </Badge>
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
