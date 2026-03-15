import { Lock, Mail, User } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { AuthOauthButtons } from "@/components/ui/oauth-buttons";
import {
  AuthFieldError,
  AuthInputControl,
  AuthLinkButton,
  AuthPasswordControl,
} from "@/components/ui/auth-controls";
import { Button } from "@celestial/ui/button";

import type { RegisterFormValues } from "../types";

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

function RegisterPaneHeader({ variants }: RegisterPaneSectionProps) {
  const { t } = useTranslation();
  return (
    <motion.div variants={variants}>
      <h1 className="text-largetitle text-label-primary">{t("auth:REGISTER_PAGE_TITLE")}</h1>
      <p className="mt-2 mb-8 text-title3 font-normal text-label-secondary">
        {t("auth:REGISTER_PAGE_SUBTITLE")}
      </p>
    </motion.div>
  );
}

type RegisterPaneFormProps = RegisterPaneSectionProps & {
  form: ReturnType<typeof useForm<RegisterFormValues>>;
  loading: boolean;
  onSubmit: (values: RegisterFormValues) => void;
};

function RegisterPaneForm({ variants, form, loading, onSubmit }: RegisterPaneFormProps) {
  const { t } = useTranslation();
  const emailError = form.formState.errors.email?.message;
  const usernameError = form.formState.errors.username?.message;
  const passwordError = form.formState.errors.password?.message;
  const confirmPasswordError = form.formState.errors.confirmPassword?.message;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3" autoComplete="off">
      <motion.div variants={variants} className="grid gap-1.5">
        <AuthInputControl
          autoComplete="email"
          aria-label={t("auth:FIELD_EMAIL_LABEL")}
          aria-invalid={emailError ? true : undefined}
          placeholder={t("auth:FIELD_EMAIL_PLACEHOLDER")}
          startIcon={<Mail size={16} />}
          disabled={loading}
          {...form.register("email")}
        />
        <AuthFieldError message={emailError ? String(emailError) : undefined} />
      </motion.div>

      <motion.div variants={variants} className="grid gap-1.5">
        <AuthInputControl
          autoComplete="off"
          aria-label={t("auth:FIELD_USERNAME_LABEL")}
          aria-invalid={usernameError ? true : undefined}
          placeholder={t("auth:FIELD_USERNAME_PLACEHOLDER")}
          startIcon={<User size={16} />}
          disabled={loading}
          {...form.register("username")}
        />
        <AuthFieldError message={usernameError ? String(usernameError) : undefined} />
      </motion.div>

      <motion.div variants={variants} className="grid gap-1.5">
        <AuthPasswordControl
          autoComplete="new-password"
          aria-label={t("auth:FIELD_PASSWORD_LABEL")}
          aria-invalid={passwordError ? true : undefined}
          placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
          startIcon={<Lock size={16} />}
          disabled={loading}
          {...form.register("password")}
        />
        <AuthFieldError message={passwordError ? String(passwordError) : undefined} />
      </motion.div>

      <motion.div variants={variants} className="grid gap-1.5">
        <AuthPasswordControl
          autoComplete="new-password"
          aria-label={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
          aria-invalid={confirmPasswordError ? true : undefined}
          placeholder={t("auth:FIELD_CONFIRM_PASSWORD_PLACEHOLDER")}
          startIcon={<Lock size={16} />}
          disabled={loading}
          {...form.register("confirmPassword")}
        />
        <AuthFieldError message={confirmPasswordError ? String(confirmPasswordError) : undefined} />
      </motion.div>

      <motion.div variants={variants}>
        <Button className="w-full" type="submit" size="lg" loading={loading}>
          {t("auth:REGISTER_BUTTON")}
        </Button>
      </motion.div>
    </form>
  );
}

function RegisterPaneFooter({
  variants,
  onSwitchToLogin,
}: RegisterPaneSectionProps & { onSwitchToLogin: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.div variants={variants} className="mt-4 text-center text-label-secondary">
      <span>{t("auth:HAVE_ACCOUNT")} </span>
      <AuthLinkButton onClick={onSwitchToLogin} type="button">
        {t("auth:SIGN_IN")}
      </AuthLinkButton>
    </motion.div>
  );
}

export function RegisterPane({
  onSubmit,
  loading,
  redirect,
  onSwitchToLogin,
  reducedMotion,
  itemVariants,
}: RegisterPaneProps) {
  const { t } = useTranslation();
  const variants = reducedMotion ? {} : itemVariants;
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
    <>
      <RegisterPaneHeader variants={variants} />
      <motion.div variants={variants}>
        <AuthOauthButtons disabled={loading} redirect={redirect} />
      </motion.div>
      <RegisterPaneForm variants={variants} form={form} loading={loading} onSubmit={onSubmit} />
      <RegisterPaneFooter variants={variants} onSwitchToLogin={onSwitchToLogin} />
    </>
  );
}
