import { Link } from "@tanstack/react-router";
import { useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  ExtensionConnectionListOut,
  PageDataSystemPluginOperationOut,
  SystemPluginCatalogListOut,
  SystemPluginListOut,
} from "@arclayer/platform-openapi";

import {
  listExtensionConnections,
  listExtensionCatalog,
  listExtensionOperations,
  listInstalledExtensions,
} from "@/extensions/extensions-api";
import { requireTrustedNavigationDestination } from "@/capabilities/module-registry";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@arclayer/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@arclayer/ui/empty";
import { Skeleton } from "@arclayer/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

function ExtensionsPage({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-7 px-5 py-8 md:px-8 md:py-10">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-largetitle">{title}</h1>
        <p className="text-body text-label-secondary">{description}</p>
      </header>
      {children}
    </section>
  );
}

function ExtensionState<T>({
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
  const { t } = useTranslation("extensions");
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

export function ExtensionsInstalledPage() {
  const { t } = useTranslation("extensions");
  const load = useCallback(() => listInstalledExtensions(), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <ExtensionsPage title={t("INSTALLED_TITLE")} description={t("INSTALLED_DESCRIPTION")}>
      <ExtensionState
        empty={(data: SystemPluginListOut) => !data.plugins?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("NAME")}</TableHead>
                    <TableHead>{t("VERSION")}</TableHead>
                    <TableHead>{t("PACKAGE")}</TableHead>
                    <TableHead>{t("PROCESS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.plugins?.map((item) => (
                    <TableRow key={item.name}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.version}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {t(`PACKAGE_STATE_${item.packageState.toUpperCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.processState === "ready" ? "secondary" : "outline"}>
                          {t(`PROCESS_STATE_${item.processState.toUpperCase()}`)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </ExtensionState>
    </ExtensionsPage>
  );
}

export function ExtensionsCatalogPage() {
  const { t } = useTranslation("extensions");
  const load = useCallback(() => listExtensionCatalog({ ordering: "name" }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <ExtensionsPage title={t("CATALOG_TITLE")} description={t("CATALOG_DESCRIPTION")}>
      <ExtensionState
        empty={(data: SystemPluginCatalogListOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <div className="grid gap-5 lg:grid-cols-2">
            {data.items?.map((item) => (
              <Card key={item.name}>
                <CardHeader>
                  <CardTitle>{item.name}</CardTitle>
                  <CardDescription>{item.availableVersion}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Badge variant={item.compatibility.compatible ? "secondary" : "destructive"}>
                    {item.compatibility.compatible ? t("COMPATIBLE") : t("INCOMPATIBLE")}
                  </Badge>
                  <p className="text-footnote text-label-secondary">{t("VERIFIED_SOURCE")}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ExtensionState>
    </ExtensionsPage>
  );
}

export function ExtensionsConnectionsPage() {
  const { t } = useTranslation("extensions");
  const load = useCallback(() => listExtensionConnections(), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <ExtensionsPage title={t("CONNECTIONS_TITLE")} description={t("CONNECTIONS_DESCRIPTION")}>
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
            <CardContent className="overflow-x-auto px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">{t("CONNECTION")}</TableHead>
                    <TableHead>{t("EXTENSION")}</TableHead>
                    <TableHead>{t("RUNTIME")}</TableHead>
                    <TableHead>{t("CONFIGURATION")}</TableHead>
                    <TableHead className="pr-6 text-right">{t("OWNING_DOMAIN")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => {
                    const destination = requireTrustedNavigationDestination(
                      item.configurationTarget,
                    );
                    return (
                      <TableRow key={`${item.extensionName}:${item.connectorKey}`}>
                        <TableCell className="pl-6">
                          <p className="font-medium">
                            {t(`CONNECTION_KIND_${item.connectorKind.toUpperCase()}`)}
                          </p>
                          <p className="text-footnote text-label-secondary">{item.connectorKey}</p>
                        </TableCell>
                        <TableCell>
                          <p>{item.extensionName}</p>
                          <p className="text-footnote text-label-secondary">
                            {item.extensionVersion}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.runtimeReady ? "secondary" : "outline"}>
                            {t(item.runtimeReady ? "RUNTIME_READY" : "RUNTIME_NOT_READY")}
                          </Badge>
                        </TableCell>
                        <TableCell>{t("CONFIGURATION_CHECK_OWNING_DOMAIN")}</TableCell>
                        <TableCell className="pr-6 text-right">
                          <Link
                            className="font-medium text-primary underline underline-offset-4"
                            to={destination.path}
                          >
                            {t(destination.labelKey)}
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </ExtensionState>
    </ExtensionsPage>
  );
}

export function ExtensionsHistoryPage() {
  const { t } = useTranslation("extensions");
  const load = useCallback(() => listExtensionOperations({ page: 1, size: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <ExtensionsPage title={t("HISTORY_TITLE")} description={t("HISTORY_DESCRIPTION")}>
      <ExtensionState
        empty={(data: PageDataSystemPluginOperationOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("HISTORY_EXTENSION")}</TableHead>
                    <TableHead>{t("HISTORY_KIND")}</TableHead>
                    <TableHead>{t("HISTORY_STATE")}</TableHead>
                    <TableHead>{t("HISTORY_PROGRESS")}</TableHead>
                    <TableHead>{t("HISTORY_STARTED")}</TableHead>
                    <TableHead>{t("HISTORY_COMPLETED")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.pluginName}</TableCell>
                      <TableCell>{t(`HISTORY_KIND_${item.kind.toUpperCase()}`)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.state === "failed"
                              ? "destructive"
                              : item.state === "succeeded"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {t(`HISTORY_STATE_${item.state.toUpperCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.progressTotal
                          ? `${item.progressCompleted}/${item.progressTotal}`
                          : item.progressCompleted}
                      </TableCell>
                      <TableCell>
                        {item.startedAt
                          ? new Date(item.startedAt).toLocaleString()
                          : t("NOT_STARTED")}
                      </TableCell>
                      <TableCell>
                        {item.completedAt
                          ? new Date(item.completedAt).toLocaleString()
                          : t("NOT_COMPLETED")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </ExtensionState>
    </ExtensionsPage>
  );
}
