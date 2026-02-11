import { Controller, useForm } from "react-hook-form";
import { Button as AntButton, Form, Select, Tag, Tooltip } from "antd";
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
        roleCode: z.string().min(1, t("common:ORG_MEMBERS_INVITE_ROLE_REQUIRED")),
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
  const emailError = typeof emailFieldError?.message === "string" ? emailFieldError.message : undefined;
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
    <Dialog
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
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("common:ORG_MEMBERS_INVITE")}</DialogTitle>
          <DialogDescription>{t("common:ORG_INVITATIONS_DIALOG_DESC")}</DialogDescription>
        </DialogHeader>

        <Form layout="vertical" requiredMark={false} className="py-1" onFinish={() => void onSubmit()}>
          <Form.Item
            label={t("common:ORG_MEMBERS_INVITE_EMAIL")}
            validateStatus={emailHasError ? "error" : undefined}
            help={emailError || null}
            className="!mb-4"
          >
            <Controller
              control={form.control}
              name="emails"
              render={() => (
                <Select
                  mode="tags"
                  suffixIcon={false}
                  open={false}
                  tokenSeparators={[" ", "\n", ",", ";", "，", "；", "\t"]}
                  autoFocus
                  placeholder={t("common:ORG_MEMBERS_INVITE_EMAIL_PLACEHOLDER")}
                  value={emailTags}
                  onChange={(next) => {
                    form.setValue(
                      "emails",
                      normalizeEmailList(next.map((value) => String(value))),
                      {
                        shouldDirty: true,
                        shouldValidate: true,
                      },
                    );
                  }}
                  getPopupContainer={(node) => node.parentElement ?? document.body}
                  options={[]}
                  notFoundContent={null}
                  disabled={props.loading}
                  tagRender={(tagProps) => {
                    const value = String(tagProps.value || "").trim();
                    const message = invalidEmailMessageByValue.get(value) ?? null;

                    const tag = (
                      <Tag
                        color={message ? "error" : "default"}
                        closable={tagProps.closable}
                        onClose={tagProps.onClose}
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
              )}
            />
          </Form.Item>

          <Form.Item
            label={t("common:ORG_MEMBERS_INVITE_ROLE")}
            validateStatus={roleError ? "error" : undefined}
            help={roleError || null}
            extra={<span className="text-muted-foreground">{t("team:TEAM_INVITE_ROLE_HELP")}</span>}
            className="!mb-4"
          >
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
          </Form.Item>

          <Form.Item
            label={t("team:TEAM_INVITE_LINK_FIELD_EXPIRES")}
            validateStatus={expiresError ? "error" : undefined}
            help={expiresError || null}
            className="!mb-0"
          >
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
          </Form.Item>
        </Form>

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
