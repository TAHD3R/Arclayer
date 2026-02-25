"use client";

import { Button as AntButton, Input, Select, Tag, Tooltip } from "antd";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

import type { Role } from "@/api/rbac";
import { createTeamInvitation, createTeamInviteLink } from "@/api/team";
import { SettingDialog } from "@/components/common/setting-dialog";
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
  // Preserve order but de-duplicate.
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
        // Mode=email: emails are required.
        // Mode=link: emails must be empty (we intentionally avoid ambiguous behavior).
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

        // If provided, validate format.
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

  // When opening the dialog, preselect the default role (or the first role) for a smoother UX.
  React.useEffect(() => {
    if (!props.open) return;
    const current = form.getValues("roleCode");
    if (current) return;
    if (!props.roles.length) return;

    const defaultRole = props.roles.find((r) => r.isDefault) ?? props.roles[0];
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
        const successCount = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        const failedCount = failed.length;

        // If everything failed, surface the first error to avoid "0 success" misleading toasts.
        if (successCount === 0 && failedCount > 0) {
          throw failed[0]?.reason;
        }
        return {
          mode: "email" as const,
          successCount,
          failedCount,
          firstInviteUrl: null as string | null,
          firstToken: null as string | null,
        };
      }

      const created = await createTeamInviteLink({
        workspaceId: props.workspaceId,
        roleCode,
        expiresInSeconds,
        allowedEmailDomain: values.allowedEmailDomain.trim() || null,
      });

      const url =
        created.inviteUrl ??
        (typeof window !== "undefined"
          ? `${window.location.origin}/accept-invite?token=${encodeURIComponent(created.token)}`
          : null);

      return {
        mode: "link" as const,
        successCount: 1,
        failedCount: 0,
        firstInviteUrl: url,
        firstToken: created.token,
      };
    },
    onSuccess: async (result) => {
      let copied = false;
      if (result.mode === "link" && result.firstInviteUrl) {
        try {
          await navigator.clipboard.writeText(result.firstInviteUrl);
          copied = true;
        } catch {
          // ignore clipboard failures
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

  const roleOptions = React.useMemo(() => {
    return props.roles.map((r) => ({
      label: r.name || r.code,
      value: r.code,
    }));
  }, [props.roles]);

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
      contentClassName="sm:max-w-xl"
      footer={
        <>
          <AntButton
            type="text"
            onClick={() => props.onOpenChange(false)}
            disabled={inviteMutation.isPending}
          >
            {t("common:CANCEL")}
          </AntButton>
          <AntButton
            type="primary"
            loading={inviteMutation.isPending}
            onClick={() => void onSubmit()}
          >
            {t("common:CONFIRM")}
          </AntButton>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-5 py-2">
        {props.mode === "email" ? (
          <div className="grid gap-1.5">
            <label className="font-semibold text-foreground" htmlFor="to">
              {t("team:TEAM_INVITE_FIELD_TO")}
            </label>
            <div className="text-label-secondary">{t("team:TEAM_INVITE_FIELD_TO_HELP")}</div>
            <Select
              id="to"
              mode="tags"
              suffixIcon={false}
              open={false}
              tokenSeparators={[" ", "\n", ",", ";", "，", "；", "\t"]}
              placeholder={t("team:TEAM_INVITE_FIELD_TO_PLACEHOLDER")}
              value={emailTags}
              onChange={(next) => {
                form.setValue("emails", normalizeEmailList(next), {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              options={[]}
              notFoundContent={null}
              tagRender={(tagProps) => {
                const value = String(tagProps.value || "").trim();
                const message = invalidEmailMessageByValue.get(value) ?? null;
                const closable = tagProps.closable;
                const onClose = tagProps.onClose;

                const tag = (
                  <Tag
                    color={message ? "error" : "default"}
                    closable={closable}
                    onClose={onClose}
                    className="!mr-0"
                  >
                    {tagProps.label}
                  </Tag>
                );

                return message ? (
                  <Tooltip title={message} placement="top">
                    {tag}
                  </Tooltip>
                ) : (
                  tag
                );
              }}
            />
            {form.formState.errors.emails?.message ? (
              <div className="text-destructive">{String(form.formState.errors.emails.message)}</div>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground" htmlFor="roleCode">
            {t("team:TEAM_INVITE_FIELD_ROLE")}
          </label>
          <div className="text-label-secondary">{t("team:TEAM_INVITE_ROLE_HELP")}</div>
          <Select
            id="roleCode"
            showSearch
            optionFilterProp="label"
            loading={props.rolesLoading}
            value={selectedRoleCode || undefined}
            onChange={(v) =>
              form.setValue("roleCode", String(v), { shouldDirty: true, shouldValidate: true })
            }
            options={roleOptions}
            placeholder={t("team:TEAM_INVITE_FIELD_ROLE_PLACEHOLDER")}
            // Keep dropdown inside the dialog; otherwise Radix overlay may block item clicks.
            getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
          />
          {form.formState.errors.roleCode?.message ? (
            <div className="text-footnote text-destructive">
              {String(form.formState.errors.roleCode.message)}
            </div>
          ) : null}
        </div>

        {props.mode === "link" ? (
          <div className="grid gap-1.5">
            <label className="font-semibold text-foreground" htmlFor="allowedEmailDomain">
              {t("common:ORG_INVITE_LINK_ALLOWED_DOMAIN_LABEL")}
            </label>
            <div className="text-label-secondary">
              {t("team:TEAM_INVITE_LINK_ALLOWED_DOMAIN_HELP")}
            </div>
            <Input
              id="allowedEmailDomain"
              placeholder={t("common:ORG_INVITE_LINK_ALLOWED_DOMAIN_PLACEHOLDER")}
              value={form.watch("allowedEmailDomain")}
              onChange={(e) =>
                form.setValue("allowedEmailDomain", e.target.value, { shouldDirty: true })
              }
            />
          </div>
        ) : null}

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground" htmlFor="expiresInSeconds">
            {t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}
          </label>
          <div className="text-label-secondary">{t("team:TEAM_INVITE_FIELD_EXPIRES_HELP")}</div>
          <Select<ExpiresInSecondsValue>
            id="expiresInSeconds"
            value={selectedExpires}
            // antd emits `null` when selecting the "never" option.
            onChange={(v) =>
              form.setValue("expiresInSeconds", v, {
                shouldDirty: true,
              })
            }
            options={expiresOptions}
            getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
          />
        </div>
      </form>
    </SettingDialog>
  );
}
