"use client";

import { Button as AntButton, Select, Tag, Tooltip } from "antd";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";

import type { Role } from "@/api/rbac";
import { createTeamInviteLink } from "@/api/team";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/animate-ui/components/radix/dialog";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifyError, notifySuccessText } from "@/utils/notifications";

type FormValues = {
  emails: string[];
  roleCode: string;
};

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
  orgName: string;
  roles: Role[];
  rolesLoading?: boolean;
  onInvited?: () => void;
}) {
  const { t } = useTranslation(["team", "common"]);

  const schema = React.useMemo(() => {
    const required = t("team:TEAM_INVITE_VALIDATION_TO_REQUIRED");

    return z.object({
      emails: z
        .array(z.string())
        .min(1, required)
        .superRefine((val, ctx) => {
          const emails = normalizeEmailList(val);
          // `min(1)` already covers required; here we only validate format.
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
    });
  }, [t]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      emails: [],
      roleCode: "",
    },
    mode: "onSubmit",
  });

  React.useEffect(() => {
    if (!props.open) {
      form.reset({ emails: [], roleCode: "" });
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

      const created = await createTeamInviteLink({
        roleCode,
        expiresInSeconds: undefined,
        emails,
      });

      return { created, emailCount: emails.length };
    },
    onSuccess: async ({ created, emailCount }) => {
      if (created.inviteUrl) {
        try {
          await navigator.clipboard.writeText(created.inviteUrl);
        } catch {
          // ignore clipboard failures
        }
      }

      notifySuccessText(t("team:TEAM_INVITE_SUCCESS", { count: emailCount }));
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

  const emailTags = form.watch("emails");
  const selectedRoleCode = form.watch("roleCode");

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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("team:TEAM_INVITE_DIALOG_TITLE", { orgName: props.orgName })}
          </DialogTitle>
          <DialogDescription>{t("team:TEAM_INVITE_DIALOG_DESC")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-5 py-2">
          <div className="grid gap-1.5">
            <label className="text-muted-foreground font-semibold" htmlFor="to">
              {t("team:TEAM_INVITE_FIELD_TO")}
            </label>
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
              getPopupContainer={(node) => node.parentElement ?? document.body}
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
                    style={{ marginInlineEnd: 0 }}
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

          <div className="grid gap-1.5">
            <label className="text-muted-foreground font-semibold" htmlFor="roleCode">
              {t("team:TEAM_INVITE_FIELD_ROLE")}
            </label>
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
              getPopupContainer={(node) => node.parentElement ?? document.body}
            />
            <div className="text-muted-foreground">{t("team:TEAM_INVITE_ROLE_HELP")}</div>
            {form.formState.errors.roleCode?.message ? (
              <div className="text-sm text-destructive">
                {String(form.formState.errors.roleCode.message)}
              </div>
            ) : null}
          </div>
        </form>

        <DialogFooter>
          <AntButton onClick={() => props.onOpenChange(false)} disabled={inviteMutation.isPending}>
            {t("common:CANCEL")}
          </AntButton>
          <AntButton
            type="primary"
            loading={inviteMutation.isPending}
            onClick={() => void onSubmit()}
          >
            {t("common:CONFIRM")}
          </AntButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
