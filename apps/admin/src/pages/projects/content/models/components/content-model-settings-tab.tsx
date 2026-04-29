import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Route, Settings2, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AdminContentModel } from "@/types/api";
import { getContentModelImpactPreview, patchContentModel } from "@/api/content";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Input } from "@arclayer/ui/input";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { cn } from "@arclayer/lib/utils";
import { ChromeTabsContent } from "@arclayer/ui/chrome-tabs";

type ContentModelSettingsTabProps = {
  projectId: string;
  model: AdminContentModel;
  canManageModels: boolean;
  pending: boolean;
  onModelChange: (model: AdminContentModel) => void;
};

const CAPABILITIES = [
  "versioned",
  "routable",
  "treeable",
  "visual_editable",
  "rich_text_editable",
  "queryable",
  "has_slots",
  "has_relations",
  "localizable",
  "publishable",
  "schedulable",
  "seo_managed",
] as const;

function readRoutingSchema(model: AdminContentModel) {
  const routingSchema = model.routingSchema as Record<string, unknown> | null;
  const mode =
    routingSchema?.mode === "single" || routingSchema?.mode === "localized"
      ? routingSchema.mode
      : "none";
  const slugField =
    (routingSchema?.slugField as string | undefined) ??
    (routingSchema?.slug_field as string | undefined) ??
    "";
  return { mode, slugField };
}

function CapabilityCheckbox(props: {
  capability: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-border/70 bg-background px-3 py-3">
      <Checkbox
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={(checked) => props.onChange(Boolean(checked))}
      />
      <div className="min-w-0">
        <div className="text-headline text-label-primary">{props.label}</div>
        <div className="mt-1 text-callout text-label-secondary">{props.description}</div>
      </div>
    </label>
  );
}

function SettingsSection(props: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const Icon = props.icon;
  return (
    <section className="grid gap-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4.5 shrink-0 text-label-secondary" />
        <div>
          <h3 className="text-headline text-label-primary">{props.title}</h3>
          {props.description ? (
            <p className="mt-1 text-callout text-label-secondary">{props.description}</p>
          ) : null}
        </div>
      </div>
      {props.children}
    </section>
  );
}

export function ContentModelSettingsTab(props: ContentModelSettingsTabProps) {
  const { t } = useTranslation("content");
  const model = props.model;

  const [capabilities, setCapabilities] = React.useState<string[]>(() => model.capabilities ?? []);
  const [routingMode, setRoutingMode] = React.useState<string>(() => readRoutingSchema(model).mode);
  const [slugField, setSlugField] = React.useState<string>(
    () => readRoutingSchema(model).slugField,
  );

  React.useEffect(() => {
    const routingSchema = readRoutingSchema(model);
    setCapabilities(model.capabilities ?? []);
    setRoutingMode(routingSchema.mode);
    setSlugField(routingSchema.slugField);
  }, [model]);

  const hasChanges = React.useMemo(() => {
    const currentCaps = [...(model.capabilities ?? [])].sort().join(",");
    const nextCaps = [...capabilities].sort().join(",");
    const currentModelRouting = readRoutingSchema(model);
    const currentRouting = JSON.stringify({
      mode: currentModelRouting.mode,
      slugField: currentModelRouting.slugField || null,
    });
    const nextRouting = JSON.stringify({
      mode: routingMode,
      slugField: slugField || null,
    });
    return currentCaps !== nextCaps || currentRouting !== nextRouting;
  }, [model, capabilities, routingMode, slugField]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const patchPayload = {
        capabilities: capabilities as Parameters<typeof patchContentModel>[2]["capabilities"],
        routing: {
          mode: routingMode as "none" | "single" | "localized",
          slugField: slugField || null,
        },
      };
      const preview = await getContentModelImpactPreview(
        props.projectId,
        props.model.id,
        patchPayload,
      );
      return patchContentModel(props.projectId, props.model.id, {
        ...patchPayload,
        impact_preview_token: preview.previewToken,
      } as Parameters<typeof patchContentModel>[2]);
    },
    onSuccess: (updated) => {
      props.onModelChange(updated);
      notifySuccessText(t("CONTENT_MODELS_SETTINGS_SAVED"));
    },
    onError: notifyError,
  });

  const handleToggleCapability = React.useCallback((capability: string, checked: boolean) => {
    setCapabilities((prev) =>
      checked ? [...prev, capability] : prev.filter((c) => c !== capability),
    );
  }, []);

  const canEdit = props.canManageModels && !props.pending;

  return (
    <ChromeTabsContent value="settings" className="min-h-0 flex-1 pb-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-6">
        <SettingsSection
          icon={Settings2}
          title={t("CONTENT_MODELS_SETTINGS_CAPABILITIES_TITLE")}
          description={t("CONTENT_MODELS_SETTINGS_CAPABILITIES_DESC")}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {CAPABILITIES.map((capability) => (
              <CapabilityCheckbox
                key={capability}
                capability={capability}
                label={t(`CONTENT_MODELS_SETTINGS_CAPABILITY_${capability.toUpperCase()}_LABEL`)}
                description={t(
                  `CONTENT_MODELS_SETTINGS_CAPABILITY_${capability.toUpperCase()}_DESC`,
                )}
                checked={capabilities.includes(capability)}
                disabled={!canEdit}
                onChange={(checked) => handleToggleCapability(capability, checked)}
              />
            ))}
          </div>
        </SettingsSection>

        <SettingsSection
          icon={Route}
          title={t("CONTENT_MODELS_SETTINGS_ROUTING_TITLE")}
          description={t("CONTENT_MODELS_SETTINGS_ROUTING_DESC")}
        >
          <SettingDialogFields>
            <SettingDialogField title={t("CONTENT_MODELS_SETTINGS_ROUTING_MODE_LABEL")}>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["none", "single", "localized"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={!canEdit}
                    className={cn(
                      "flex items-center justify-center rounded-md border px-3 py-2 text-footnote font-medium transition-colors",
                      routingMode === mode
                        ? "border-primary bg-primary/8 text-label-primary"
                        : "border-border/70 bg-background text-label-secondary hover:bg-accent/40 hover:text-label-primary",
                      !canEdit && "cursor-not-allowed opacity-60",
                    )}
                    onClick={() => setRoutingMode(mode)}
                  >
                    {t(`CONTENT_MODELS_SETTINGS_ROUTING_MODE_${mode.toUpperCase()}`)}
                  </button>
                ))}
              </div>
            </SettingDialogField>
            {routingMode !== "none" ? (
              <SettingDialogField title={t("CONTENT_MODELS_SETTINGS_ROUTING_SLUG_FIELD_LABEL")}>
                <Input
                  aria-label={t("CONTENT_MODELS_SETTINGS_ROUTING_SLUG_FIELD_LABEL")}
                  value={slugField}
                  disabled={!canEdit}
                  placeholder="slug"
                  onChange={(e) => setSlugField(e.target.value)}
                />
              </SettingDialogField>
            ) : null}
          </SettingDialogFields>
        </SettingsSection>

        <div className="flex items-center justify-end gap-3 border-t border-border/60 pt-5">
          <Button
            variant="primary"
            loading={saveMutation.isPending}
            disabled={!canEdit || !hasChanges}
            onClick={() => saveMutation.mutate()}
          >
            {t("CONTENT_MODELS_SETTINGS_SAVE_ACTION")}
          </Button>
        </div>
      </div>
    </ChromeTabsContent>
  );
}
