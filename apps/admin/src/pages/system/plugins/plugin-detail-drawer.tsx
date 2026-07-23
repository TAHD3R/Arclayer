import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Box, ExternalLink, PackageCheck, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getSystemPluginDetail,
  getSystemPluginOperation,
  installSystemPlugin,
  startSystemPluginOperation,
  type SystemPluginCatalogItem,
  type SystemPluginOperation,
  type SystemPluginOperationKind,
} from "@/api/plugins";
import { BaseTag } from "@/components/ui/tags";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Button } from "@arclayer/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";

import { PluginOperationDialog } from "./plugin-operation-dialog";
import { isTerminalPluginOperation, PluginOperationStatus } from "./plugin-operation-status";
import {
  hasInlinePluginConfiguration,
  PluginConfigurationPanel,
} from "./plugin-configuration-panel";

type CapabilityGroup = {
  key: string;
  values: string[];
};

function capabilityGroups(plugin: SystemPluginCatalogItem): CapabilityGroup[] {
  return [
    { key: "SERVICES", values: plugin.provides.services },
    { key: "PROVIDERS", values: plugin.provides.providers },
    { key: "CONNECTORS", values: plugin.provides.connectors },
    { key: "MIDDLEWARES", values: plugin.provides.middlewares },
    { key: "CONTENT_TYPES", values: plugin.provides.contentTypes },
  ].filter((group) => group.values.length > 0);
}

function DetailField(props: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-label-tertiary">{props.label}</dt>
      <dd className={props.mono ? "mt-1 break-all font-mono text-footnote" : "mt-1 text-footnote"}>
        {props.value}
      </dd>
    </div>
  );
}

function primaryOperationKind(plugin: SystemPluginCatalogItem): SystemPluginOperationKind | null {
  if (plugin.currentOperationId) return null;
  if (!plugin.installedVersion) return "install";
  if (plugin.hasUpdate) return "upgrade";
  if (plugin.desiredEnabled === false || plugin.lifecycleState === "disabled") return "enable";
  if (plugin.name !== "arclayer-core") return "disable";
  return null;
}

