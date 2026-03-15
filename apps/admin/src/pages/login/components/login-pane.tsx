import { Lock, User } from "lucide-react";
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
import { Checkbox } from "@celestial/ui/checkbox";
import { Button } from "@celestial/ui/button";

import type { LoginFormValues } from "../types";

type LoginPaneProps = {
  onSubmit: (values: LoginFormValues) => void;
  loading: boolean;
  initialKeepSession: boolean;
  redirect?: string;
  onForgotPassword: () => void;
  onSwitchToRegister: () => void;
  publicRegisterEnabled: boolean;
  reducedMotion: boolean;
  itemVariants: Variants;
};

type LoginPaneSectionProps = {
  variants: Variants | {};
};

function LoginPaneHeader({ variants }: LoginPaneSectionProps) {
  const { t } = useTranslation();
  return (
    <motion.div variants={variants}>
      <h1 className="text-largetitle text-label-primary">{t("auth:LOGIN_PAGE_TITLE")}</h1>
      <p className="mt-2 mb-8 text-title3 font-normal text-label-secondary">
        {t("auth:LOGIN_PAGE_SUBTITLE")}
      </p>
    </motion.div>
  );
}

type LoginPaneFormProps = LoginPaneSectionProps & {
  form: ReturnType<typeof useForm<LoginFormValues>>;
  loading: boolean;
  onSubmit: (values: LoginFormValues) => void;
  onForgotPassword: () => void;
};

function LoginPaneForm({
  variants,
  form,
  loading,
  onSubmit,
  onForgotPassword,
}: LoginPaneFormProps) {
  const { t } = useTranslation();
  const keepSession = Boolean(form.watch("keepSession"));
  const accountError = form.formState.errors.account?.message;
  const passwordError = form.formState.errors.password?.message;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3" autoComplete="off">
      <motion.div variants={variants} className="grid gap-1.5">
        <AuthInputControl
          autoComplete="off"
          aria-label={t("auth:FIELD_ACCOUNT_LABEL")}
          aria-invalid={accountError ? true : undefined}
          placeholder={t("auth:FIELD_ACCOUNT_PLACEHOLDER")}
          startIcon={<User size={16} />}
          disabled={loading}
          {...form.register("account")}
        />
        <AuthFieldError message={accountError ? String(accountError) : undefined} />
      </motion.div>

      <motion.div variants={variants} className="grid gap-1.5">
        <AuthPasswordControl
          autoComplete="current-password"
          aria-label={t("auth:FIELD_PASSWORD_LABEL")}
          aria-invalid={passwordError ? true : undefined}
          placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
          startIcon={<Lock size={16} />}
          disabled={loading}
          {...form.register("password")}
        />
        <AuthFieldError message={passwordError ? String(passwordError) : undefined} />
      </motion.div>

      <motion.div variants={variants} className="mb-1 flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={keepSession}
            onCheckedChange={(value) => form.setValue("keepSession", Boolean(value))}
          />
          <span className="text-callout">{t("auth:KEEP_SESSION")}</span>
        </label>
        <AuthLinkButton disabled={loading} onClick={onForgotPassword} type="button">
          {t("auth:FORGOT_PASSWORD")}
        </AuthLinkButton>
      </motion.div>

      <motion.div variants={variants}>
        <Button className="w-full" type="submit" size="lg" loading={loading}>
          {t("auth:LOGIN_BUTTON")}
        </Button>
      </motion.div>
    </form>
  );
}

type LoginPaneFooterProps = LoginPaneSectionProps & {
  publicRegisterEnabled: boolean;
  onSwitchToRegister: () => void;
};

function LoginPaneFooter({
  variants,
  publicRegisterEnabled,
  onSwitchToRegister,
}: LoginPaneFooterProps) {
  const { t } = useTranslation();
  if (!publicRegisterEnabled) return null;

  return (
    <motion.div variants={variants} className="mt-4 text-center text-label-secondary">
      <span>{t("auth:NO_ACCOUNT")} </span>
      <AuthLinkButton onClick={onSwitchToRegister} type="button">
        {t("auth:CREATE_ACCOUNT")}
      </AuthLinkButton>
    </motion.div>
  );
}

export function LoginPane({
  onSubmit,
  loading,
  initialKeepSession,
  redirect,
  onForgotPassword,
  onSwitchToRegister,
  publicRegisterEnabled,
  reducedMotion,
  itemVariants,
}: LoginPaneProps) {
  const { t } = useTranslation();
  const variants = reducedMotion ? {} : itemVariants;
  const schema = useMemo(
    () =>
      z.object({
        account: z.string().min(1, t("auth:VALIDATION_ACCOUNT_REQUIRED")),
        password: z.string().min(1, t("auth:VALIDATION_PASSWORD_REQUIRED")),
        keepSession: z.boolean(),
      }),
    [t],
  );
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { account: "", password: "", keepSession: initialKeepSession },
    mode: "onSubmit",
  });

  return (
    <>
      <LoginPaneHeader variants={variants} />
      <motion.div variants={variants}>
        <AuthOauthButtons disabled={loading} redirect={redirect} />
      </motion.div>
      <LoginPaneForm
        variants={variants}
        form={form}
        loading={loading}
        onSubmit={onSubmit}
        onForgotPassword={onForgotPassword}
      />
      <LoginPaneFooter
        variants={variants}
        publicRegisterEnabled={publicRegisterEnabled}
        onSwitchToRegister={onSwitchToRegister}
      />
    </>
  );
}
