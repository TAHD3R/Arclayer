import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  KeyRound,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getSystemPluginConfiguration,
  updateSystemPluginConfiguration,
  type SystemPluginCatalogItem,
  type SystemPluginConfiguration,
} from "@/api/plugins";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { ApiError } from "@arclayer/web/http";
import { Button } from "@arclayer/ui/button";
import { Field, FieldDescription, FieldLabel } from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";
import { Spinner } from "@arclayer/ui/spinner";
import { Switch } from "@arclayer/ui/switch";

type PropertySchema = {
  type: "boolean" | "string" | "number" | "integer";
  format?: "uri";
  default?: unknown;
  minimum?: number;
  maximum?: number;
  title?: string;
  description?: string;
};

type ConfigField = { key: string; schema: PropertySchema };
type Translate = (key: string, options?: Record<string, unknown>) => string;

const configurationQueryKey = (pluginName: string) =>
  ["system", "plugins", "configuration", pluginName] as const;

function objectEntries(value: unknown): [string, Record<string, unknown>][] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, Record<string, unknown>] =>
      Boolean(entry[1]) && typeof entry[1] === "object" && !Array.isArray(entry[1]),
  );
}

function configFields(plugin: SystemPluginCatalogItem): ConfigField[] {
  const properties = (plugin.configSchema.properties ?? plugin.configSchema) as unknown;
  return objectEntries(properties).map(([key, schema]) => ({
    key,
    schema: schema as PropertySchema,
  }));
}

function secretFields(plugin: SystemPluginCatalogItem): ConfigField[] {
  const fields = new Map<string, PropertySchema>();
  for (const connector of plugin.connectorDefinitions) {
    const schema = connector.secretSchema;
    const properties = (schema.properties ?? schema) as unknown;
    for (const [key, fieldSchema] of objectEntries(properties)) {
      fields.set(key, fieldSchema as PropertySchema);
    }
  }
  return [...fields].map(([key, schema]) => ({ key, schema }));
}

export function hasInlinePluginConfiguration(plugin: SystemPluginCatalogItem): boolean {
  return configFields(plugin).length > 0 || secretFields(plugin).length > 0;
}

function humanizeFieldName(value: string): string {
  const spaced = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function fieldLabel(t: Translate, pluginName: string, field: ConfigField): string {
  const stableKey = `SETTINGS_SYSTEM_PLUGIN_CONFIG_FIELD_${pluginName}_${field.key}`
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toUpperCase();
  return field.schema.title ?? t(stableKey, { defaultValue: humanizeFieldName(field.key) });
}

function initialValues(
  fields: ConfigField[],
  configuration: SystemPluginConfiguration,
): Record<string, unknown> {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const current = configuration.values[field.key];
      if (current !== undefined) return [[field.key, current]];
      return field.schema.default === undefined ? [] : [[field.key, field.schema.default]];
    }),
  );
}

function setFieldValue(
  setter: React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
  field: string,
  value: unknown,
) {
  setter((current) => {
    const next = { ...current };
    if (value === undefined) delete next[field];
    else next[field] = value;
    return next;
  });
}

function normalizedReferences(references: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(references)
      .map(([field, reference]) => [field, reference.trim()] as const)
      .filter(([, reference]) => reference.length > 0),
  );
}

function ConfigInput(props: {
  field: ConfigField;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = `plugin-config-${props.field.key}`;
  if (props.field.schema.type === "boolean") {
    return (
      <Field orientation="horizontal" className="justify-between rounded-md border px-3 py-3">
        <div className="min-w-0">
          <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
          <FieldDescription className="font-mono">{props.field.key}</FieldDescription>
        </div>
        <Switch id={id} checked={Boolean(props.value)} onCheckedChange={props.onChange} />
      </Field>
    );
  }
  const isNumber = props.field.schema.type === "number" || props.field.schema.type === "integer";
  return (
    <Field>
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      <Input
        id={id}
        type={isNumber ? "number" : props.field.schema.format === "uri" ? "url" : "text"}
        value={
          typeof props.value === "string" || typeof props.value === "number" ? props.value : ""
        }
        min={props.field.schema.minimum}
        max={props.field.schema.maximum}
        step={props.field.schema.type === "integer" ? 1 : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          if (!isNumber) props.onChange(raw);
          else if (!raw) props.onChange(undefined);
          else
            props.onChange(
              props.field.schema.type === "integer" ? Number.parseInt(raw, 10) : Number(raw),
            );
        }}
      />
      <FieldDescription>
        {props.field.schema.description ?? <code>{props.field.key}</code>}
      </FieldDescription>
    </Field>
  );
}

