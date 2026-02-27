"use client";

import { Button as AntButton } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";

import type { TeamMember } from "@/types/api";
import { resetTeamMemberPassword } from "@/api/team";
import { SettingDialog } from "@/components/common/setting-dialog";
import { Input } from "@/components/ui/input";
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
  const { t } = useTranslation(["team", "common"]);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const schema = React.useMemo(() => {
    return z
      .object({
        newPassword: z
          .string()
          .min(8, t("team:TEAM_VALIDATION_PASSWORD_MIN"))
          .max(128, t("team:TEAM_VALIDATION_PASSWORD_MAX")),
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
      contentClassName="sm:max-w-xl"
      footer={
        <>
          <AntButton
            type="text"
            onClick={() => props.onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t("common:CANCEL")}
          </AntButton>
          <AntButton
            type="primary"
            loading={mutation.isPending}
            disabled={mutation.isPending || !props.member}
            onClick={() => void onSubmit()}
          >
            {t("common:CONFIRM")}
          </AntButton>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground" htmlFor="newPassword">
            {t("team:TEAM_FIELD_NEW_PASSWORD")}
          </label>
          <div className="text-label-secondary">
            {t("team:TEAM_RESET_PASSWORD_FIELD_NEW_PASSWORD_HELP")}
          </div>
          <Input
            id="newPassword"
            type="password"
            disabled={mutation.isPending}
            {...form.register("newPassword")}
          />
          {form.formState.errors.newPassword?.message ? (
            <div className="text-footnote text-destructive">
              {String(form.formState.errors.newPassword.message)}
            </div>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground" htmlFor="confirmPassword">
            {t("team:TEAM_FIELD_CONFIRM_PASSWORD")}
          </label>
          <div className="text-label-secondary">
            {t("team:TEAM_RESET_PASSWORD_FIELD_CONFIRM_PASSWORD_HELP")}
          </div>
          <Input
            id="confirmPassword"
            type="password"
            disabled={mutation.isPending}
            {...form.register("confirmPassword")}
          />
          {form.formState.errors.confirmPassword?.message ? (
            <div className="text-footnote text-destructive">
              {String(form.formState.errors.confirmPassword.message)}
            </div>
          ) : null}
        </div>
      </form>
    </SettingDialog>
  );
}
