import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import type { MemberCreditLimitInput, MemberCreditLimitOut } from "@/api/commerce";
import { SystemSettingItem, SystemSettingRow } from "@/components/settings/setting-item";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { Button } from "@arclayer/ui/button";
import { FieldError } from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

type LimitValues = {
  limitKind: "limited" | "unlimited";
  limitCredits: string;
};

type Feedback = "idle" | "saved" | "conflict" | "error";

function buildLimitSchema(t: ReturnType<typeof useTranslation>["t"]) {
  return z
    .object({
      limitKind: z.enum(["limited", "unlimited"]),
      limitCredits: z.string(),
    })
    .superRefine((values, context) => {
      if (values.limitKind === "unlimited") return;
      const normalized = values.limitCredits.trim();
      const parsed = Number(normalized);
      if (!/^[1-9]\d*$/.test(normalized) || !Number.isSafeInteger(parsed)) {
        context.addIssue({
          code: "custom",
          path: ["limitCredits"],
          message: t("commerce:MEMBER_LIMIT_POSITIVE_INTEGER_ERROR"),
        });
      }
    });
}

function valuesFromLimit(limit: MemberCreditLimitOut): LimitValues {
  return {
    limitKind: limit.limitKind,
    limitCredits: limit.limitKind === "limited" ? String(limit.limitCredits) : "",
  };
}

export function DefaultMemberCreditLimitEditor(props: {
  limit: MemberCreditLimitOut;
  configurationRevision: number;
  pending: boolean;
  feedback: Feedback;
  onEdit: () => void;
  onSave: (input: MemberCreditLimitInput) => Promise<void>;
}) {
  const { t } = useTranslation(["commerce", "settings"]);
  const schema = useMemo(() => buildLimitSchema(t), [t]);
  const form = useForm<LimitValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesFromLimit(props.limit),
  });
  const limitKind = form.watch("limitKind");
  const creditError = form.formState.errors.limitCredits?.message;

  useEffect(() => {
    form.reset(valuesFromLimit(props.limit));
  }, [form, props.configurationRevision, props.limit]);

  const submit = form.handleSubmit(async (values) => {
    const input: MemberCreditLimitInput =
      values.limitKind === "unlimited"
        ? { limitKind: "unlimited", limitCredits: null }
        : { limitKind: "limited", limitCredits: Number(values.limitCredits.trim()) };
    try {
      await props.onSave(input);
      form.reset(valuesFromLimit(input));
    } catch {
      // The controller exposes the failure state inline. Conflict refreshes intentionally reset
      // the form to the canonical server value through the effect above.
    }
  });

  const statusText = props.pending
    ? t("commerce:MEMBER_LIMIT_SAVING")
    : props.feedback === "conflict"
      ? t("commerce:MEMBER_LIMIT_CONFLICT")
      : props.feedback === "error"
        ? t("commerce:MEMBER_LIMIT_SAVE_ERROR")
        : form.formState.isDirty
          ? t("settings:SETTINGS_UNSAVED_CHANGES")
          : props.feedback === "saved"
            ? t("commerce:MEMBER_LIMIT_SAVED")
            : t("commerce:MEMBER_LIMIT_SYNCED");

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <SystemSettingItem
        id="default-member-credit-limit"
        title={t("commerce:MEMBER_LIMIT_DEFAULT_TITLE")}
        description={t("commerce:MEMBER_LIMIT_DEFAULT_DESCRIPTION")}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-footnote text-label-secondary" aria-live="polite">
              {statusText}
            </p>
            {form.formState.isDirty ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={props.pending}
                  onClick={() => {
                    form.reset(valuesFromLimit(props.limit));
                    props.onEdit();
                  }}
                >
                  {t("settings:SETTINGS_RESET")}
                </Button>
                <Button type="submit" loading={props.pending} disabled={props.pending}>
                  {t("settings:SETTINGS_SAVE")}
                </Button>
              </div>
            ) : null}
          </div>
        }
      >
        <div className="divide-y divide-border/60">
          <SystemSettingRow
            title={t("commerce:MEMBER_LIMIT_MODE_LABEL")}
            description={
              <span id="default-member-credit-limit-mode-description">
                {t("commerce:MEMBER_LIMIT_MODE_DESCRIPTION")}
              </span>
            }
            control={
              <Select
                value={limitKind}
                disabled={props.pending}
                onValueChange={(value) => {
                  if (value !== "limited" && value !== "unlimited") return;
                  form.setValue("limitKind", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  props.onEdit();
                }}
              >
                <SelectTrigger
                  aria-label={t("commerce:MEMBER_LIMIT_MODE_LABEL")}
                  aria-describedby="default-member-credit-limit-mode-description"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="limited">{t("commerce:MEMBER_LIMIT_LIMITED")}</SelectItem>
                  <SelectItem value="unlimited">{t("commerce:MEMBER_LIMIT_UNLIMITED")}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SystemSettingRow
            title={t("commerce:MEMBER_LIMIT_CREDITS_LABEL")}
            description={
              <span id="default-member-credit-limit-credits-description">
                {limitKind === "limited"
                  ? t("commerce:MEMBER_LIMIT_CREDITS_DESCRIPTION")
                  : t("commerce:MEMBER_LIMIT_UNLIMITED_DESCRIPTION")}
              </span>
            }
            control={
              <div className="w-40">
                <Input
                  {...form.register("limitCredits", { onChange: props.onEdit })}
                  id="default-member-credit-limit-input"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  disabled={props.pending || limitKind === "unlimited"}
                  aria-label={t("commerce:MEMBER_LIMIT_CREDITS_LABEL")}
                  aria-invalid={Boolean(creditError)}
                  aria-describedby={
                    creditError
                      ? "default-member-credit-limit-credits-description default-member-credit-limit-error"
                      : "default-member-credit-limit-credits-description"
                  }
                  className="text-right tabular-nums"
                />
                {creditError ? (
                  <FieldError id="default-member-credit-limit-error" className="mt-1 text-left">
                    {creditError}
                  </FieldError>
                ) : null}
              </div>
            }
          />
        </div>
      </SystemSettingItem>
    </form>
  );
}