function SecretReferenceInput(props: {
  field: ConfigField;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation("settings");
  const id = `plugin-secret-${props.field.key}`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      <div className="relative">
        <KeyRound
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary"
          aria-hidden="true"
        />
        <Input
          id={id}
          className="pl-9 font-mono"
          value={props.value}
          placeholder="env:VARIABLE_NAME"
          onChange={(event) => props.onChange(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <FieldDescription>
        {t("SETTINGS_SYSTEM_PLUGIN_CONFIG_SECRET_REFERENCE_DESC")}
      </FieldDescription>
    </Field>
  );
}

function ConfigurationLedger(props: { configuration: SystemPluginConfiguration }) {
  const { t } = useTranslation("settings");
  const cells = [
    {
      label: t("SETTINGS_SYSTEM_PLUGIN_CONFIG_SOURCE"),
      value: t("SETTINGS_SYSTEM_PLUGIN_CONFIG_SOURCE_MANIFEST"),
      icon: FileCode2,
    },
    {
      label: t("SETTINGS_SYSTEM_PLUGIN_CONFIG_REVISION"),
      value: `#${props.configuration.revision}`,
      icon: RefreshCw,
    },
    {
      label: t("SETTINGS_SYSTEM_PLUGIN_CONFIG_RUNTIME_IMPACT"),
      value: t(
        props.configuration.restartRequired
          ? "SETTINGS_SYSTEM_PLUGIN_CONFIG_RESTART_PENDING"
          : "SETTINGS_SYSTEM_PLUGIN_CONFIG_RUNTIME_CURRENT",
      ),
      icon: RotateCcw,
    },
  ];
  return (
    <dl className="grid divide-y rounded-md border bg-muted/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-caption text-label-tertiary">
            <cell.icon className="size-3.5" aria-hidden="true" />
            {cell.label}
          </dt>
          <dd className="mt-1 break-words text-footnote font-medium text-label-primary">
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PluginConfigurationPanel(props: { plugin: SystemPluginCatalogItem }) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const fields = useMemo(() => configFields(props.plugin), [props.plugin]);
  const secrets = useMemo(() => secretFields(props.plugin), [props.plugin]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const query = useQuery({
    queryKey: configurationQueryKey(props.plugin.name),
    queryFn: ({ signal }) => getSystemPluginConfiguration(props.plugin.name, signal),
    retry: false,
  });
  useEffect(() => {
    if (!query.data) return;
    setValues(initialValues(fields, query.data));
    setReferences(query.data.secretReferences);
  }, [fields, query.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!query.data) throw new Error("PLUGIN_CONFIGURATION_REQUIRED");
      return updateSystemPluginConfiguration(props.plugin.name, {
        expectedRevision: query.data.revision,
        values,
        secretReferences: normalizedReferences(references),
      });
    },
    onSuccess: (configuration) => {
      queryClient.setQueryData(configurationQueryKey(props.plugin.name), configuration);
      notifySuccessText(t("SETTINGS_SYSTEM_PLUGIN_CONFIG_SAVED"));
    },
    onError: (error) => {
      if (
        !(error instanceof ApiError) ||
        error.error !== "PLUGIN_CONFIGURATION_REVISION_CONFLICT"
      ) {
        notifyError(error);
      }
    },
  });
  const isConflict =
    mutation.error instanceof ApiError &&
    mutation.error.error === "PLUGIN_CONFIGURATION_REVISION_CONFLICT";

  if (query.isLoading) {
    return (
      <section
        className="flex min-h-32 items-center justify-center rounded-lg border"
        aria-label={t("SETTINGS_SYSTEM_PLUGIN_CONFIG_TITLE")}
      >
        <Spinner />
      </section>
    );
  }
  if (query.error || !query.data) {
    return (
      <section className="rounded-lg border border-destructive/30 p-4" role="alert">
        <p className="text-footnote font-medium text-label-primary">
          {t("SETTINGS_SYSTEM_PLUGIN_CONFIG_LOAD_FAILED")}
        </p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void query.refetch()}>
          <RefreshCw data-icon="inline-start" />
          {t("SETTINGS_SYSTEM_PLUGIN_CONFIG_RELOAD")}
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h3 className="text-headline font-semibold text-label-primary">
          {t("SETTINGS_SYSTEM_PLUGIN_CONFIG_TITLE")}
        </h3>
        <p className="mt-1 text-footnote text-label-secondary">
          {t("SETTINGS_SYSTEM_PLUGIN_CONFIG_DESC")}
        </p>
      </div>
      <ConfigurationLedger configuration={query.data} />
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <ConfigInput
            key={field.key}
            field={field}
            label={fieldLabel(t, props.plugin.name, field)}
            value={values[field.key]}
            onChange={(value) => setFieldValue(setValues, field.key, value)}
          />
        ))}
        {secrets.map((field) => (
          <SecretReferenceInput
            key={field.key}
            field={field}
            label={fieldLabel(t, props.plugin.name, field)}
            value={references[field.key] ?? ""}
            onChange={(value) => setReferences((current) => ({ ...current, [field.key]: value }))}
          />
        ))}
      </div>
      {isConflict ? (
        <div
          className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-footnote font-medium">
              {t("SETTINGS_SYSTEM_PLUGIN_CONFIG_CONFLICT")}
            </p>
            <Button
              className="mt-2"
              size="sm"
              variant="outline"
              onClick={() => {
                mutation.reset();
                void query.refetch();
              }}
            >
              {t("SETTINGS_SYSTEM_PLUGIN_CONFIG_RELOAD")}
            </Button>
          </div>
        </div>
      ) : query.data.restartRequired ? (
        <p className="flex items-start gap-2 text-footnote text-label-secondary" aria-live="polite">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden="true" />
          {t("SETTINGS_SYSTEM_PLUGIN_CONFIG_RESTART_NOTICE")}
        </p>
      ) : null}
      <div className="flex justify-end border-t pt-4">
        <Button disabled={mutation.isPending || isConflict} onClick={() => mutation.mutate()}>
          {mutation.isPending ? <Spinner data-icon="inline-start" /> : null}
          {t("SETTINGS_SYSTEM_PLUGIN_CONFIG_SAVE")}
        </Button>
      </div>
    </section>
  );
}
