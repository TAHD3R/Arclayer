import { Button, Input, Select, Switch, Typography } from "antd";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { ReactNode } from "react";

import { zodResolver } from "@/lib/forms/zod-resolver";
import type { SettingsOptionItem, SystemSettingsDetail, SettingsSchemaItem } from "@/api/settings";

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

function buildZodSchema(
  schema: SettingsSchemaItem,
  opts?: {
    sectionId?: string;
  },
): z.ZodType<FormValues> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const sectionId = opts?.sectionId;
  const sections =
    sectionId && sectionId.trim()
      ? (schema.sections || []).filter((s) => String(s.id || "").trim() === sectionId.trim())
      : schema.sections || [];
  for (const section of sections) {
    const sectionShape: Record<string, z.ZodTypeAny> = {};
    for (const field of section.fields || []) {
      sectionShape[field.key] = zodForFieldType(field.type);
    }
    shape[section.id] = z.object(sectionShape).partial().optional();
  }
  return z.object(shape).partial();
}

function optionLabel(opt: SettingsOptionItem): string {
  const label = typeof opt.label === "string" ? opt.label.trim() : "";
  if (label) return label;
  return String(opt.value ?? "");
}

type SelectOptionRenderArg = {
  label?: ReactNode;
  data?: unknown;
};

function buildInitialValues(
  detail: SystemSettingsDetail,
  opts?: {
    sectionId?: string;
  },
): FormValues {
  const value = detail.value || {};
  const out: Record<string, Record<string, unknown>> = {};
  const sectionId = opts?.sectionId;
  const sections =
    sectionId && sectionId.trim()
      ? (detail.settingSchema.sections || []).filter((s) => String(s.id || "").trim() === sectionId.trim())
      : detail.settingSchema.sections || [];
  for (const section of sections) {
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
  sectionId?: string;
  submitText?: string;
  onSubmitPatch: (patch: Record<string, unknown>) => Promise<void>;
}

export function PluginSettingsForm({
  detail,
  disabled = false,
  saving = false,
  sectionId,
  submitText,
  onSubmitPatch,
}: PluginSettingsFormProps) {
  const { t } = useTranslation(["common", "settings", "plugin"]);

  const zodSchema = useMemo(
    () => buildZodSchema(detail.settingSchema, { sectionId }),
    [detail.settingSchema, sectionId],
  );
  const initialValues = useMemo(
    () => buildInitialValues(detail, { sectionId }),
    [detail, sectionId],
  );

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

    const sections =
      sectionId && sectionId.trim()
        ? (detail.settingSchema.sections || []).filter((s) => String(s.id || "").trim() === sectionId.trim())
        : detail.settingSchema.sections || [];
    for (const section of sections) {
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
    form.reset(buildInitialValues(detail, { sectionId }));
  });

  const secrets = detail.secrets || {};

  const sections = useMemo(() => {
    const all = detail.settingSchema.sections || [];
    if (!sectionId || !sectionId.trim()) return all;
    return all.filter((s) => String(s.id || "").trim() === sectionId.trim());
  }, [detail.settingSchema.sections, sectionId]);

  return (
    <form onSubmit={onSubmit}>
      <div className="flex flex-col gap-4">
        {sections.map((section) => (
          <div key={section.id} className="flex flex-col gap-3">
            {!sectionId ? (
              <div className="pb-2">
                <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 0 }}>
                  {section.title || section.id}
                </Typography.Title>
              </div>
            ) : null}

            <div className="flex flex-col">
              {(section.fields || []).map((field) => {
                const path = `${section.id}.${field.key}`;
                const alreadySet = Boolean(secrets[path]);

                const isPassword = Boolean(field.secret) || field.ui?.input === "password";
                const hasOptions = Array.isArray(field.options) && field.options.length > 0;

                return (
                  <div
                    key={field.key}
                    className={["grid gap-3 py-3 border-b border-border/60 last:border-b-0", "grid-cols-1 sm:grid-cols-[240px_minmax(0,1fr)]"].join(" ")}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <Typography.Text strong className="truncate">
                          {field.label || field.key}
                        </Typography.Text>
                        {field.secret ? (
                          <Typography.Text type="secondary">
                            {alreadySet ? t("plugin:PLUGIN_SECRET_SET") : t("plugin:PLUGIN_SECRET_NOT_SET")}
                          </Typography.Text>
                        ) : null}
                      </div>
                      {field.description ? (
                        <div className="mt-1 text-sm text-muted-foreground">{field.description}</div>
                      ) : null}
                    </div>

                    <div className="min-w-0 max-w-[560px]">
                      {field.type === "bool" ? (
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
                      ) : (
                        <Controller
                          control={form.control}
                          name={`${section.id}.${field.key}`}
                          render={({ field: rhfField }) =>
                            hasOptions ? (
                              <Select
                                value={rhfField.value as unknown}
                                onChange={(v) => rhfField.onChange(v)}
                                options={(field.options || []).map((opt) => ({
                                  value: opt.value,
                                  label: optionLabel(opt),
                                  meta: opt,
                                }))}
                                optionRender={(option: SelectOptionRenderArg) => {
                                  const data = option.data as { meta?: SettingsOptionItem } | undefined;
                                  const meta = data?.meta;
                                  const desc =
                                    meta && typeof meta.description === "string" ? meta.description.trim() : "";
                                  return (
                                    <div className="py-1">
                                      <div className="font-medium">{String(option.label || "")}</div>
                                      {desc ? <div className="text-xs text-muted-foreground">{desc}</div> : null}
                                    </div>
                                  );
                                }}
                                showSearch
                                allowClear
                                disabled={disabled || saving}
                              />
                            ) : isPassword ? (
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
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex justify-start gap-2 pt-2">
          <Button type="primary" htmlType="submit" disabled={disabled || saving} loading={saving}>
            {submitText || t("settings:SETTINGS_SAVE")}
          </Button>
        </div>
      </div>
    </form>
  );
}
