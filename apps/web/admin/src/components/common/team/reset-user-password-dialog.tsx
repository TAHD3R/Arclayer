"use client";

import { Button as AntButton } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";

import type { TeamMember } from "@/api/team";
import { resetTeamMemberPassword } from "@/api/team";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("team:TEAM_RESET_PASSWORD_DESC")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <label className="text-sm text-muted-foreground" htmlFor="newPassword">
              {t("team:TEAM_FIELD_NEW_PASSWORD")}
            </label>
            <Input
              id="newPassword"
              type="password"
              disabled={mutation.isPending}
              {...form.register("newPassword")}
            />
            {form.formState.errors.newPassword?.message ? (
              <div className="text-sm text-destructive">
                {String(form.formState.errors.newPassword.message)}
              </div>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm text-muted-foreground" htmlFor="confirmPassword">
              {t("team:TEAM_FIELD_CONFIRM_PASSWORD")}
            </label>
            <Input
              id="confirmPassword"
              type="password"
              disabled={mutation.isPending}
              {...form.register("confirmPassword")}
            />
            {form.formState.errors.confirmPassword?.message ? (
              <div className="text-sm text-destructive">
                {String(form.formState.errors.confirmPassword.message)}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <AntButton onClick={() => props.onOpenChange(false)} disabled={mutation.isPending}>
              {t("common:CANCEL")}
            </AntButton>
            <AntButton
              type="primary"
              htmlType="submit"
              loading={mutation.isPending}
              disabled={mutation.isPending || !props.member}
            >
              {t("common:CONFIRM")}
            </AntButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
