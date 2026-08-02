import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  ExtensionConnectionListOut,
  SystemPluginDetailOut,
  SystemPluginOperationOut,
} from "@arclayer/platform-openapi";

import { ExtensionLifecycleActions } from "@/extensions/extension-lifecycle-dialogs";
import { getExtension, listExtensionConnections } from "@/extensions/extensions-api";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@arclayer/ui/empty";
import { Skeleton } from "@arclayer/ui/skeleton";

function DossierPage({
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

export function ExtensionsDetailPage({ pluginId }: Readonly<{ pluginId: string }>) {
  const { t } = useTranslation("extensions");
  const [createdOperations, setCreatedOperations] = useState<SystemPluginOperationOut[]>([]);
  const load = useCallback(() => getExtension(pluginId), [pluginId]);
  const { state, retry } = useMonitoringQuery(load, [pluginId]);
  const title = state.status === "ready" && state.data ? state.data.name : t("DETAIL_TITLE");

  useEffect(() => setCreatedOperations([]), [pluginId]);

  return (
    <DossierPage description={t("DETAIL_DESCRIPTION")} title={title}>
      {state.status === "loading" ? <DossierLoading /> : null}
      {state.status === "error" || (state.status === "ready" && !state.data) ? (
        <DossierError retry={retry} />
      ) : null}
      {state.status === "ready" && state.data ? (
        <ExtensionDossier
          item={state.data}
          onOperationCreated={(operation) => {
            setCreatedOperations((current) => [
              operation,
              ...current.filter((record) => record.id !== operation.id),
            ]);
            retry();
          }}
          recentOperations={createdOperations}
        />
      ) : null}
    </DossierPage>
  );
}

function DossierLoading() {
  return (
    <div aria-busy="true" className="space-y-4" role="status">
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function DossierError({ retry }: Readonly<{ retry: () => void }>) {
  const { t } = useTranslation("extensions");
  return (
    <Empty className="min-h-72 border bg-card">
      <EmptyHeader>
        <EmptyTitle>{t("DETAIL_ERROR_TITLE")}</EmptyTitle>
        <EmptyDescription>{t("DETAIL_ERROR_DESCRIPTION")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={retry} variant="outline">
          {t("RETRY")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function ExtensionDossier({
  item,
  recentOperations,
  onOperationCreated,
}: Readonly<{
  item: SystemPluginDetailOut;
  recentOperations: SystemPluginOperationOut[];
  onOperationCreated: (operation: SystemPluginOperationOut) => void;
}>) {
  const { t } = useTranslation("extensions");
  const requestedPermissions = item.permissions ?? [];
  const approvedPermissions = item.approvedPermissions ?? [];
  const operations = useMemo(
    () => mergeOperations(recentOperations, item.recentOperations ?? []),
    [item.recentOperations, recentOperations],
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle>{item.name}</CardTitle>
              <CardDescription>{t("DETAIL_IDENTITY_DESCRIPTION")}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={item.provenanceStatus === "verified" ? "secondary" : "outline"}>
                {t(`PROVENANCE_${item.provenanceStatus.toUpperCase()}`)}
              </Badge>
              <Badge variant={item.compatibility.compatible ? "secondary" : "destructive"}>
                {item.compatibility.compatible ? t("COMPATIBLE") : t("INCOMPATIBLE")}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid gap-x-5 gap-y-4 text-body sm:grid-cols-2 lg:grid-cols-3">
            <DossierField
              label={t("DETAIL_INSTALLED_VERSION")}
              value={item.installedVersion ?? t("NOT_INSTALLED")}
            />
            <DossierField label={t("DETAIL_AVAILABLE_VERSION")} value={item.availableVersion} />
            <DossierField
              label={t("DETAIL_SOURCE")}
              value={t(`SOURCE_${item.sourceType.toUpperCase()}`)}
            />
            <DossierField label={t("DETAIL_SOURCE_REFERENCE")} value={item.sourceLocator} />
            <DossierField
              label={t("DETAIL_TRUST")}
              value={t(`PROVENANCE_${item.provenanceStatus.toUpperCase()}`)}
            />
            <DossierField
              label={t("DETAIL_STATE")}
              value={
                item.lifecycleState
                  ? t(`LIFECYCLE_${item.lifecycleState.toUpperCase()}`)
                  : t("STATE_UNKNOWN")
              }
            />
            <DossierField
              label={t("DETAIL_RUNTIME")}
              value={item.runtimeActivationState ?? t("STATE_UNKNOWN")}
            />
            <DossierField
              label={t("DETAIL_COMPATIBILITY")}
              value={item.compatibility.compatible ? t("COMPATIBLE") : t("INCOMPATIBLE")}
            />
          </dl>
          {!item.compatibility.compatible && item.compatibility.issues.length > 0 ? (
            <div
              className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3"
              role="alert"
            >
              <p className="text-footnote font-medium">{t("DETAIL_COMPATIBILITY_ISSUES")}</p>
              <ul className="list-disc space-y-1 pl-5 text-footnote text-label-secondary">
                {item.compatibility.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <ExtensionLifecycleActions item={item} onOperationCreated={onOperationCreated} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("DETAIL_PERMISSIONS")}</CardTitle>
          <CardDescription>{t("DETAIL_PERMISSIONS_DESCRIPTION")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <PermissionList label={t("PERMISSIONS")} permissions={requestedPermissions} />
          <PermissionList
            label={t("DETAIL_APPROVED_PERMISSIONS")}
            permissions={approvedPermissions}
          />
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <CapabilityEvidence item={item} />
        <DependencyEvidence item={item} />
        <ConsumerEvidence item={item} />
      </div>

      <ConnectionEvidence extensionName={item.name} />
      <OperationHistory operations={operations} />
    </div>
  );
}

function DossierField({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="text-footnote text-label-secondary">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

function PermissionList({
  label,
  permissions,
}: Readonly<{ label: string; permissions: string[] }>) {
  const { t } = useTranslation("extensions");
  return (
    <section aria-label={label} className="space-y-2">
      <h2 className="text-footnote font-medium">{label}</h2>
      {permissions.length === 0 ? (
        <p className="text-body text-label-secondary">{t("NONE")}</p>
      ) : (
        <ul className="space-y-1 rounded-lg border p-3 text-footnote">
          {permissions.map((permission) => (
            <li key={permission}>
              <code>{permission}</code>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CapabilityEvidence({ item }: Readonly<{ item: SystemPluginDetailOut }>) {
  const { t } = useTranslation("extensions");
  const groups = [
    { key: "SERVICES", values: item.provides.services ?? [] },
    { key: "PROVIDERS", values: item.provides.providers ?? [] },
    { key: "CONNECTORS", values: item.provides.connectors ?? [] },
    { key: "CONTENT_TYPES", values: item.provides.contentTypes ?? [] },
    { key: "MIDDLEWARES", values: item.provides.middlewares ?? [] },
  ].filter((group) => group.values.length > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("DETAIL_CAPABILITIES")}</CardTitle>
        <CardDescription>{t("DETAIL_CAPABILITIES_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-body text-label-secondary">{t("NONE")}</p>
        ) : (
          <dl className="space-y-3">
            {groups.map((group) => (
              <div key={group.key}>
                <dt className="text-footnote text-label-secondary">
                  {t(`CAPABILITY_${group.key}`)}
                </dt>
                <dd className="mt-1 break-words text-footnote">{group.values.join(", ")}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function DependencyEvidence({ item }: Readonly<{ item: SystemPluginDetailOut }>) {
  const { t } = useTranslation("extensions");
  const dependencies = item.dependencies ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("DETAIL_DEPENDENCIES")}</CardTitle>
        <CardDescription>{t("DETAIL_DEPENDENCIES_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent>
        {dependencies.length === 0 ? (
          <p className="text-body text-label-secondary">{t("NONE")}</p>
        ) : (
          <ul className="space-y-2">
            {dependencies.map((dependency) => (
              <li className="rounded-lg border p-3" key={dependency.extensionName}>
                <p className="font-medium">{dependency.extensionName}</p>
                {dependency.versionRequirement ? (
                  <p className="text-footnote text-label-secondary">
                    {dependency.versionRequirement}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ConsumerEvidence({ item }: Readonly<{ item: SystemPluginDetailOut }>) {
  const { t } = useTranslation("extensions");
  const evidence = item.consumers;
  const consumers = evidence?.consumers ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("DETAIL_CONSUMERS")}</CardTitle>
        <CardDescription>
          {t(`CONSUMERS_${(evidence?.state ?? "unknown").toUpperCase()}`)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {consumers.length === 0 ? (
          <p className="text-body text-label-secondary">{t("NONE")}</p>
        ) : (
          <ul className="space-y-2">
            {consumers.map((consumer) => (
              <li className="rounded-lg border p-3" key={`${consumer.domain}:${consumer.deepLink}`}>
                <p className="font-medium">{consumer.label}</p>
                <a className="text-footnote text-primary underline" href={consumer.deepLink}>
                  {t("OPEN_CONSUMER")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectionEvidence({ extensionName }: Readonly<{ extensionName: string }>) {
  const { t } = useTranslation("extensions");
  const load = useCallback(() => listExtensionConnections(), []);
  const { state, retry } = useMonitoringQuery(load, []);
  const connections = connectionItems(
    state.status === "ready" ? state.data : undefined,
    extensionName,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("DETAIL_CONNECTIONS")}</CardTitle>
        <CardDescription>{t("DETAIL_CONNECTIONS_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent>
        {state.status === "loading" ? <Skeleton className="h-20 w-full" /> : null}
        {state.status === "error" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-body text-destructive">{t("DETAIL_CONNECTIONS_ERROR")}</p>
            <Button onClick={retry} size="sm" variant="outline">
              {t("RETRY")}
            </Button>
          </div>
        ) : null}
        {state.status === "ready" && connections.length === 0 ? (
          <p className="text-body text-label-secondary">{t("DETAIL_CONNECTIONS_EMPTY")}</p>
        ) : null}
        {state.status === "ready" && connections.length > 0 ? (
          <ul className="space-y-2">
            {connections.map((connection) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                key={connection.connectorKey}
              >
                <div>
                  <p className="font-medium">{connection.connectorKey}</p>
                  <p className="text-footnote text-label-secondary">
                    {connection.configurationTarget}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={connection.runtimeReady ? "secondary" : "destructive"}>
                    {connection.runtimeReady ? t("RUNTIME_READY") : t("RUNTIME_NOT_READY")}
                  </Badge>
                  <Badge
                    variant={configurationBadgeVariant(String(connection.configurationReadiness))}
                  >
                    {t(`CONFIGURATION_${String(connection.configurationReadiness).toUpperCase()}`)}
                  </Badge>
                  <a
                    className="text-footnote text-primary underline"
                    href={connection.configurationDeepLink}
                  >
                    {t("OWNING_DOMAIN")}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OperationHistory({ operations }: Readonly<{ operations: SystemPluginOperationOut[] }>) {
  const { t } = useTranslation("extensions");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("DETAIL_HISTORY")}</CardTitle>
        <CardDescription>{t("DETAIL_HISTORY_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent>
        {operations.length === 0 ? (
          <p className="text-body text-label-secondary">{t("NONE")}</p>
        ) : (
          <ul className="space-y-2">
            {operations.map((operation) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                key={operation.id}
              >
                <div>
                  <p className="font-medium">{t(`HISTORY_KIND_${operation.kind.toUpperCase()}`)}</p>
                  <p className="text-footnote text-label-secondary">
                    {t(
                      operation.state === "succeeded" && !operation.activationVerified
                        ? "HISTORY_STATE_SUCCEEDED_PENDING_VERIFICATION"
                        : `HISTORY_STATE_${operation.state.toUpperCase()}`,
                    )}
                  </p>
                </div>
                <Link
                  className="text-footnote font-medium text-primary underline"
                  search={{ operationId: operation.id }}
                  to="/extensions/history"
                >
                  {t("INSPECT_OPERATION")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function connectionItems(data: ExtensionConnectionListOut | undefined, extensionName: string) {
  return (data?.items ?? []).filter((connection) => connection.extensionName === extensionName);
}

function mergeOperations(
  created: SystemPluginOperationOut[],
  persisted: SystemPluginOperationOut[],
): SystemPluginOperationOut[] {
  return [
    ...created,
    ...persisted.filter(
      (operation) => !created.some((createdOperation) => createdOperation.id === operation.id),
    ),
  ];
}

function configurationBadgeVariant(readiness: string) {
  if (readiness === "ready") return "secondary";
  if (readiness === "unavailable") return "destructive";
  return "outline";
}
