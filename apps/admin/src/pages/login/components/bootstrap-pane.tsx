import { Lock, Mail, User } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { AuthInputControl, AuthPasswordControl } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

import type { BootstrapFormValues, BootstrapPaneProps } from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_INPUT_GROUP_CLASS,
  AUTH_PANE_STACK_CLASS,
  AuthPaneHeader,
  AuthPaneLegal,
  AuthPaneTitleRow,
} from "./auth-pane-primitives";

function BootstrapField(props: { title: string; error?: string; children: ReactNode }) {
  return (
    <Field className={AUTH_FIELD_CLASS}>
      <FieldContent className="gap-2">
        <AuthPaneTitleRow title={props.title} />
        {props.children}
        <FieldError>{props.error}</FieldError>
      </FieldContent>
    </Field>
  );
}

export function BootstrapPane(props: BootstrapPaneProps) {
  const { t } = useTranslation();
  const schema = useMemo(
    () =>
      z
        .object({
          displayName: z.string().min(1, t("auth:VALIDATION_DISPLAY_NAME_REQUIRED")),
          email: z
            .string()
            .min(1, t("auth:VALIDATION_EMAIL_REQUIRED"))
            .email(t("auth:VALIDATION_EMAIL_INVALID")),
          username: z.string().min(1, t("auth:VALIDATION_USERNAME_REQUIRED")),
          password: z.string().min(1, t("auth:VALIDATION_PASSWORD_REQUIRED")),
          confirmPassword: z.string().min(1, t("auth:VALIDATION_CONFIRM_PASSWORD_REQUIRED")),
        })
        .superRefine((value, ctx) => {
          if (value.password === value.confirmPassword) return;
          ctx.addIssue({
            code: "custom",
            path: ["confirmPassword"],
            message: t("auth:VALIDATION_PASSWORD_MISMATCH"),
          });
        }),
    [t],
  );
  const form = useForm<BootstrapFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: "",
      email: "",
      username: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onSubmit",
  });

  return (
    <div className={AUTH_PANE_STACK_CLASS}>
      <AuthPaneHeader
        titleKey="auth:INSTANCE_BOOTSTRAP_TITLE"
        subtitleKey="auth:INSTANCE_BOOTSTRAP_SUBTITLE"
        variants={{}}
      />
      <form onSubmit={form.handleSubmit(props.onSubmit)} className="grid gap-2" autoComplete="on">
        <BootstrapField
          title={t("auth:FIELD_DISPLAY_NAME_LABEL")}
          error={form.formState.errors.displayName?.message}
        >
          <AuthInputControl
            autoComplete="name"
            aria-label={t("auth:FIELD_DISPLAY_NAME_LABEL")}
            aria-invalid={form.formState.errors.displayName ? true : undefined}
            className={AUTH_INPUT_GROUP_CLASS}
            inputClassName={AUTH_INPUT_CLASS}
            placeholder={t("auth:FIELD_DISPLAY_NAME_PLACEHOLDER")}
            startIcon={<User size={16} />}
            disabled={props.loading}
            spellCheck={false}
            {...form.register("displayName")}
          />
        </BootstrapField>

        <BootstrapField
          title={t("auth:FIELD_EMAIL_LABEL")}
          error={form.formState.errors.email?.message}
        >
          <AuthInputControl
            autoComplete="email"
            aria-label={t("auth:FIELD_EMAIL_LABEL")}
            aria-invalid={form.formState.errors.email ? true : undefined}
            className={AUTH_INPUT_GROUP_CLASS}
            inputClassName={AUTH_INPUT_CLASS}
            placeholder={t("auth:FIELD_EMAIL_PLACEHOLDER")}
            startIcon={<Mail size={16} />}
            disabled={props.loading}
            spellCheck={false}
            {...form.register("email")}
          />
        </BootstrapField>

        <BootstrapField
          title={t("auth:FIELD_USERNAME_LABEL")}
          error={form.formState.errors.username?.message}
        >
          <AuthInputControl
            autoComplete="username"
            aria-label={t("auth:FIELD_USERNAME_LABEL")}
            aria-invalid={form.formState.errors.username ? true : undefined}
            className={AUTH_INPUT_GROUP_CLASS}
            inputClassName={AUTH_INPUT_CLASS}
            placeholder={t("auth:FIELD_USERNAME_PLACEHOLDER")}
            startIcon={<User size={16} />}
            disabled={props.loading}
            spellCheck={false}
            {...form.register("username")}
          />
        </BootstrapField>

        <BootstrapField
          title={t("auth:FIELD_PASSWORD_LABEL")}
          error={form.formState.errors.password?.message}
        >
          <AuthPasswordControl
            autoComplete="new-password"
            aria-label={t("auth:FIELD_PASSWORD_LABEL")}
            aria-invalid={form.formState.errors.password ? true : undefined}
            className={AUTH_INPUT_GROUP_CLASS}
            inputClassName={AUTH_INPUT_CLASS}
            placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
            startIcon={<Lock size={16} />}
            disabled={props.loading}
            {...form.register("password")}
          />
        </BootstrapField>

        <BootstrapField
          title={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
          error={form.formState.errors.confirmPassword?.message}
        >
          <AuthPasswordControl
            autoComplete="new-password"
            aria-label={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
            aria-invalid={form.formState.errors.confirmPassword ? true : undefined}
            className={AUTH_INPUT_GROUP_CLASS}
            inputClassName={AUTH_INPUT_CLASS}
            placeholder={t("auth:FIELD_CONFIRM_PASSWORD_PLACEHOLDER")}
            startIcon={<Lock size={16} />}
            disabled={props.loading}
            {...form.register("confirmPassword")}
          />
        </BootstrapField>

        <div className="grid gap-3 pt-1">
          <Button className="w-full" type="submit" size="lg" loading={props.loading}>
            {t("auth:INSTANCE_BOOTSTRAP_BUTTON")}
          </Button>
        </div>
      </form>
      <AuthPaneLegal i18nKey="auth:LEGAL_CONTINUE" variants={{}} />
    </div>
  );
}
