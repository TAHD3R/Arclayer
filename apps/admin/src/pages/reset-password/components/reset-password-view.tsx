import { KeyRound, Lock } from "lucide-react";
import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import {
  AuthInputControl,
  AuthLinkButton,
  AuthPasswordControl,
} from "@/components/ui/auth-controls";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

import { PASSWORD_PATTERN } from "../constants";
import type { ResetPasswordFormValues, ResetPasswordViewProps } from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_INPUT_GROUP_CLASS,
  AUTH_PANE_STACK_CLASS,
  AuthPaneHeader,
  AuthPaneTitleRow,
} from "@/pages/login/components/auth-pane-primitives";

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
  const schema = useMemo(() => createResetPasswordSchema(t), [t]);
  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { resetToken: initialToken ?? "", newPassword: "", confirmPassword: "" },
    mode: "onSubmit",
  });

  return (
    <motion.div
      className="w-full"
      initial="hidden"
      animate="show"
      variants={{ show: reducedMotion ? {} : { transition: { staggerChildren: 0.05 } } }}
    >
      <div className={AUTH_PANE_STACK_CLASS}>
        <AuthPaneHeader
          titleKey="auth:RESET_PASSWORD_PAGE_TITLE"
          subtitleKey="auth:RESET_PASSWORD_PAGE_SUBTITLE"
          variants={variants}
        />

        <form
          className="grid gap-4"
          autoComplete="on"
          onSubmit={form.handleSubmit(async (values) => {
            await onSubmit({ reset_token: values.resetToken, new_password: values.newPassword });
          })}
        >
          <ResetPasswordField
            title={t("auth:FIELD_RESET_TOKEN_LABEL")}
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

          <ResetPasswordField
            title={t("auth:FIELD_NEW_PASSWORD_LABEL")}
            error={
              form.formState.errors.newPassword?.message
                ? String(form.formState.errors.newPassword.message)
                : undefined
            }
            variants={variants}
          >
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
          </ResetPasswordField>

          <ResetPasswordField
            title={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
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

          <motion.div variants={variants} className="grid gap-3 pt-1.5">
            <Button className="w-full" type="submit" size="lg" loading={loading}>
              {t("auth:RESET_PASSWORD_BUTTON")}
            </Button>

            <div className="text-center">
              <AuthLinkButton onClick={onBackToLogin} type="button">
                {t("auth:BACK_TO_LOGIN")}
              </AuthLinkButton>
            </div>
          </motion.div>
        </form>
      </div>
    </motion.div>
  );
}