export function PluginDetailDrawer(props: {
  plugin: SystemPluginCatalogItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [operationKind, setOperationKind] = useState<SystemPluginOperationKind | null>(null);
  const [activeOperation, setActiveOperation] = useState<SystemPluginOperation | null>(null);
  const operationDialogOpenRef = useRef(false);
  const query = useQuery({
    queryKey: ["system", "plugins", "detail", props.plugin?.name],
    queryFn: ({ signal }) => {
      if (!props.plugin) throw new Error("PLUGIN_DETAIL_TARGET_REQUIRED");
      return getSystemPluginDetail(props.plugin.name, signal);
    },
    enabled: Boolean(props.plugin),
    retry: false,
  });
  const plugin = query.data ?? props.plugin;
  const operationId = activeOperation?.id ?? plugin?.currentOperationId ?? null;
  const operationQuery = useQuery({
    queryKey: ["system", "plugin-operations", operationId],
    queryFn: ({ signal }) => {
      if (!operationId) throw new Error("PLUGIN_OPERATION_TARGET_REQUIRED");
      return getSystemPluginOperation(operationId, signal);
    },
    enabled: Boolean(operationId),
    retry: false,
    refetchInterval: (operationState) => {
      const operation = operationState.state.data;
      return operation && isTerminalPluginOperation(operation) ? false : 1_500;
    },
  });
  const operation =
    operationQuery.data ?? activeOperation ?? query.data?.recentOperations[0] ?? null;
  const mutation = useMutation({
    mutationFn: async (kind: SystemPluginOperationKind) => {
      if (!plugin) throw new Error("PLUGIN_OPERATION_TARGET_REQUIRED");
      const idempotencyKey = crypto.randomUUID();
      if (kind === "install") {
        if (plugin.sourceType === "manual_upload" && !plugin.artifactId) {
          throw new Error("PLUGIN_ARTIFACT_REQUIRED");
        }
        return installSystemPlugin(
          plugin.sourceType === "manual_upload"
            ? {
                sourceType: "manual_upload",
                artifactId: plugin.artifactId!,
                approvedPermissions: plugin.permissions,
              }
            : {
                sourceType: plugin.sourceType,
                pluginName: plugin.name,
                targetVersion:
                  plugin.sourceType === "catalog" ? plugin.availableVersion : undefined,
                approvedPermissions: plugin.permissions,
              },
          idempotencyKey,
        );
      }
      return startSystemPluginOperation(plugin.name, kind, plugin.permissions, idempotencyKey);
    },
    onSuccess: async (createdOperation) => {
      setActiveOperation(createdOperation);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["system", "plugins", "catalog"] }),
        queryClient.invalidateQueries({
          queryKey: ["system", "plugins", "detail", createdOperation.pluginName],
        }),
      ]);
    },
  });

  useEffect(() => {
    setOperationKind(null);
    setActiveOperation(null);
    mutation.reset();
  }, [props.plugin?.name]);

  useEffect(() => {
    if (!operationQuery.data || !isTerminalPluginOperation(operationQuery.data)) return;
    void queryClient.invalidateQueries({ queryKey: ["system", "plugins"] });
  }, [operationQuery.data, queryClient]);

  const name = plugin?.admin?.labelKey ? t(plugin.admin.labelKey) : (plugin?.name ?? "");
  const description = plugin?.admin?.descriptionKey
    ? t(plugin.admin.descriptionKey)
    : t("SETTINGS_SYSTEM_PLUGIN_NO_DESCRIPTION");
  const configKeys = plugin
    ? Object.keys(
        (plugin.configSchema.properties as Record<string, unknown> | undefined) ??
          plugin.configSchema,
      )
    : [];
  const primaryKind = plugin ? primaryOperationKind(plugin) : null;
  const hasActiveOperation = Boolean(operation && !isTerminalPluginOperation(operation));
  const openOperationDialog = (kind: SystemPluginOperationKind) => {
    operationDialogOpenRef.current = true;
    setOperationKind(kind);
  };
  const closeOperationDialog = () => {
    setOperationKind(null);
    mutation.reset();
    requestAnimationFrame(() => {
      operationDialogOpenRef.current = false;
    });
  };

  return (
    <>
      <Drawer
        open={Boolean(props.plugin)}
        onOpenChange={(open) => {
          if (!open && operationDialogOpenRef.current) return;
          props.onOpenChange(open);
        }}
        direction="right"
      >
        <DrawerContent className="h-dvh max-h-dvh w-full overflow-hidden data-[vaul-drawer-direction=right]:sm:max-w-2xl">
          <DrawerHeader className="max-w-none gap-1 rounded-none px-5 py-4 pr-14 text-left">
            <DrawerTitle>{name}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="min-h-0 max-w-none flex-1 overflow-y-auto px-5 pb-8">
            <ContentGuard
              loading={query.isLoading && !plugin}
              error={query.error}
              onRetry={() => void query.refetch()}
              empty={!plugin}
            >
              {plugin ? (
                <div className="space-y-6">
                  <section className="rounded-lg border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/45">
                        <Box className="size-4 text-label-secondary" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-footnote font-semibold">
                            {plugin.name}
                          </span>
                          <BaseTag color={plugin.compatibility.compatible ? "green" : "red"}>
                            {t(
                              plugin.compatibility.compatible
                                ? "SETTINGS_SYSTEM_PLUGIN_COMPATIBLE"
                                : "SETTINGS_SYSTEM_PLUGIN_STATE_INCOMPATIBLE",
                            )}
                          </BaseTag>
                          <BaseTag color="default">
                            <ShieldCheck className="size-3.5" aria-hidden="true" />
                            {t(
                              `SETTINGS_SYSTEM_PLUGIN_PROVENANCE_${plugin.sourceType.toUpperCase()}`,
                            )}
                          </BaseTag>
                        </div>
                        <p className="mt-2 text-footnote leading-6 text-label-secondary">
                          {description}
                        </p>
                      </div>
                    </div>
                    <dl className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-2">
                      <DetailField
                        label={t("SETTINGS_SYSTEM_PLUGIN_INSTALLED_VERSION")}
                        value={
                          plugin.installedVersion
                            ? `v${plugin.installedVersion}`
                            : t("SETTINGS_SYSTEM_PLUGIN_NOT_INSTALLED")
                        }
                        mono
                      />
                      <DetailField
                        label={t("SETTINGS_SYSTEM_PLUGIN_AVAILABLE_VERSION")}
                        value={`v${plugin.availableVersion}`}
                        mono
                      />
                      <DetailField
                        label={t("SETTINGS_SYSTEM_PLUGIN_SOURCE")}
                        value={plugin.sourceLocator}
                        mono
                      />
                      <DetailField
                        label={t("SETTINGS_SYSTEM_PLUGIN_RUNTIME_STATE")}
                        value={
                          plugin.processState
                            ? t(`SETTINGS_SYSTEM_PLUGIN_STATE_${plugin.processState.toUpperCase()}`)
                            : t("SETTINGS_SYSTEM_PLUGIN_STATE_AVAILABLE")
                        }
                      />
                    </dl>
                  </section>

                  {operation ? <PluginOperationStatus operation={operation} /> : null}

                  <section>
                    <h3 className="text-headline font-semibold text-label-primary">
                      {t("SETTINGS_SYSTEM_PLUGIN_CAPABILITIES_TITLE")}
                    </h3>
                    <div className="mt-3 space-y-3">
                      {capabilityGroups(plugin).map((group) => (
                        <div key={group.key} className="rounded-lg border p-3.5">
                          <p className="text-caption font-medium text-label-secondary">
                            {t(`SETTINGS_SYSTEM_PLUGIN_CAPABILITY_${group.key}`)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {group.values.map((value) => (
                              <BaseTag key={value} color="default">
                                {value}
                              </BaseTag>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                    <DetailField
                      label={t("SETTINGS_SYSTEM_PLUGIN_PLATFORM_REQUIREMENT")}
                      value={plugin.compatibility.platformRequirement ?? "-"}
                      mono
                    />
                    <DetailField
                      label={t("SETTINGS_SYSTEM_PLUGIN_PYTHON_REQUIREMENT")}
                      value={plugin.compatibility.pythonRequirement ?? "-"}
                      mono
                    />
                    <DetailField
                      label={t("SETTINGS_SYSTEM_PLUGIN_PERMISSIONS_TITLE")}
                      value={plugin.permissions.length ? plugin.permissions.join(", ") : "-"}
                      mono
                    />
                    <DetailField
                      label={t("SETTINGS_SYSTEM_PLUGIN_CONFIG_FIELDS")}
                      value={configKeys.length ? configKeys.join(", ") : "-"}
                      mono
                    />
                    <div className="sm:col-span-2">
                      <DetailField
                        label={t("SETTINGS_SYSTEM_PLUGIN_PACKAGE_CHECKSUM")}
                        value={plugin.packageChecksum}
                        mono
                      />
                    </div>
                  </section>

                  {plugin.admin?.settingsPath ? (
                    <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/25 p-4">
                      <div>
                        <h3 className="text-footnote font-semibold text-label-primary">
                          {t("SETTINGS_SYSTEM_PLUGIN_RELATED_SETTINGS")}
                        </h3>
                        <p className="mt-1 text-caption text-label-secondary">
                          {t("SETTINGS_SYSTEM_PLUGIN_RELATED_SETTINGS_DESC")}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <Link to={plugin.admin.settingsPath}>
                          <PackageCheck data-icon="inline-start" />
                          {t("SETTINGS_SYSTEM_PLUGIN_CONFIGURE")}
                          <ExternalLink data-icon="inline-end" />
                        </Link>
                      </Button>
                    </section>
                  ) : null}

                  {!plugin.admin?.settingsPath &&
                  plugin.installedVersion &&
                  hasInlinePluginConfiguration(plugin) ? (
                    <PluginConfigurationPanel plugin={plugin} />
                  ) : null}
                </div>
              ) : null}
            </ContentGuard>
          </DrawerBody>
          {plugin ? (
            <DrawerFooter className="!flex flex-row items-center justify-between gap-3 px-5 md:max-w-none">
              <div>
                {plugin.installedVersion && plugin.name !== "arclayer-core" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={hasActiveOperation || mutation.isPending}
                    onClick={() => openOperationDialog("uninstall")}
                  >
                    {t("SETTINGS_SYSTEM_PLUGIN_OPERATION_UNINSTALL_CONFIRM")}
                  </Button>
                ) : null}
              </div>
              {primaryKind ? (
                <Button
                  type="button"
                  disabled={
                    hasActiveOperation || mutation.isPending || !plugin.compatibility.compatible
                  }
                  onClick={() => openOperationDialog(primaryKind)}
                >
                  {t(`SETTINGS_SYSTEM_PLUGIN_OPERATION_${primaryKind.toUpperCase()}_CONFIRM`)}
                </Button>
              ) : null}
            </DrawerFooter>
          ) : null}
        </DrawerContent>
      </Drawer>

      {plugin ? (
        <PluginOperationDialog
          plugin={plugin}
          kind={operationKind}
          pending={mutation.isPending}
          error={mutation.error}
          onOpenChange={(open) => {
            if (!open) closeOperationDialog();
          }}
          onConfirm={async () => {
            if (!operationKind) return false;
            try {
              await mutation.mutateAsync(operationKind);
              return true;
            } catch {
              return false;
            }
          }}
        />
      ) : null}
    </>
  );
}
