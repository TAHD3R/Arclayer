import { Box, CheckCircle2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SystemPluginCatalogItem } from "@/api/plugins";
import { BaseTag } from "@/components/ui/tags";
import { cn } from "@arclayer/lib/utils";

function capabilityCount(plugin: SystemPluginCatalogItem) {
  return (
    plugin.provides.services.length +
    plugin.provides.providers.length +
    plugin.provides.connectors.length +
    plugin.provides.middlewares.length +
    plugin.provides.contentTypes.length
  );
}

function stateColor(plugin: SystemPluginCatalogItem) {
  if (!plugin.compatibility.compatible) return "red" as const;
  if (plugin.lifecycleState === "failed") return "red" as const;
  if (
    plugin.lifecycleState === "installing" ||
    plugin.lifecycleState === "upgrading" ||
    plugin.lifecycleState === "disabling" ||
    plugin.lifecycleState === "uninstalling"
  )
    return "blue" as const;
  if (plugin.lifecycleState === "disabled" || plugin.runtimeActivationState === "pending_restart")
    return "gold" as const;
  if (plugin.hasUpdate) return "blue" as const;
  if (plugin.processState === "ready") return "green" as const;
  return "gold" as const;
}

function stateLabelKey(plugin: SystemPluginCatalogItem) {
  if (!plugin.compatibility.compatible) return "SETTINGS_SYSTEM_PLUGIN_STATE_INCOMPATIBLE";
  if (plugin.lifecycleState && plugin.lifecycleState !== "installed")
    return `SETTINGS_SYSTEM_PLUGIN_STATE_${plugin.lifecycleState.toUpperCase()}`;
  if (plugin.hasUpdate) return "SETTINGS_SYSTEM_PLUGIN_STATE_UPDATE_AVAILABLE";
  if (plugin.processState)
    return `SETTINGS_SYSTEM_PLUGIN_STATE_${plugin.processState.toUpperCase()}`;
  return "SETTINGS_SYSTEM_PLUGIN_STATE_AVAILABLE";
}

export function PluginCard(props: {
  plugin: SystemPluginCatalogItem;
  onOpen: (plugin: SystemPluginCatalogItem) => void;
}) {
  const { t } = useTranslation("settings");
  const plugin = props.plugin;
  const name = plugin.admin?.labelKey ? t(plugin.admin.labelKey) : plugin.name;
  const description = plugin.admin?.descriptionKey
    ? t(plugin.admin.descriptionKey)
    : t("SETTINGS_SYSTEM_PLUGIN_NO_DESCRIPTION");

  return (
    <button
      type="button"
      className={cn(
        "group flex min-h-60 min-w-0 flex-col rounded-lg border border-border bg-card p-4 text-left",
        "transition-colors duration-200 hover:border-border/80 hover:bg-accent/45",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      onClick={(event) => {
        event.currentTarget.blur();
        props.onOpen(plugin);
      }}
      aria-label={t("SETTINGS_SYSTEM_PLUGIN_OPEN_DETAIL", { name })}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/45 text-label-secondary transition-colors group-hover:text-label-primary">
            <Box className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-headline font-semibold text-label-primary">{name}</h2>
            <p className="mt-0.5 truncate font-mono text-caption text-label-tertiary">
              {plugin.name}
            </p>
          </div>
        </div>
        <BaseTag color={stateColor(plugin)}>{t(stateLabelKey(plugin))}</BaseTag>
      </div>

      <p className="mt-4 line-clamp-3 text-footnote leading-6 text-label-secondary">
        {description}
      </p>

      <div className="mt-auto grid w-full grid-cols-2 gap-3 border-t border-border/70 pt-4">
        <div className="min-w-0">
          <p className="text-caption text-label-tertiary">
            {t("SETTINGS_SYSTEM_PLUGIN_VERSION_LABEL")}
          </p>
          <p className="mt-1 truncate font-mono text-footnote font-medium text-label-primary">
            {plugin.installedVersion
              ? `v${plugin.installedVersion}`
              : t("SETTINGS_SYSTEM_PLUGIN_NOT_INSTALLED")}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-caption text-label-tertiary">
            {t("SETTINGS_SYSTEM_PLUGIN_CAPABILITY_LEDGER")}
          </p>
          <p className="mt-1 text-footnote font-medium text-label-primary">
            {t("SETTINGS_SYSTEM_PLUGIN_CAPABILITIES", { count: capabilityCount(plugin) })}
          </p>
        </div>
      </div>

      <div className="mt-3 flex w-full flex-wrap items-center gap-3 text-caption text-label-tertiary">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          {t(`SETTINGS_SYSTEM_PLUGIN_PROVENANCE_${plugin.sourceType.toUpperCase()}`)}
        </span>
        {plugin.compatibility.compatible ? (
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {t("SETTINGS_SYSTEM_PLUGIN_COMPATIBLE")}
          </span>
        ) : null}
      </div>
    </button>
  );
}
