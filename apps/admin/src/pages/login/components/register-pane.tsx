import { Lock, Mail, User } from "lucide-react";
import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { AuthOauthButtons } from "@/components/ui/oauth-buttons";
import {
  AuthInputControl,
  AuthLinkButton,
  AuthPasswordControl,
} from "@/components/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

import type { RegisterFormValues } from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_INPUT_GROUP_CLASS,
  AUTH_PANE_STACK_CLASS,
  AuthPaneHeader,
  AuthPaneLegal,
  AuthPaneTitleRow,
} from "./auth-pane-primitives";

type RegisterPaneProps = {
  onSubmit: (values: RegisterFormValues) => void;
  loading: boolean;
  redirect?: string;
  onSwitchToLogin: () => void;
  reducedMotion: boolean;
  itemVariants: Variants;
};

type RegisterPaneSectionProps = {
  variants: Variants | {};
};

type RegisterPaneFormProps = RegisterPaneSectionProps & {
  form: ReturnType<typeof useForm<RegisterFormValues>>;
  loading: boolean;
  onSubmit: (values: RegisterFormValues) => void;
};

function RegisterField(props: {
  title: string;
  error?: string;
  variants: Variants | {};
  children: ReactNode;
}) {
  return (
    <motion.div variants={props.variants}>
      <Field className={AUTH_FIELD_CLASS}>
        <FieldContent className="gap-2">
          <AuthPaneTitleRow title={props.title} />
          {props.children}
          <FieldError>{props.error}</FieldError>
        </FieldContent>
      </Field>
    </motion.div>
  );
}

function RegisterPaneForm(props: RegisterPaneFormProps) {
  const { t } = useTranslation();
  const emailError = props.form.formState.errors.email?.message;
  const usernameError = props.form.formState.errors.username?.message;
  const passwordError = props.form.formState.errors.password?.message;
  const confirmPasswordError = props.form.formState.errors.confirmPassword?.message;

  return (
    <form
      onSubmit={props.form.handleSubmit(props.onSubmit)}
      className="grid gap-2"
      autoComplete="on"
    >
      <RegisterField
        title={t("auth:FIELD_EMAIL_LABEL")}
        error={emailError ? String(emailError) : undefined}
        variants={props.variants}
      >
        <AuthInputControl
          autoComplete="email"
          aria-label={t("auth:FIELD_EMAIL_LABEL")}
          aria-invalid={emailError ? true : undefined}
          className={AUTH_INPUT_GROUP_CLASS}
          inputClassName={AUTH_INPUT_CLASS}
          placeholder={t("auth:FIELD_EMAIL_PLACEHOLDER")}
          startIcon={<Mail size={16} />}
          disabled={props.loading}
          spellCheck={false}
          {...props.form.register("email")}
        />
      </RegisterField>

      <RegisterField
        title={t("auth:FIELD_USERNAME_LABEL")}
        error={usernameError ? String(usernameError) : undefined}
        variants={props.variants}
      >
        <AuthInputControl
          autoComplete="username"
          aria-label={t("auth:FIELD_USERNAME_LABEL")}
          aria-invalid={usernameError ? true : undefined}
          className={AUTH_INPUT_GROUP_CLASS}
          inputClassName={AUTH_INPUT_CLASS}
          placeholder={t("auth:FIELD_USERNAME_PLACEHOLDER")}
          startIcon={<User size={16} />}
          disabled={props.loading}
          spellCheck={false}
          {...props.form.register("username")}
        />
      </RegisterField>

      <RegisterField
        title={t("auth:FIELD_PASSWORD_LABEL")}
        error={passwordError ? String(passwordError) : undefined}
        variants={props.variants}
      >
        <AuthPasswordControl
          autoComplete="new-password"
          aria-label={t("auth:FIELD_PASSWORD_LABEL")}
          aria-invalid={passwordError ? true : undefined}
          className={AUTH_INPUT_GROUP_CLASS}
          inputClassName={AUTH_INPUT_CLASS}
          placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
          startIcon={<Lock size={16} />}
          disabled={props.loading}
          {...props.form.register("password")}
        />
      </RegisterField>

      <RegisterField
        title={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
        error={confirmPasswordError ? String(confirmPasswordError) : undefined}
        variants={props.variants}
      >
        <AuthPasswordControl
          autoComplete="new-password"
          aria-label={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
          aria-invalid={confirmPasswordError ? true : undefined}
          className={AUTH_INPUT_GROUP_CLASS}
          inputClassName={AUTH_INPUT_CLASS}
          placeholder={t("auth:FIELD_CONFIRM_PASSWORD_PLACEHOLDER")}
          startIcon={<Lock size={16} />}
          disabled={props.loading}
          {...props.form.register("confirmPassword")}
        />
      </RegisterField>

      <motion.div variants={props.variants} className="grid gap-3 pt-1">
        <Button className="w-full" type="submit" size="lg" loading={props.loading}>
          {t("auth:REGISTER_BUTTON")}
        </Button>
      </motion.div>
    </form>
  );
}

function RegisterPaneFooter(props: RegisterPaneSectionProps & { onSwitchToLogin: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.div
      variants={props.variants}
      className="grid gap-2.5 pt-2 text-center text-label-secondary"
    >
      <div className="leading-6">
        <span>{t("auth:HAVE_ACCOUNT")} </span>
        <AuthLinkButton onClick={props.onSwitchToLogin} type="button">
          {t("auth:SIGN_IN")}
        </AuthLinkButton>
      </div>
      <AuthPaneLegal i18nKey="auth:LEGAL_REGISTER" variants={props.variants} />
    </motion.div>
  );
}

export function RegisterPane(props: RegisterPaneProps) {
  const { t } = useTranslation();
  const variants = props.reducedMotion ? {} : props.itemVariants;
  const schema = useMemo(
    () =>
      z
        .object({
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
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", username: "", password: "", confirmPassword: "" },
    mode: "onSubmit",
  });

  return (
    <div className={AUTH_PANE_STACK_CLASS}>
      <AuthPaneHeader
        titleKey="auth:REGISTER_PAGE_TITLE"
        subtitleKey="auth:REGISTER_PAGE_SUBTITLE"
        variants={variants}
      />
      <RegisterPaneForm
        variants={variants}
        form={form}
        loading={props.loading}
        onSubmit={props.onSubmit}
      />
      <motion.div variants={variants} className="pt-1.5">
        <AuthOauthButtons disabled={props.loading} redirect={props.redirect} />
      </motion.div>
      <RegisterPaneFooter variants={variants} onSwitchToLogin={props.onSwitchToLogin} />
    </div>
  );
}
