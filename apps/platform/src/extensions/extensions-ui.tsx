import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  ExtensionConnectionListOut,
  PageDataSystemPluginOperationOut,
  SystemPluginCatalogItemOut,
  SystemPluginCatalogListOut,
  SystemPluginOperationOut,
} from "@arclayer/platform-openapi";

import {
  getExtensionOperation,
  listExtensionCatalog,
  listExtensionConnections,
  listExtensionOperations,
  listInstalledExtensions,
} from "@/extensions/extensions-api";
import { ExtensionInstallDialog } from "@/extensions/extension-lifecycle-dialogs";
import { PlatformPage } from "@/components/platform-page";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type LoadState<T> = Readonly<{ status: string; data?: T }>;

const OPERATION_REFRESH_INTERVAL_MS = 3_000;

function ExtensionPage({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <PlatformPage description={description} title={title}>
      {children}
    </PlatformPage>
  );
}

function ExtensionState<T>({
  state,
  retry,
  empty,
  children,
  errorTitle = "ERROR_TITLE",
  errorDescription = "ERROR_DESCRIPTION",
}: Readonly<{
  state: LoadState<T>;
  retry: () => void;
  empty: (data: T) => boolean;
  children: (data: T) => ReactNode;
  errorTitle?: string;
  errorDescription?: string;
}>) {
  const { t } = useTranslation("extensions");
  if (state.status === "loading")
    return (
      <div className="space-y-3" aria-busy="true" role="status">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  if (state.status === "error")
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t(errorTitle)}</EmptyTitle>
          <EmptyDescription>{t(errorDescription)}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={retry} variant="outline">
            {t("RETRY")}
          </Button>
        </EmptyContent>
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

function ExtensionIdentity({ item }: Readonly<{ item: SystemPluginCatalogItemOut }>) {
  const { t } = useTranslation("extensions");
  return (
    <div className="space-y-1">
      <p className="font-medium">{item.name}</p>
      <p className="text-sm text-muted-foreground">
        {sourceLabel(t, item.sourceType)} · {item.sourceLocator}
      </p>
    </div>
  );
}

function sourceLabel(
  t: ReturnType<typeof useTranslation>["t"],
  sourceType: SystemPluginCatalogItemOut["sourceType"],
): string {
  return t(`SOURCE_${sourceType.toUpperCase()}`);
}

function configurationReadinessKey(readiness: unknown): string {
  return `CONFIGURATION_${String(readiness).toUpperCase()}`;
}

function configurationReadinessBadgeVariant(readiness: unknown) {
  const value = String(readiness);
  if (value === "ready") return "secondary";
  if (value === "unavailable") return "destructive";
  return "outline";
}

function operationNeedsRefresh(operation: SystemPluginOperationOut): boolean {
  return (
    operation.completedAt === null ||
    (operation.state === "succeeded" && !operation.activationVerified)
  );
}

function diagnosticMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function operationStateLabelKey(operation: SystemPluginOperationOut): string {
  return operation.state === "succeeded" && !operation.activationVerified
    ? "HISTORY_STATE_SUCCEEDED_PENDING_VERIFICATION"
    : `HISTORY_STATE_${operation.state.toUpperCase()}`;
}

function OperationStateBadge({ operation }: Readonly<{ operation: SystemPluginOperationOut }>) {
  const { t } = useTranslation("extensions");
  return (
    <Badge variant={operation.state === "failed" ? "destructive" : "outline"}>
      {t(operationStateLabelKey(operation))}
    </Badge>
  );
}

function OperationProgress({ operation }: Readonly<{ operation: SystemPluginOperationOut }>) {
  const { t } = useTranslation("extensions");
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">
        {operation.progressTotal === null
          ? t("OPERATION_PROGRESS_NOT_REPORTED")
          : t("OPERATION_PROGRESS_VALUE", {
              completed: operation.progressCompleted,
              total: operation.progressTotal,
            })}
      </p>
      {operation.progressTotal !== null && operation.progressTotal > 0 ? (
        <progress
          aria-label={t("HISTORY_PROGRESS")}
          className="h-2 w-full accent-primary"
          max={operation.progressTotal}
          value={operation.progressCompleted}
        />
      ) : null}
    </div>
  );
}

