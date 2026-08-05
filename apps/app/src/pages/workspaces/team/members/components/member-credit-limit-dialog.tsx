"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import type { MemberCreditLimitItemOut } from "@/api/commerce";
import { zodResolver } from "@/lib/forms/zod-resolver";
import type {
  MemberCreditOverrideFeedback,
  MemberCreditOverrideInput,
} from "@/pages/workspaces/team/members/use-member-credit-limit-overrides";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";

const FORM_ID = "member-credit-limit-override-form";

type OverrideValues = {
  overrideKind: "inherit" | "limited" | "unlimited";
  limitCredits: string;
};

function buildOverrideSchema(t: ReturnType<typeof useTranslation>["t"]) {
  return z
    .object({
      overrideKind: z.enum(["inherit", "limited", "unlimited"]),
      limitCredits: z.string(),
    })
    .superRefine((values, context) => {
      if (values.overrideKind !== "limited") return;
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

function valuesFromItem(item: MemberCreditLimitItemOut | null): OverrideValues {
  const override = item?.overrideLimit ?? null;
  if (override === null) return { overrideKind: "inherit", limitCredits: "" };
  return {
    overrideKind: override.limitKind,
    limitCredits: override.limitKind === "limited" ? String(override.limitCredits) : "",
  };
}

function commandFromValues(values: OverrideValues): MemberCreditOverrideInput {
  if (values.overrideKind === "inherit") return { action: "clear" };
  if (values.overrideKind === "unlimited") {
    return { action: "set", limitKind: "unlimited", limitCredits: null };
  }
  return {
    action: "set",
    limitKind: "limited",
    limitCredits: Number(values.limitCredits.trim()),
  };
}

export function MemberCreditLimitDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  item: MemberCreditLimitItemOut | null;
  configurationRevision: number | null;
  pending: boolean;
  feedback: MemberCreditOverrideFeedback;
  onEdit: () => void;
  onSave: (input: MemberCreditOverrideInput) => Promise<void>;
}) {
  const { t } = useTranslation(["commerce", "common"]);
  const schema = useMemo(() => buildOverrideSchema(t), [t]);
  const form = useForm<OverrideValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesFromItem(props.item),
  });
  const overrideKind = form.watch("overrideKind");
  const creditError = form.formState.errors.limitCredits?.message;

  useEffect(() => {
    if (!props.open) return;
    form.reset(valuesFromItem(props.item));
  }, [form, props.configurationRevision, props.item, props.open]);

  const submit = form.handleSubmit(async (values) => {
    if (!props.item) return;
    const command = commandFromValues(values);
    try {
      await props.onSave(command);
      form.reset(values);
    } catch {
      // The controller keeps explicit conflict/error feedback visible and refreshes canonical data.
    }
  });
  const feedbackText = props.pending
    ? t("commerce:MEMBER_LIMIT_SAVING")
    : props.feedback === "saved"
      ? t("commerce:MEMBER_LIMIT_SAVED")
      : props.feedback === "conflict"
        ? t("commerce:MEMBER_LIMIT_CONFLICT")
        : props.feedback === "error"
          ? t("commerce:MEMBER_LIMIT_SAVE_ERROR")
          : null;
  const feedbackDestructive = props.feedback === "conflict" || props.feedback === "error";

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => {
        if (props.pending) return;
        props.onOpenChange(open);
      }}
      title={t("commerce:MEMBER_LIMIT_OVERRIDE_TITLE", { memberName: props.memberName })}
      description={t("commerce:MEMBER_LIMIT_OVERRIDE_DESCRIPTION")}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p
            className={
              feedbackDestructive
                ? "text-footnote text-destructive"
                : "text-footnote text-label-secondary"
            }
            aria-live="polite"
          >
            {feedbackText}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={props.pending}
              onClick={() => props.onOpenChange(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="submit"
              form={FORM_ID}
              loading={props.pending}
              disabled={props.pending || !props.item || !form.formState.isDirty}
            >
              {t("common:CONFIRM")}
            </Button>
          </div>
        </div>
      }
    >
      {props.item ? (
        <form id={FORM_ID} onSubmit={(event) => void submit(event)} noValidate>
          <SettingDialogFields>
            <SettingDialogField
              title={t("commerce:MEMBER_LIMIT_MODE_LABEL")}
              description={t("commerce:MEMBER_LIMIT_OVERRIDE_MODE_DESCRIPTION")}
            >
              <Select
                value={overrideKind}
                disabled={props.pending}
                onValueChange={(value) => {
                  if (value !== "inherit" && value !== "limited" && value !== "unlimited") return;
                  form.setValue("overrideKind", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  props.onEdit();
                }}
              >
                <SelectTrigger aria-label={t("commerce:MEMBER_LIMIT_MODE_LABEL")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">{t("commerce:MEMBER_LIMIT_INHERIT")}</SelectItem>
                  <SelectItem value="limited">{t("commerce:MEMBER_LIMIT_LIMITED")}</SelectItem>
                  <SelectItem value="unlimited">{t("commerce:MEMBER_LIMIT_UNLIMITED")}</SelectItem>
                </SelectContent>
              </Select>
            </SettingDialogField>

            <SettingDialogField
              title={t("commerce:MEMBER_LIMIT_CREDITS_LABEL")}
              description={
                overrideKind === "inherit"
                  ? t("commerce:MEMBER_LIMIT_INHERIT_DESCRIPTION")
                  : overrideKind === "unlimited"
                    ? t("commerce:MEMBER_LIMIT_UNLIMITED_DESCRIPTION")
                    : t("commerce:MEMBER_LIMIT_CREDITS_DESCRIPTION")
              }
              error={creditError}
            >
              <Input
                {...form.register("limitCredits", { onChange: props.onEdit })}
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                disabled={props.pending || overrideKind !== "limited"}
                aria-label={t("commerce:MEMBER_LIMIT_CREDITS_LABEL")}
                aria-invalid={Boolean(creditError)}
                className="text-right tabular-nums"
              />
            </SettingDialogField>
          </SettingDialogFields>
        </form>
      ) : (
        <p className="text-callout text-label-secondary">
          {t("commerce:MEMBER_LIMIT_OVERRIDE_UNAVAILABLE")}
        </p>
      )}
    </SettingDialog>
  );
}
