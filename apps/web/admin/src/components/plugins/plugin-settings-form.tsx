import { Card, Input, Switch, Typography } from "antd";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Button } from "@/components/ui/button";
import type { SystemSettingsDetail, SettingsSchemaItem } from "@/api/settings";

type FormValues = Record<string, unknown>;

function zodForFieldType(type: string): z.ZodTypeAny {
  const t = String(type || "").trim().toLowerCase();
  if (t === "bool") return z.boolean().optional();
  if (t === "int") return z.number().int().optional();
  if (t === "float") return z.number().optional();
  if (t === "str") return z.string().optional();
  // Fallback: keep it permissive for future field types; validation happens server-side too.
  return z.unknown().optional();
}

function buildZodSchema(schema: SettingsSchemaItem): z.ZodType<FormValues> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const section of schema.sections || []) {
    const sectionShape: Record<string, z.ZodTypeAny> = {};
    for (const field of section.fields || []) {
      sectionShape[field.key] = zodForFieldType(field.type);
    }
    shape[section.id] = z.object(sectionShape).partial().optional();
  }
  return z.object(shape).partial();
}

function buildInitialValues(detail: SystemSettingsDetail): FormValues {
  const value = detail.value || {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const section of detail.setting_schema.sections || []) {
    const sectionValue = (value as Record<string, unknown>)[section.id];
    out[section.id] = {};
    for (const field of section.fields || []) {
      const raw =
        sectionValue && typeof sectionValue === "object"
          ? (sectionValue as Record<string, unknown>)[field.key]
          : undefined;
      // Secret fields are masked as null; keep input empty by default.
      if (field.secret) {
        out[section.id][field.key] = "";
      } else {
        out[section.id][field.key] = raw ?? field.default ?? undefined;
      }
    }
  }
  return out;
}

export interface PluginSettingsFormProps {
  detail: SystemSettingsDetail;
  disabled?: boolean;
  saving?: boolean;
  onSubmitPatch: (patch: Record<string, unknown>) => Promise<void>;
}

export function PluginSettingsForm({
  detail,
  disabled = false,
  saving = false,
  onSubmitPatch,
}: PluginSettingsFormProps) {
  const { t } = useTranslation(["common", "settings", "plugin"]);

  const zodSchema = useMemo(() => buildZodSchema(detail.setting_schema), [detail.setting_schema]);
  const initialValues = useMemo(() => buildInitialValues(detail), [detail]);

  const form = useForm<FormValues>({
    resolver: zodResolver(zodSchema),
    defaultValues: initialValues,
    mode: "onSubmit",
  });

  useEffect(() => {
    // Keep form in sync with backend while avoiding overriding user edits.
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [form, initialValues]);

  const onSubmit = form.handleSubmit(async (values) => {
    // Build a minimal patch (omit empty secret inputs).
    const patch: Record<string, unknown> = {};

    for (const section of detail.setting_schema.sections || []) {
      const sectionPatch: Record<string, unknown> = {};
      const sectionValues = (values?.[section.id] as Record<string, unknown> | undefined) || {};

      for (const field of section.fields || []) {
        const v = (sectionValues as Record<string, unknown>)[field.key];

        if (field.secret) {
          const s = typeof v === "string" ? v.trim() : "";
          if (!s) continue;
          sectionPatch[field.key] = s;
          continue;
        }

        if (v === undefined) continue;
        sectionPatch[field.key] = v;
      }

      if (Object.keys(sectionPatch).length > 0) {
        patch[section.id] = sectionPatch;
      }
    }

    await onSubmitPatch(patch);
    // After saving, keep the form clean; caller should invalidate/refetch detail.
    form.reset(buildInitialValues(detail));
  });

  const secrets = detail.secrets || {};

  return (
    <form onSubmit={onSubmit}>
      <div className="flex flex-col gap-4">
        {(detail.setting_schema.sections || []).map((section) => (
          <Card key={section.id} size="small" title={section.title || section.id}>
            <div className="flex flex-col gap-3">
              {(section.fields || []).map((field) => {
                const path = `${section.id}.${field.key}`;
                const alreadySet = Boolean(secrets[path]);

                if (field.type === "bool") {
                  return (
                    <div key={field.key} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Typography.Text strong>{field.label || field.key}</Typography.Text>
                        {field.description ? (
                          <div className="text-sm text-muted-foreground">{field.description}</div>
                        ) : null}
                      </div>
                      <Controller
                        control={form.control}
                        name={`${section.id}.${field.key}`}
                        render={({ field: rhfField }) => (
                          <Switch
                            checked={Boolean(rhfField.value)}
                            onChange={(checked) => rhfField.onChange(checked)}
                            disabled={disabled || saving}
                          />
                        )}
                      />
                    </div>
                  );
                }

                const isPassword = Boolean(field.secret) || field.ui?.input === "password";

                return (
                  <div key={field.key} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-3">
                      <Typography.Text strong>{field.label || field.key}</Typography.Text>
                      {field.secret ? (
                        <Typography.Text type="secondary">
                          {alreadySet ? t("plugin:PLUGIN_SECRET_SET") : t("plugin:PLUGIN_SECRET_NOT_SET")}
                        </Typography.Text>
                      ) : null}
                    </div>
                    {field.description ? (
                      <div className="text-sm text-muted-foreground">{field.description}</div>
                    ) : null}
                    <Controller
                      control={form.control}
                      name={`${section.id}.${field.key}`}
                      render={({ field: rhfField }) =>
                        isPassword ? (
                          <Input.Password
                            value={String(rhfField.value || "")}
                            onChange={(e) => rhfField.onChange(e.target.value)}
                            placeholder={field.secret ? t("plugin:PLUGIN_SECRET_PLACEHOLDER") : undefined}
                            disabled={disabled || saving}
                            autoComplete="off"
                          />
                        ) : (
                          <Input
                            value={typeof rhfField.value === "string" ? rhfField.value : String(rhfField.value || "")}
                            onChange={(e) => rhfField.onChange(e.target.value)}
                            disabled={disabled || saving}
                            autoComplete="off"
                          />
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        ))}

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={disabled || saving}>
            {t("settings:SETTINGS_SAVE")}
          </Button>
        </div>
      </div>
    </form>
  );
}
