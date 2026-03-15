import { KeyRound, Lock } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import {
  AuthFieldError,
  AuthInputControl,
  AuthLinkButton,
  AuthPasswordControl,
} from "@/components/ui/auth-controls";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { Button } from "@celestial/ui/button";
import { PASSWORD_PATTERN } from "../constants";
import type { ResetPasswordFormValues, ResetPasswordViewProps } from "../types";

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
  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(useMemo(() => createResetPasswordSchema(t), [t])),
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
      <motion.div variants={variants}>
        <h1 className="text-largetitle text-label-primary">
          {t("auth:RESET_PASSWORD_PAGE_TITLE")}
        </h1>
        <p className="mt-2 mb-8 text-title3 font-normal text-label-secondary">
          {t("auth:RESET_PASSWORD_PAGE_SUBTITLE")}
        </p>
      </motion.div>

      <form
        className="grid gap-3"
        autoComplete="off"
        onSubmit={form.handleSubmit(async (values) => {
          await onSubmit({ reset_token: values.resetToken, new_password: values.newPassword });
        })}
      >
        <motion.div variants={variants} className="grid gap-1.5">
          <AuthInputControl
            autoComplete="off"
            aria-label={t("auth:FIELD_RESET_TOKEN_LABEL")}
            aria-invalid={form.formState.errors.resetToken ? true : undefined}
            placeholder={t("auth:FIELD_RESET_TOKEN_PLACEHOLDER")}
            startIcon={<KeyRound size={16} />}
            disabled={loading}
            {...form.register("resetToken")}
          />
          <AuthFieldError
            message={
              form.formState.errors.resetToken?.message
                ? String(form.formState.errors.resetToken.message)
                : undefined
            }
          />
        </motion.div>

        <motion.div variants={variants} className="grid gap-1.5">
          <AuthPasswordControl
            autoComplete="new-password"
            aria-label={t("auth:FIELD_NEW_PASSWORD_LABEL")}
            aria-invalid={form.formState.errors.newPassword ? true : undefined}
            placeholder={t("auth:FIELD_NEW_PASSWORD_PLACEHOLDER")}
            startIcon={<Lock size={16} />}
            disabled={loading}
            {...form.register("newPassword")}
          />
          <AuthFieldError
            message={
              form.formState.errors.newPassword?.message
                ? String(form.formState.errors.newPassword.message)
                : undefined
            }
          />
        </motion.div>

        <motion.div variants={variants} className="grid gap-1.5">
          <AuthPasswordControl
            autoComplete="new-password"
            aria-label={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
            aria-invalid={form.formState.errors.confirmPassword ? true : undefined}
            placeholder={t("auth:FIELD_CONFIRM_PASSWORD_PLACEHOLDER")}
            startIcon={<Lock size={16} />}
            disabled={loading}
            {...form.register("confirmPassword")}
          />
          <AuthFieldError
            message={
              form.formState.errors.confirmPassword?.message
                ? String(form.formState.errors.confirmPassword.message)
                : undefined
            }
          />
        </motion.div>

        <motion.div variants={variants} className="grid gap-4">
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
    </motion.div>
  );
}
