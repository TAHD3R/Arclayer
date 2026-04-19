"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";

import type { Role } from "@/types/api";
import { createTeamInvitation, createTeamInviteLink } from "@/api/team";
import { EmailTagsField } from "@/components/ui/email-tags-field";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { notifyError, notifySuccessText } from "@/lib/notifications";

type FormValues = {
  emails: string[];
  roleCode: string;
  expiresInSeconds: number | null;
  allowedEmailDomain: string;
};

const DEFAULT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

export type InviteMembersDialogMode = "email" | "link";
type ExpiresInSecondsValue = number | null;

function normalizeEmailList(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const email = String(raw || "")
      .trim()
      .toLowerCase();
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function InviteMembersDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: InviteMembersDialogMode;
  workspaceId: string;
  workspaceName: string;
  roles: Role[];
  rolesLoading?: boolean;
  onInvited?: () => void;
}) {
  const { t } = useTranslation(["team", "common"]);

  const schema = React.useMemo(() => {
    return z.object({
      emails: z.array(z.string()).superRefine((val, ctx) => {
        const emails = normalizeEmailList(val);
        if (props.mode === "email" && emails.length <= 0) {
          ctx.addIssue({
            code: "custom",
            path: [],
            message: t("team:TEAM_INVITE_VALIDATION_TO_REQUIRED"),
          });
          return;
        }
        if (props.mode === "link" && emails.length > 0) {
          ctx.addIssue({
            code: "custom",
            path: [],
            message: t("team:TEAM_INVITE_LINK_MODE_NO_EMAILS"),
          });
          return;
        }

        for (const [idx, email] of emails.entries()) {
          if (!z.string().email().safeParse(email).success) {
            ctx.addIssue({
              code: "custom",
              path: [idx],
              message: t("team:TEAM_INVITE_VALIDATION_EMAIL_INVALID", { email }),
            });
            return;
          }
        }
      }),
      roleCode: z.string().min(1, t("team:TEAM_INVITE_VALIDATION_ROLE_REQUIRED")),
      expiresInSeconds: z.number().int().min(60).nullable(),
      allowedEmailDomain: z.string().default(""),
    });
  }, [props.mode, t]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      emails: [],
      roleCode: "",
      expiresInSeconds: DEFAULT_EXPIRES_IN_SECONDS,
      allowedEmailDomain: "",
    },
    mode: "onSubmit",
  });

  React.useEffect(() => {
    if (!props.open) {
      form.reset({
        emails: [],
        roleCode: "",
        expiresInSeconds: DEFAULT_EXPIRES_IN_SECONDS,
        allowedEmailDomain: "",
      });
    }
  }, [form, props.open]);

  React.useEffect(() => {
    if (!props.open) return;
    const current = form.getValues("roleCode");
    if (current) return;
    if (!props.roles.length) return;

    const defaultRole = props.roles.find((role) => role.isDefault) ?? props.roles[0];
    if (!defaultRole) return;
    form.setValue("roleCode", defaultRole.code, { shouldDirty: false });
  }, [form, props.open, props.roles]);

  const inviteMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const emails = normalizeEmailList(values.emails);
      const roleCode = values.roleCode;
      const expiresInSeconds = values.expiresInSeconds;

      if (props.mode === "email") {
        const results = await Promise.allSettled(
          emails.map((email) =>
            createTeamInvitation({
              workspaceId: props.workspaceId,
              email,
              roleCode,
              expiresInSeconds,
            }),
          ),
        );
        const successCount = results.filter((result) => result.status === "fulfilled").length;
        const failed = results.filter(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        const failedCount = failed.length;

        if (successCount === 0 && failedCount > 0) {
          throw failed[0]?.reason;
        }
        return {
          mode: "email" as const,
          successCount,
          failedCount,
          firstInviteUrl: null as string | null,
        };
      }

      const created = await createTeamInviteLink({
        workspaceId: props.workspaceId,
        roleCode,
        expiresInSeconds,
        allowedEmailDomain: values.allowedEmailDomain.trim() || null,
      });

      return {
        mode: "link" as const,
        successCount: 1,
        failedCount: 0,
        firstInviteUrl:
          created.inviteUrl ??
          (typeof window !== "undefined"
            ? `${window.location.origin}/invitations?token=${encodeURIComponent(created.token)}`
            : null),
      };
    },
    onSuccess: async (result) => {
      let copied = false;
      if (result.mode === "link" && result.firstInviteUrl) {
        try {
          await navigator.clipboard.writeText(result.firstInviteUrl);
          copied = true;
        } catch {
          copied = false;
        }
      }

      if (result.mode === "email") {
        if (result.failedCount > 0) {
          notifySuccessText(
            t("team:TEAM_INVITE_SUCCESS_WITH_FAILURE", {
              count: result.successCount,
              failed: result.failedCount,
            }),
          );
        } else {
          notifySuccessText(t("team:TEAM_INVITE_SUCCESS", { count: result.successCount }));
        }
      } else if (result.firstInviteUrl && copied) {
        notifySuccessText(t("team:TEAM_INVITE_LINK_CREATE_SUCCESS_COPIED"));
      } else {
        notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      }
      props.onInvited?.();
      props.onOpenChange(false);
    },
    onError: (err) => notifyError(err),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await inviteMutation.mutateAsync(values);
  });

  const roleOptions = React.useMemo(
    () =>
      props.roles.map((role) => ({
        label: role.name || role.code,
        value: role.code,
      })),
    [props.roles],
  );

  const expiresOptions = React.useMemo<Array<{ label: string; value: ExpiresInSecondsValue }>>(
    () => [
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_1_DAY"), value: 1 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_7_DAYS"), value: 7 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_30_DAYS"), value: 30 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_NEVER"), value: null },
    ],
    [t],
  );

  const emailTags = form.watch("emails");
  const selectedRoleCode = form.watch("roleCode");
  const selectedExpires = form.watch("expiresInSeconds");
  const invalidEmailMessageByValue = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const email of normalizeEmailList(emailTags)) {
      if (!z.string().email().safeParse(email).success) {
        map.set(email, t("team:TEAM_INVITE_VALIDATION_EMAIL_INVALID", { email }));
      }
    }
    return map;
  }, [emailTags, t]);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        props.mode === "link"
          ? t("team:TEAM_INVITE_LINK_CREATE_TITLE", { workspaceName: props.workspaceName })
          : t("team:TEAM_INVITE_DIALOG_TITLE", { workspaceName: props.workspaceName })
      }
      description={
        props.mode === "link"
          ? t("team:TEAM_INVITE_LINK_CREATE_DESC")
          : t("team:TEAM_INVITE_DIALOG_DESC")
      }
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => props.onOpenChange(false)}
            disabled={inviteMutation.isPending}
          >
            {t("common:CANCEL")}
          </Button>
          <Button loading={inviteMutation.isPending} onClick={() => void onSubmit()}>
            {t("common:CONFIRM")}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="py-2">
        <SettingDialogFields>
          {props.mode === "email" ? (
            <SettingDialogField
              title={t("team:TEAM_INVITE_FIELD_TO")}
              description={t("team:TEAM_INVITE_FIELD_TO_HELP")}
              error={
                form.formState.errors.emails?.message ? (
                  <div className="text-footnote text-destructive">
                    {String(form.formState.errors.emails.message)}
                  </div>
                ) : undefined
              }
            >
              <EmailTagsField
                id="invite-emails"
                value={emailTags}
                placeholder={t("team:TEAM_INVITE_FIELD_TO_PLACEHOLDER")}
                invalidMessageByValue={invalidEmailMessageByValue}
                disabled={inviteMutation.isPending}
                onChange={(next) =>
                  form.setValue("emails", normalizeEmailList(next), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </SettingDialogField>
          ) : null}

          <SettingDialogField
            title={t("team:TEAM_INVITE_FIELD_ROLE")}
            description={t("team:TEAM_INVITE_ROLE_HELP")}
            error={
              form.formState.errors.roleCode?.message ? (
                <div className="text-footnote text-destructive">
                  {String(form.formState.errors.roleCode.message)}
                </div>
              ) : undefined
            }
          >
            <Select
              value={selectedRoleCode || undefined}
              onValueChange={(value) =>
                form.setValue("roleCode", value, { shouldDirty: true, shouldValidate: true })
              }
              disabled={props.rolesLoading || inviteMutation.isPending}
            >
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue placeholder={t("team:TEAM_INVITE_FIELD_ROLE_PLACEHOLDER")} />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {roleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingDialogField>

          {props.mode === "link" ? (
            <SettingDialogField
              title={t("common:ORG_INVITE_LINK_ALLOWED_DOMAIN_LABEL")}
              description={t("team:TEAM_INVITE_LINK_ALLOWED_DOMAIN_HELP")}
              error={
                form.formState.errors.allowedEmailDomain?.message ? (
                  <div className="text-footnote text-destructive">
                    {String(form.formState.errors.allowedEmailDomain.message)}
                  </div>
                ) : undefined
              }
            >
              <Input
                id="allowedEmailDomain"
                placeholder={t("team:TEAM_INVITE_LINK_ALLOWED_DOMAIN_PLACEHOLDER")}
                aria-invalid={form.formState.errors.allowedEmailDomain ? true : undefined}
                disabled={inviteMutation.isPending}
                {...form.register("allowedEmailDomain")}
              />
            </SettingDialogField>
          ) : null}

          <SettingDialogField
            title={t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}
            description={t("team:TEAM_INVITE_FIELD_EXPIRES_HELP")}
          >
            <Select
              value={String(selectedExpires)}
              onValueChange={(value) =>
                form.setValue("expiresInSeconds", value === "null" ? null : Number(value), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              disabled={inviteMutation.isPending}
            >
              <SelectTrigger id="invite-expires" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {expiresOptions.map((option) => (
                  <SelectItem key={String(option.value)} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
