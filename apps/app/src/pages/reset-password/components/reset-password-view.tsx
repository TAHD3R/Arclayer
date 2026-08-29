import { KeyRound, Lock } from "lucide-react";
import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { AuthInputControl, AuthPasswordControl } from "@arclayer/ui/auth-controls";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { PasswordRulesPopover } from "@/components/auth/password-rules-popover";
import {
  getPasswordRequirementStates,
  PASSWORD_PATTERN,
  resolveAuthFormError,
} from "@/lib/auth/form-feedback";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

import type { ResetPasswordFormValues, ResetPasswordViewProps } from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_PANE_ROOT_CLASS,
  AUTH_BUTTON_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_INPUT_GROUP_CLASS,
  AUTH_OUTLINE_BUTTON_CLASS,
  AuthFormFeedback,
  AuthPaneLegal,
} from "@/pages/login/components/auth-pane-primitives";
import { AuthEntryHeader } from "@/pages/login/components/login-brand-slogan";

function createResetPasswordSchema(t: (key: string) => string) {
  return z
    .object({
      resetToken: z.string().min(1, t("auth:VALIDATION_RESET_TOKEN_REQUIRED")),
      newPassword: z
        .string()
        .min(1, t("auth:VALIDATION_PASSWORD_REQUIRED"))
        .regex(PASSWORD_PATTERN, t("auth:PASSWORD_INVALID")),
      confirmPassword: z.string().min(1, t("auth:VALIDATION_CONFIRM_PASSWORD_REQUIRED")),
    })
    .superRefine((value, ctx) => {
      if (value.newPassword === value.confirmPassword) return;
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: t("auth:VALIDATION_PASSWORD_MISMATCH"),
      });
    });
}

function ResetPasswordField(props: {
  error?: string;
  variants: Variants | {};
  children: ReactNode;
}) {
  return (
    <motion.div variants={props.variants}>
      <Field className={AUTH_FIELD_CLASS}>
        <FieldContent className="gap-2">
          {props.children}
          <FieldError>{props.error}</FieldError>
        </FieldContent>
      </Field>
    </motion.div>
  );
}

export function ResetPasswordView({
  initialToken,
  loading = false,
  onSubmit,
  onBackToLogin,
}: ResetPasswordViewProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
  };
  const variants = reducedMotion ? {} : itemVariants;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const schema = useMemo(() => createResetPasswordSchema(t), [t]);
  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { resetToken: initialToken ?? "", newPassword: "", confirmPassword: "" },
    mode: "onSubmit",
  });
  const newPasswordValue = form.watch("newPassword");
  const resetTokenValue = form.watch("resetToken");
  const confirmPasswordValue = form.watch("confirmPassword");
  const passwordRequirements = useMemo(
    () => getPasswordRequirementStates(newPasswordValue, t),
    [newPasswordValue, t],
  );
  const showResetTokenField = !initialToken;

  useEffect(() => {
    setSubmitError(null);
  }, [confirmPasswordValue, newPasswordValue, resetTokenValue]);

  return (
    <motion.div
      className="w-full"
      initial="hidden"
      animate="show"
      variants={{ show: reducedMotion ? {} : { transition: { staggerChildren: 0.05 } } }}
    >
      <div className={AUTH_PANE_ROOT_CLASS}>
        <AuthEntryHeader subtitleKey="auth:RESET_PASSWORD_PAGE_SUBTITLE" variants={variants} />
        <h2 className="sr-only">{t("auth:RESET_PASSWORD_PAGE_TITLE")}</h2>

        <form
          className="grid gap-4"
          autoComplete="on"
          onSubmit={form.handleSubmit(async (values) => {
            setSubmitError(null);
            try {
              await onSubmit({ resetToken: values.resetToken, newPassword: values.newPassword });
            } catch (error) {
              setSubmitError(resolveAuthFormError(error, t("errors:REQUEST_FAILED")));
            }
          })}
        >
          <AuthFormFeedback message={submitError} variants={variants} />
          {showResetTokenField ? (
            <ResetPasswordField
              error={
                form.formState.errors.resetToken?.message
                  ? String(form.formState.errors.resetToken.message)
                  : undefined
              }
              variants={variants}
            >
              <AuthInputControl
                autoComplete="one-time-code"
                aria-label={t("auth:FIELD_RESET_TOKEN_LABEL")}
                aria-invalid={form.formState.errors.resetToken ? true : undefined}
                className={AUTH_INPUT_GROUP_CLASS}
                inputClassName={AUTH_INPUT_CLASS}
                placeholder={t("auth:FIELD_RESET_TOKEN_PLACEHOLDER")}
                startIcon={<KeyRound size={16} />}
                disabled={loading}
                spellCheck={false}
                {...form.register("resetToken")}
              />
            </ResetPasswordField>
          ) : (
            <motion.div variants={variants} className="text-footnote text-label-secondary">
              {t("auth:FIELD_RESET_TOKEN_HELP")}
            </motion.div>
          )}

          <ResetPasswordField
            error={
              form.formState.errors.newPassword?.message
                ? String(form.formState.errors.newPassword.message)
                : undefined
            }
            variants={variants}
          >
            <PasswordRulesPopover password={newPasswordValue} requirements={passwordRequirements}>
              <AuthPasswordControl
                autoComplete="new-password"
                aria-label={t("auth:FIELD_NEW_PASSWORD_LABEL")}
                aria-invalid={form.formState.errors.newPassword ? true : undefined}
                className={AUTH_INPUT_GROUP_CLASS}
                inputClassName={AUTH_INPUT_CLASS}
                placeholder={t("auth:FIELD_NEW_PASSWORD_PLACEHOLDER")}
                startIcon={<Lock size={16} />}
                disabled={loading}
                {...form.register("newPassword")}
              />
            </PasswordRulesPopover>
          </ResetPasswordField>

          <ResetPasswordField
            error={
              form.formState.errors.confirmPassword?.message
                ? String(form.formState.errors.confirmPassword.message)
                : undefined
            }
            variants={variants}
          >
            <AuthPasswordControl
              autoComplete="new-password"
              aria-label={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
              aria-invalid={form.formState.errors.confirmPassword ? true : undefined}
              className={AUTH_INPUT_GROUP_CLASS}
              inputClassName={AUTH_INPUT_CLASS}
              placeholder={t("auth:FIELD_CONFIRM_PASSWORD_PLACEHOLDER")}
              startIcon={<Lock size={16} />}
              disabled={loading}
              {...form.register("confirmPassword")}
            />
          </ResetPasswordField>

          <motion.div variants={variants} className="grid gap-4 pt-1">
            <Button className={AUTH_BUTTON_CLASS} type="submit" size="lg" loading={loading}>
              {t("auth:RESET_PASSWORD_BUTTON")}
            </Button>

            <Button
              className={AUTH_OUTLINE_BUTTON_CLASS}
              onClick={onBackToLogin}
              type="button"
              size="lg"
              variant="outline"
            >
              {t("auth:BACK_TO_LOGIN")}
            </Button>
          </motion.div>
        </form>
        <AuthPaneLegal i18nKey="auth:LEGAL_CONTINUE" variants={variants} />
      </div>
    </motion.div>
  );
}
