"use client";

import { Button as AntButton, Divider, Select } from "antd";
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
  roleCode: string;
  expiresInSeconds: number | null;
};

const DEFAULT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

export function CreateInviteLinkDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgName: string;
  roles: Role[];
  rolesLoading?: boolean;
  onCreated?: () => void;
}) {
  const { t } = useTranslation(["team", "common"]);

  const schema = React.useMemo(() => {
    return z.object({
      roleCode: z.string().min(1, t("team:TEAM_INVITE_LINK_CREATE_VALIDATION_ROLE_REQUIRED")),
      expiresInSeconds: z.number().int().min(60).nullable(),
    });
  }, [t]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      roleCode: "",
      expiresInSeconds: DEFAULT_EXPIRES_IN_SECONDS,
    },
    mode: "onSubmit",
  });

  React.useEffect(() => {
    if (!props.open) {
      form.reset({ roleCode: "", expiresInSeconds: DEFAULT_EXPIRES_IN_SECONDS });
    }
  }, [form, props.open]);

  // Preselect default role on open (if not selected).
  React.useEffect(() => {
    if (!props.open) return;
    const current = form.getValues("roleCode");
    if (current) return;
    if (!props.roles.length) return;
    const defaultRole = props.roles.find((r) => r.isDefault) ?? props.roles[0];
    if (!defaultRole) return;
    form.setValue("roleCode", defaultRole.code, { shouldDirty: false });
  }, [form, props.open, props.roles]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      return createTeamInviteLink({
        roleCode: values.roleCode,
        expiresInSeconds: values.expiresInSeconds,
      });
    },
    onSuccess: async (data) => {
      // Invite link token is only returned once. Best-effort copy the invite URL for sharing.
      if (data.inviteUrl) {
        try {
          await navigator.clipboard.writeText(data.inviteUrl);
          notifySuccessText(t("team:TEAM_INVITE_LINK_CREATE_SUCCESS_COPIED"));
        } catch {
          notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
        }
      } else {
        notifySuccessText(t("team:TEAM_ACTION_SUCCESS"));
      }
      props.onCreated?.();
      props.onOpenChange(false);
    },
    onError: (err) => notifyError(err),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await mutation.mutateAsync(values);
  });

  const roleOptions = React.useMemo(
    () =>
      props.roles.map((r) => ({
        label: r.name || r.code,
        value: r.code,
      })),
    [props.roles],
  );

  const expiresOptions = React.useMemo(
    () => [
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_1_DAY"), value: 1 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_7_DAYS"), value: 7 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_30_DAYS"), value: 30 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_NEVER"), value: null },
    ],
    [t],
  );

  const selectedRoleCode = form.watch("roleCode");
  const selectedExpires = form.watch("expiresInSeconds");

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("team:TEAM_INVITE_LINK_CREATE_TITLE", { orgName: props.orgName })}
          </DialogTitle>
          <DialogDescription>{t("team:TEAM_INVITE_LINK_CREATE_DESC")}</DialogDescription>
        </DialogHeader>

        <Divider className="my-0" />

        <form onSubmit={onSubmit} className="grid gap-5 py-2">
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
              getPopupContainer={(node) => node.parentElement ?? document.body}
            />
            {form.formState.errors.roleCode?.message ? (
              <div className="text-sm text-destructive">
                {String(form.formState.errors.roleCode.message)}
              </div>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <label className="text-muted-foreground font-semibold" htmlFor="expiresInSeconds">
              {t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}
            </label>
            <Select
              id="expiresInSeconds"
              value={selectedExpires}
              // antd emits `null` when selecting the "never" option.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onChange={(v: any) =>
                form.setValue("expiresInSeconds", v === null ? null : Number(v), {
                  shouldDirty: true,
                })
              }
              options={expiresOptions}
              getPopupContainer={(node) => node.parentElement ?? document.body}
            />
          </div>
        </form>

        <DialogFooter>
          <AntButton onClick={() => props.onOpenChange(false)} disabled={mutation.isPending}>
            {t("common:CANCEL")}
          </AntButton>
          <AntButton type="primary" loading={mutation.isPending} onClick={() => void onSubmit()}>
            {t("common:CONFIRM")}
          </AntButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
