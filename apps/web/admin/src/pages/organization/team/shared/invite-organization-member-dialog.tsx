import { Controller, useForm } from "react-hook-form";
import { Button as AntButton, Input, Select } from "antd";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { z } from "zod";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { zodResolver } from "@/lib/forms/zod-resolver";

export type InviteOrganizationMemberFormValues = {
  email: string;
  roleCode: string;
  expiresInSeconds: number | null;
};

export type InviteOrganizationRoleOption = {
  value: string;
  label: string;
};

export function InviteOrganizationMemberDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: InviteOrganizationMemberFormValues) => Promise<void>;
  loading: boolean;
  roleOptions: InviteOrganizationRoleOption[];
  defaultRoleCode: string;
  defaultExpiresInSeconds?: number | null;
}) {
  const { t } = useTranslation(["common", "team"]);

  const defaultExpiresInSeconds = props.defaultExpiresInSeconds ?? 7 * 24 * 60 * 60;

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(t("team:TEAM_INVITE_VALIDATION_EMAIL_INVALID")),
        roleCode: z.string().min(1, t("common:ORG_MEMBERS_INVITE_ROLE_REQUIRED")),
        expiresInSeconds: z.number().int().min(60).nullable(),
      }),
    [t],
  );

  const form = useForm<InviteOrganizationMemberFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      roleCode: props.defaultRoleCode,
      expiresInSeconds: defaultExpiresInSeconds,
    },
    mode: "onSubmit",
  });

  const expiresOptions = useMemo(
    () => [
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_1_DAY"), value: 1 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_7_DAYS"), value: 7 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_30_DAYS"), value: 30 * 24 * 60 * 60 },
      { label: t("team:TEAM_INVITE_LINK_EXPIRES_NEVER"), value: null },
    ],
    [t],
  );

  const selectedRoleCode = form.watch("roleCode");
  const onSubmit = form.handleSubmit(async (values) => {
    await props.onSubmit(values);
    form.reset({
      email: "",
      roleCode: props.defaultRoleCode,
      expiresInSeconds: defaultExpiresInSeconds,
    });
  });

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        props.onOpenChange(next);
        if (!next) {
          form.reset({
            email: "",
            roleCode: props.defaultRoleCode,
            expiresInSeconds: defaultExpiresInSeconds,
          });
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("common:ORG_MEMBERS_INVITE")}</DialogTitle>
          <DialogDescription>{t("common:ORG_INVITATIONS_DIALOG_DESC")}</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-5 py-2"
          onSubmit={onSubmit}
        >
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-foreground">{t("common:ORG_MEMBERS_INVITE_EMAIL")}</label>
            <Controller
              control={form.control}
              name="email"
              render={({ field }) => (
                <Input
                  {...field}
                  autoFocus
                  placeholder={t("common:ORG_MEMBERS_INVITE_EMAIL_PLACEHOLDER")}
                  disabled={props.loading}
                />
              )}
            />
            <div className="min-h-5 text-xs text-destructive">{form.formState.errors.email?.message || ""}</div>
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-foreground">{t("common:ORG_MEMBERS_INVITE_ROLE")}</label>
            <Controller
              control={form.control}
              name="roleCode"
              render={({ field }) => (
                <Select
                  {...field}
                  showSearch
                  optionFilterProp="label"
                  value={field.value || selectedRoleCode || undefined}
                  onChange={(next) => field.onChange(String(next))}
                  options={props.roleOptions}
                  placeholder={t("team:TEAM_INVITE_FIELD_ROLE_PLACEHOLDER")}
                  getPopupContainer={(node) => node.parentElement ?? document.body}
                  disabled={props.loading}
                  style={{ width: "100%" }}
                />
              )}
            />
            <div className="text-xs text-muted-foreground">{t("team:TEAM_INVITE_ROLE_HELP")}</div>
            <div className="min-h-5 text-xs text-destructive">{form.formState.errors.roleCode?.message || ""}</div>
          </div>

          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-foreground">{t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}</label>
            <Controller
              control={form.control}
              name="expiresInSeconds"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onChange={(next) => field.onChange(next)}
                  options={expiresOptions}
                  getPopupContainer={(node) => node.parentElement ?? document.body}
                  disabled={props.loading}
                  style={{ width: "100%" }}
                />
              )}
            />
            <div className="min-h-5 text-xs text-destructive">
              {form.formState.errors.expiresInSeconds?.message || ""}
            </div>
          </div>
        </form>

        <DialogFooter>
          <AntButton onClick={() => props.onOpenChange(false)} disabled={props.loading}>
            {t("common:CANCEL")}
          </AntButton>
          <AntButton type="primary" loading={props.loading} onClick={() => void onSubmit()}>
            {t("common:CONFIRM")}
          </AntButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