function ExtensionOperationReceipt({
  operation,
}: Readonly<{ operation: SystemPluginOperationOut }>) {
  const { t } = useTranslation("extensions");
  return (
    <div
      aria-live="polite"
      className="space-y-2 rounded-lg border bg-card p-3"
      data-operation-id={operation.id}
      role="status"
    >
      <p className="text-sm text-muted-foreground">{t("OPERATION_TRACKING")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <OperationStateBadge operation={operation} />
        <span className="text-sm text-muted-foreground">
          {operation.activationVerified ? t("ACTIVATION_VERIFIED") : t("ACTIVATION_PENDING")}
        </span>
        <Link
          className="text-sm font-medium text-primary underline"
          search={{ operationId: operation.id }}
          to="/extensions/history"
        >
          {t("INSPECT_OPERATION")}
        </Link>
      </div>
      <OperationProgress operation={operation} />
    </div>
  );
}

function ExtensionOperationReceipts({
  operations,
}: Readonly<{ operations: readonly SystemPluginOperationOut[] }>) {
  if (!operations.length) return null;
  return (
    <div className="space-y-2">
      {operations.map((operation) => (
        <ExtensionOperationReceipt key={operation.id} operation={operation} />
      ))}
    </div>
  );
}

function OperationEvidenceFailure({
  error,
  hasCurrentRecord,
}: Readonly<{ error: unknown; hasCurrentRecord: boolean }>) {
  const { t } = useTranslation("extensions");
  return (
    <p className="text-sm text-destructive" role="alert">
      {t(hasCurrentRecord ? "OPERATION_EVIDENCE_STALE" : "OPERATION_EVIDENCE_UNAVAILABLE")}{" "}
      {t("OPERATION_ERROR_DETAILS")}: {diagnosticMessage(error)}
    </p>
  );
}

type ExtensionOperationQueryState = Readonly<{
  operationId: string;
  data?: SystemPluginOperationOut;
  error?: unknown;
  refreshing: boolean;
}>;

function useExtensionOperation(operationId: string) {
  const [reloadVersion, setReloadVersion] = useState(0);
  const [state, setState] = useState<ExtensionOperationQueryState>({
    operationId,
    refreshing: true,
  });
  const retry = useCallback(() => setReloadVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState((current) =>
      current.operationId === operationId
        ? { ...current, error: undefined, refreshing: true }
        : { operationId, refreshing: true },
    );
    void getExtensionOperation(operationId).then(
      (data) => {
        if (!cancelled) setState({ operationId, data, refreshing: false });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState((current) => ({
            operationId,
            data: current.operationId === operationId ? current.data : undefined,
            error,
            refreshing: false,
          }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [operationId, reloadVersion]);

  const operation = state.operationId === operationId ? state.data : undefined;
  useEffect(() => {
    if (!operation || state.refreshing || !operationNeedsRefresh(operation)) return;
    const timeoutId = window.setTimeout(retry, OPERATION_REFRESH_INTERVAL_MS);
    return () => window.clearTimeout(timeoutId);
  }, [operation, retry, state.refreshing]);

  return {
    error: state.operationId === operationId ? state.error : undefined,
    loading: state.operationId !== operationId || (state.refreshing && !operation),
    operation,
    refreshing: state.refreshing && Boolean(operation),
    retry,
  };
}

function ExtensionOperationDetails({
  operation,
  refreshing,
  retry,
}: Readonly<{
  operation: SystemPluginOperationOut;
  refreshing: boolean;
  retry: () => void;
}>) {
  const { t } = useTranslation("extensions");
  return (
    <Card data-operation-id={operation.id}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>
              {t("OPERATION_DETAILS_TITLE", { extension: operation.pluginName })}
            </CardTitle>
            <CardDescription>{t("OPERATION_DETAILS_DESCRIPTION")}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <OperationStateBadge operation={operation} />
            <Button loading={refreshing} onClick={retry} size="sm" variant="outline">
              {t("REFRESH_OPERATION")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <OperationProgress operation={operation} />
        <dl className="grid gap-4 text-base sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-sm text-muted-foreground">{t("HISTORY_KIND")}</dt>
            <dd>{t(`HISTORY_KIND_${operation.kind.toUpperCase()}`)}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-sm text-muted-foreground">{t("ACTIVATION")}</dt>
            <dd>
              {operation.activationVerified ? t("ACTIVATION_VERIFIED") : t("ACTIVATION_PENDING")}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-sm text-muted-foreground">{t("HISTORY_COMPLETED")}</dt>
            <dd>
              {operation.completedAt
                ? new Date(operation.completedAt).toLocaleString()
                : t("NOT_COMPLETED")}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-sm text-muted-foreground">{t("OPERATION_REQUESTED_VERSION")}</dt>
            <dd>{operation.requestedVersion ?? t("NOT_SPECIFIED")}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-sm text-muted-foreground">{t("OPERATION_RETRY")}</dt>
            <dd>{operation.retryable ? t("OPERATION_RETRYABLE") : t("OPERATION_NOT_RETRYABLE")}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-sm text-muted-foreground">{t("OPERATION_RESTART")}</dt>
            <dd>
              {operation.restartRequired
                ? t("OPERATION_RESTART_REQUIRED")
                : t("OPERATION_RESTART_NOT_REQUIRED")}
            </dd>
          </div>
        </dl>
        {operation.failureSummary ? (
          <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-sm font-medium">{t("OPERATION_FAILURE")}</p>
            <p className="text-sm text-muted-foreground">{operation.failureSummary}</p>
          </div>
        ) : null}
        {operation.migrationWarnings.length ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("OPERATION_WARNINGS")}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {operation.migrationWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <dl className="grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-muted-foreground">{t("OPERATION_REFERENCE")}</dt>
            <dd className="break-all font-mono">{operation.id}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-muted-foreground">{t("OPERATION_PHASE")}</dt>
            <dd className="break-all font-mono">{operation.phase}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function ExtensionOperationInspector({ operationId }: Readonly<{ operationId: string }>) {
  const { t } = useTranslation("extensions");
  const { error, loading, operation, refreshing, retry } = useExtensionOperation(operationId);
  if (loading)
    return (
      <div aria-busy="true" className="space-y-3" role="status">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  if (!operation)
    return (
      <Empty className="min-h-56 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("OPERATION_DETAILS_ERROR_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("OPERATION_DETAILS_ERROR_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {error ? <OperationEvidenceFailure error={error} hasCurrentRecord={false} /> : null}
          <Button onClick={retry} variant="outline">
            {t("RETRY")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  return (
    <div className="space-y-3">
      {error ? <OperationEvidenceFailure error={error} hasCurrentRecord /> : null}
      <ExtensionOperationDetails operation={operation} refreshing={refreshing} retry={retry} />
    </div>
  );
}

function ExtensionsTable({ items }: Readonly<{ items: SystemPluginCatalogItemOut[] }>) {
  const { t } = useTranslation("extensions");
  return (
    <Card>
      <CardContent className="overflow-x-auto pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("NAME")}</TableHead>
              <TableHead>{t("VERSION")}</TableHead>
              <TableHead>{t("TRUST")}</TableHead>
              <TableHead>{t("COMPATIBILITY")}</TableHead>
              <TableHead>{t("CAPABILITIES")}</TableHead>
              <TableHead>{t("STATE")}</TableHead>
              <TableHead>{t("DETAILS")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.name}>
                <TableCell>
                  <ExtensionIdentity item={item} />
                </TableCell>
                <TableCell>{item.installedVersion ?? item.availableVersion}</TableCell>
                <TableCell>
                  <Badge variant={item.provenanceStatus === "verified" ? "secondary" : "outline"}>
                    {t(`PROVENANCE_${item.provenanceStatus.toUpperCase()}`)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={item.compatibility.compatible ? "secondary" : "destructive"}>
                    {item.compatibility.compatible ? t("COMPATIBLE") : t("INCOMPATIBLE")}
                  </Badge>
                </TableCell>
                <TableCell>
                  {[...(item.provides.providers ?? []), ...(item.provides.connectors ?? [])].join(
                    ", ",
                  ) || t("NONE")}
                </TableCell>
                <TableCell>
                  {item.lifecycleState
                    ? t(`LIFECYCLE_${item.lifecycleState.toUpperCase()}`)
                    : t("STATE_UNKNOWN")}
                </TableCell>
                <TableCell>
                  <Link
                    className="text-sm font-medium text-primary underline"
                    params={{ pluginId: item.name }}
                    to="/extensions/$pluginId"
                  >
                    {t("OPEN_DETAILS")}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function ExtensionsInstalledPage() {
  const { t } = useTranslation("extensions");
  const load = useCallback(() => listInstalledExtensions(), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <ExtensionPage title={t("INSTALLED_TITLE")} description={t("INSTALLED_DESCRIPTION")}>
      <ExtensionState
        empty={(data: SystemPluginCatalogListOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => <ExtensionsTable items={data.items ?? []} />}
      </ExtensionState>
    </ExtensionPage>
  );
}

export function ExtensionsCatalogPage() {
  const { t } = useTranslation("extensions");
  const load = useCallback(
    () => listExtensionCatalog({ includeOnline: true, installedOnly: false }),
    [],
  );
  const { state, retry } = useMonitoringQuery(load, []);
  const [installingItem, setInstallingItem] = useState<SystemPluginCatalogItemOut>();
  const [operations, setOperations] = useState<SystemPluginOperationOut[]>([]);
  const recordOperation = (operation: SystemPluginOperationOut) => {
    setOperations((current) => [
      operation,
      ...current.filter((record) => record.id !== operation.id),
    ]);
    retry();
  };
  return (
    <ExtensionPage title={t("CATALOG_TITLE")} description={t("CATALOG_DESCRIPTION")}>
      <ExtensionState
        empty={(data: SystemPluginCatalogListOut) => !data.items?.length}
        errorDescription="CATALOG_ERROR_DESCRIPTION"
        errorTitle="CATALOG_ERROR_TITLE"
        retry={retry}
        state={state}
      >
        {(data) => (
          <div className="grid gap-4 md:grid-cols-2">
            {data.items?.map((item) => (
              <Card key={item.name}>
                <CardHeader>
                  <CardTitle>{item.name}</CardTitle>
                  <CardDescription>
                    {sourceLabel(t, item.sourceType)} · {item.availableVersion}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={item.provenanceStatus === "verified" ? "secondary" : "outline"}>
                      {t(`PROVENANCE_${item.provenanceStatus.toUpperCase()}`)}
                    </Badge>
                    <Badge variant={item.compatibility.compatible ? "secondary" : "destructive"}>
                      {item.compatibility.compatible ? t("COMPATIBLE") : t("INCOMPATIBLE")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("PERMISSIONS")}: {item.permissions?.join(", ") || t("NONE")}
                  </p>
                  {item.installedVersion ? (
                    <Link
                      className="text-sm font-medium text-primary underline"
                      params={{ pluginId: item.name }}
                      to="/extensions/$pluginId"
                    >
                      {t("OPEN_DETAILS")}
                    </Link>
                  ) : (
                    <Button
                      disabled={
                        !item.compatibility.compatible || item.provenanceStatus !== "verified"
                      }
                      onClick={() => setInstallingItem(item)}
                    >
                      {t("INSTALL")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ExtensionState>
      {installingItem ? (
        <ExtensionInstallDialog
          item={installingItem}
          onOpenChange={(open) => !open && setInstallingItem(undefined)}
          onOperationCreated={recordOperation}
          open
        />
      ) : null}
      <ExtensionOperationReceipts operations={operations} />
    </ExtensionPage>
  );
}

export function ExtensionsConnectionsPage() {
  const { t } = useTranslation("extensions");
  const load = useCallback(() => listExtensionConnections(), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <ExtensionPage title={t("CONNECTIONS_TITLE")} description={t("CONNECTIONS_DESCRIPTION")}>
      <ExtensionState
        empty={(data: ExtensionConnectionListOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardHeader>
              <CardTitle>{t("CONNECTIONS_INVENTORY")}</CardTitle>
              <CardDescription>{t("CONNECTIONS_INVENTORY_DESCRIPTION")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("CONNECTION")}</TableHead>
                    <TableHead>{t("EXTENSION")}</TableHead>
                    <TableHead>{t("RUNTIME")}</TableHead>
                    <TableHead>{t("CONFIGURATION")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.connectorKey}>
                      <TableCell>{item.connectorKey}</TableCell>
                      <TableCell>
                        {item.extensionName} · {item.extensionVersion}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.runtimeReady ? "secondary" : "destructive"}>
                          {item.runtimeReady ? t("RUNTIME_READY") : t("RUNTIME_NOT_READY")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={configurationReadinessBadgeVariant(
                              item.configurationReadiness,
                            )}
                          >
                            {t(configurationReadinessKey(item.configurationReadiness))}
                          </Badge>
                          <a
                            className="text-sm font-medium text-primary underline"
                            href={item.configurationDeepLink}
                          >
                            {t("OPEN_CONFIGURATION")}
                          </a>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </ExtensionState>
    </ExtensionPage>
  );
}

export function ExtensionsHistoryPage({ operationId }: Readonly<{ operationId?: string }>) {
  const { t } = useTranslation("extensions");
  const load = useCallback(() => listExtensionOperations({ page: 1, size: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <ExtensionPage title={t("HISTORY_TITLE")} description={t("HISTORY_DESCRIPTION")}>
      {operationId ? <ExtensionOperationInspector operationId={operationId} /> : null}
      <ExtensionState
        empty={(data: PageDataSystemPluginOperationOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("HISTORY_EXTENSION")}</TableHead>
                    <TableHead>{t("HISTORY_KIND")}</TableHead>
                    <TableHead>{t("HISTORY_STATE")}</TableHead>
                    <TableHead>{t("HISTORY_PROGRESS")}</TableHead>
                    <TableHead>{t("ACTIVATION")}</TableHead>
                    <TableHead>{t("HISTORY_COMPLETED")}</TableHead>
                    <TableHead>{t("HISTORY_DETAILS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.pluginName}</TableCell>
                      <TableCell>{t(`HISTORY_KIND_${item.kind.toUpperCase()}`)}</TableCell>
                      <TableCell>
                        <OperationStateBadge operation={item} />
                      </TableCell>
                      <TableCell>
                        <OperationProgress operation={item} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.activationVerified ? "secondary" : "outline"}>
                          {item.activationVerified
                            ? t("ACTIVATION_VERIFIED")
                            : t("ACTIVATION_PENDING")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.completedAt
                          ? new Date(item.completedAt).toLocaleString()
                          : t("NOT_COMPLETED")}
                      </TableCell>
                      <TableCell>
                        <Link
                          className="text-sm font-medium text-primary underline"
                          search={{ operationId: item.id }}
                          to="/extensions/history"
                        >
                          {t("INSPECT_OPERATION")}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </ExtensionState>
    </ExtensionPage>
  );
}
