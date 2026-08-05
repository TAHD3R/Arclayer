"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";

import type { WorkspaceTeamMemberOut as TeamMember } from "@arclayer/openapi";
import { resetTeamMemberPassword } from "@/api/team";
import { Button } from "@arclayer/ui/button";
import { PasswordInput } from "@arclayer/ui/password-input";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { PasswordRequirementChecklist } from "@/components/auth/password-requirement-checklist";
import { PASSWORD_PATTERN } from "@/lib/auth/form-feedback";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type FormValues = {
  newPassword: string;
  confirmPassword: string;
};

export function ResetUserPasswordDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMember | null;
  onReset?: () => void;
}) {
  const { t } = useTranslation(["team", "common", "auth"]);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const schema = React.useMemo(() => {
    return z
      .object({
        newPassword: z
          .string()
          .min(1, t("auth:VALIDATION_PASSWORD_REQUIRED"))
          .regex(PASSWORD_PATTERN, t("auth:PASSWORD_INVALID")),
        confirmPassword: z.string(),
      })
      .superRefine((val, ctx) => {
        if (val.newPassword !== val.confirmPassword) {
          ctx.addIssue({
            code: "custom",
            path: ["confirmPassword"],
            message: t("team:TEAM_VALIDATION_PASSWORD_MISMATCH"),
          });
        }
      });
  }, [t]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
    mode: "onSubmit",
  });
  const newPasswordValue = form.watch("newPassword");

  React.useEffect(() => {
    if (!props.open) {
      form.reset({ newPassword: "", confirmPassword: "" });
    }
  }, [form, props.open]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const member = props.member;
      if (!member) return null;
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return resetTeamMemberPassword(workspaceId, member.membershipId, {
        newPassword: values.newPassword,
      });
    },
    onSuccess: () => {
      notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      props.onReset?.();
      props.onOpenChange(false);
    },
    onError: (err) => notifyError(err),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await mutation.mutateAsync(values);
  });

  const title = props.member
    ? t("team:TEAM_RESET_PASSWORD_TITLE", { username: props.member.username })
    : t("team:TEAM_RESET_PASSWORD_TITLE_FALLBACK");

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={title}
      description={t("team:TEAM_RESET_PASSWORD_DESC")}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => props.onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={mutation.isPending || !props.member}
            onClick={() => void onSubmit()}
          >
            {t("common:CONFIRM")}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <SettingDialogFields>
          <SettingDialogField
            title={t("team:TEAM_FIELD_NEW_PASSWORD")}
            description={t("team:TEAM_RESET_PASSWORD_FIELD_NEW_PASSWORD_HELP")}
            error={form.formState.errors.newPassword?.message?.toString()}
          >
            <div className="grid gap-3">
              <PasswordInput
                id="newPassword"
                autoComplete="new-password"
                disabled={mutation.isPending}
                {...form.register("newPassword")}
              />
              <PasswordRequirementChecklist
                password={newPasswordValue}
                active={
                  Boolean(form.formState.dirtyFields.newPassword) || newPasswordValue.length > 0
                }
                t={t}
              />
            </div>
          </SettingDialogField>

          <SettingDialogField
            title={t("team:TEAM_FIELD_CONFIRM_PASSWORD")}
            description={t("team:TEAM_RESET_PASSWORD_FIELD_CONFIRM_PASSWORD_HELP")}
            error={form.formState.errors.confirmPassword?.message?.toString()}
          >
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              disabled={mutation.isPending}
              {...form.register("confirmPassword")}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
