import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { z } from "zod";

import { EmailTagsField } from "@/components/ui/email-tags-field";
import { Button } from "@arclayer/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { zodResolver } from "@/lib/forms/zod-resolver";

export type InviteOrganizationMemberFormValues = {
  emails: string[];
  roleCode: string;
  expiresInSeconds: number | null;
};

export type InviteOrganizationRoleOption = {
  value: string;
  label: string;
};

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
        emails: z.array(z.string()).superRefine((val, ctx) => {
          const emails = normalizeEmailList(val);
          if (emails.length <= 0) {
            ctx.addIssue({
              code: "custom",
              path: [],
              message: t("team:TEAM_INVITE_VALIDATION_TO_REQUIRED"),
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
      }),
    [t],
  );

  const form = useForm<InviteOrganizationMemberFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      emails: [],
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
  const emailTags = form.watch("emails");
  const emailFieldError = form.formState.errors.emails;
  const emailError =
    typeof emailFieldError?.message === "string" ? emailFieldError.message : undefined;
  const emailHasError =
    Boolean(emailError) ||
    (Array.isArray(emailFieldError) && emailFieldError.some((item) => Boolean(item?.message)));
  const roleError = form.formState.errors.roleCode?.message;
  const expiresError = form.formState.errors.expiresInSeconds?.message;
  const invalidEmailMessageByValue = useMemo(() => {
    const map = new Map<string, string>();
    for (const email of normalizeEmailList(emailTags)) {
      if (!z.string().email().safeParse(email).success) {
        map.set(email, t("team:TEAM_INVITE_VALIDATION_EMAIL_INVALID", { email }));
      }
    }
    return map;
  }, [emailTags, t]);

  const onSubmit = form.handleSubmit(async (values) => {
    await props.onSubmit({
      ...values,
      emails: normalizeEmailList(values.emails),
    });
    form.reset({
      emails: [],
      roleCode: props.defaultRoleCode,
      expiresInSeconds: defaultExpiresInSeconds,
    });
  });

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(next) => {
        props.onOpenChange(next);
        if (!next) {
          form.reset({
            emails: [],
            roleCode: props.defaultRoleCode,
            expiresInSeconds: defaultExpiresInSeconds,
          });
        }
      }}
      title={t("common:ORG_MEMBERS_INVITE")}
      description={t("common:ORG_INVITATIONS_DIALOG_DESC")}
      contentClassName="sm:max-w-xl"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => props.onOpenChange(false)}
            disabled={props.loading}
          >
            {t("common:CANCEL")}
          </Button>
          <Button loading={props.loading} onClick={() => void onSubmit()}>
            {t("common:CONFIRM")}
          </Button>
        </>
      }
    >
      <form className="grid gap-4 py-2" onSubmit={onSubmit}>
        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground" htmlFor="org-invite-emails">
            {t("team:TEAM_INVITE_FIELD_TO")}
          </label>
          <div className="text-label-secondary">{t("team:TEAM_INVITE_FIELD_TO_HELP")}</div>
          <Controller
            control={form.control}
            name="emails"
            render={() => (
              <EmailTagsField
                id="org-invite-emails"
                value={emailTags}
                placeholder={t("team:TEAM_INVITE_FIELD_TO_PLACEHOLDER")}
                invalidMessageByValue={invalidEmailMessageByValue}
                disabled={props.loading}
                autoFocus
                onChange={(next) =>
                  form.setValue("emails", normalizeEmailList(next), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            )}
          />
          {emailHasError && emailError ? (
            <div className="text-footnote text-destructive">{emailError}</div>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground" htmlFor="org-invite-role">
            {t("team:TEAM_INVITE_FIELD_ROLE")}
          </label>
          <div className="text-label-secondary">{t("team:TEAM_INVITE_ROLE_HELP")}</div>
          <Controller
            control={form.control}
            name="roleCode"
            render={({ field }) => (
              <Select
                value={field.value || selectedRoleCode || undefined}
                onValueChange={(next) => field.onChange(String(next))}
                disabled={props.loading}
              >
                <SelectTrigger id="org-invite-role" className="w-full">
                  <SelectValue placeholder={t("team:TEAM_INVITE_FIELD_ROLE_PLACEHOLDER")} />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {props.roleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {roleError ? <div className="text-footnote text-destructive">{roleError}</div> : null}
        </div>

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground" htmlFor="org-invite-expires">
            {t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}
          </label>
          <div className="text-label-secondary">{t("team:TEAM_INVITE_FIELD_EXPIRES_HELP")}</div>
          <Controller
            control={form.control}
            name="expiresInSeconds"
            render={({ field }) => (
              <Select
                value={String(field.value)}
                onValueChange={(next) => field.onChange(next === "null" ? null : Number(next))}
                disabled={props.loading}
              >
                <SelectTrigger id="org-invite-expires" className="w-full">
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
            )}
          />
          {expiresError ? (
            <div className="text-footnote text-destructive">{expiresError}</div>
          ) : null}
        </div>
      </form>
    </SettingDialog>
  );
}
