import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { PasswordInput } from "@arclayer/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Switch } from "@arclayer/ui/switch";
import type { SettingsOptionItem, SystemSettingsDetail, SettingsSchemaItem } from "@/types/api";

type FormValues = Record<string, unknown>;

function zodForFieldType(type: string): z.ZodTypeAny {
  const t = String(type || "")
    .trim()
    .toLowerCase();
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
      ? (detail.settingSchema.sections || []).filter(
          (s) => String(s.id || "").trim() === sectionId.trim(),
        )
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

export interface ExtensionSettingsFormProps {
  detail: SystemSettingsDetail;
  disabled?: boolean;
  saving?: boolean;
  sectionId?: string;
  submitText?: string;
  resetOnSubmit?: boolean;
  onSubmitPatch: (patch: Record<string, unknown>) => Promise<void>;
}

export function ExtensionSettingsForm({
  detail,
  disabled = false,
  saving = false,
  sectionId,
  submitText,
  resetOnSubmit = true,
  onSubmitPatch,
}: ExtensionSettingsFormProps) {
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
        ? (detail.settingSchema.sections || []).filter(
            (s) => String(s.id || "").trim() === sectionId.trim(),
          )
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
    if (resetOnSubmit) {
      // After saving, keep the form clean; caller should invalidate/refetch detail.
      form.reset(buildInitialValues(detail, { sectionId }));
    }
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
                <div className="text-title4 font-semibold">{section.title || section.id}</div>
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
                    className={[
                      "grid gap-3 py-3 border-b border-border/60 last:border-b-0",
                      "grid-cols-1 sm:grid-cols-[240px_minmax(0,1fr)]",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate font-semibold text-foreground">
                          {field.label || field.key}
                        </div>
                        {field.secret ? (
                          <div className="text-footnote text-label-secondary">
                            {alreadySet
                              ? t("plugin:PLUGIN_SECRET_SET")
                              : t("plugin:PLUGIN_SECRET_NOT_SET")}
                          </div>
                        ) : null}
                      </div>
                      {field.description ? (
                        <div className="mt-1 text-footnote text-label-secondary">
                          {field.description}
                        </div>
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
                              onCheckedChange={(checked) => rhfField.onChange(checked)}
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
                                value={
                                  rhfField.value === undefined ? undefined : String(rhfField.value)
                                }
                                onValueChange={(value) => rhfField.onChange(value)}
                                disabled={disabled || saving}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder={t("common:SELECT")} />
                                </SelectTrigger>
                                <SelectContent position="popper" align="start">
                                  {(field.options || []).map((opt) => {
                                    const desc =
                                      typeof opt.description === "string"
                                        ? opt.description.trim()
                                        : "";
                                    return (
                                      <SelectItem key={String(opt.value)} value={String(opt.value)}>
                                        <div className="py-1">
                                          <div className="font-medium">{optionLabel(opt)}</div>
                                          {desc ? (
                                            <div className="text-caption text-label-secondary">
                                              {desc}
                                            </div>
                                          ) : null}
                                        </div>
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            ) : isPassword ? (
                              <PasswordInput
                                value={String(rhfField.value || "")}
                                onChange={(e) => rhfField.onChange(e.target.value)}
                                placeholder={
                                  field.secret ? t("plugin:PLUGIN_SECRET_PLACEHOLDER") : undefined
                                }
                                disabled={disabled || saving}
                                autoComplete="off"
                              />
                            ) : (
                              <Input
                                value={
                                  typeof rhfField.value === "string"
                                    ? rhfField.value
                                    : String(rhfField.value || "")
                                }
                                type={
                                  field.type === "int" || field.type === "float" ? "number" : "text"
                                }
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
          <Button type="submit" disabled={disabled || saving} loading={saving}>
            {submitText || t("settings:SETTINGS_SAVE")}
          </Button>
        </div>
      </div>
    </form>
  );
}
