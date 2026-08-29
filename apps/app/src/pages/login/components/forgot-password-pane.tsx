import { useNavigate } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { resolveAuthFormError } from "@/lib/auth/form-feedback";
import { AuthInputControl, AuthLinkButton } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

import {
  AUTH_FIELD_CLASS,
  AUTH_PANE_ROOT_CLASS,
  AUTH_BUTTON_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_INPUT_GROUP_CLASS,
  AUTH_OUTLINE_BUTTON_CLASS,
  AuthButtonLabel,
  AuthFormFeedback,
  AuthPaneLegal,
} from "./auth-pane-primitives";
import { AuthEntryHeader } from "./login-brand-slogan";

type ForgotPasswordPaneProps = {
  onSubmit: (email: string) => Promise<void>;
  initialEmail?: string;
  loading: boolean;
  onBackToLogin: () => void;
  reducedMotion: boolean;
  itemVariants: Variants;
};

type ForgotPasswordFormValues = {
  email: string;
};

type ForgotPasswordPaneStep = "form" | "success";

export function ForgotPasswordPane(props: ForgotPasswordPaneProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const variants = props.reducedMotion ? {} : props.itemVariants;
  const [step, setStep] = useState<ForgotPasswordPaneStep>("form");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(
      z.object({
        email: z
          .string()
          .min(1, t("auth:VALIDATION_EMAIL_REQUIRED"))
          .email(t("auth:VALIDATION_EMAIL_INVALID")),
      }),
    ),
    defaultValues: { email: props.initialEmail ?? "" },
    mode: "onSubmit",
  });
  const resetRef = useRef(form.reset);
  resetRef.current = form.reset;

  useEffect(() => {
    resetRef.current({ email: props.initialEmail ?? "" });
    setStep("form");
    setSubmitError(null);
  }, [props.initialEmail]);

  const emailValue = form.watch("email");

  useEffect(() => {
    setSubmitError(null);
  }, [emailValue]);

  const handleSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await props.onSubmit(values.email);
      form.reset({ email: values.email });
      setStep("success");
    } catch (error) {
      setSubmitError(resolveAuthFormError(error, t("errors:REQUEST_FAILED")));
    }
  });

  const goToReset = () => {
    void navigate({ to: "/reset-password" });
  };

  if (step === "success") {
    return (
      <div className={AUTH_PANE_ROOT_CLASS}>
        <AuthEntryHeader subtitleKey="auth:FORGOT_PASSWORD_SUCCESS_DESC" variants={variants} />
        <motion.div variants={variants} className="grid gap-4 pt-1.5">
          <Button
            className={AUTH_OUTLINE_BUTTON_CLASS}
            type="button"
            size="lg"
            variant="outline"
            onClick={props.onBackToLogin}
          >
            {t("auth:BACK_TO_LOGIN")}
          </Button>
          <div className="text-center">
            <AuthLinkButton onClick={goToReset} type="button">
              {t("auth:FORGOT_PASSWORD_MODAL_HAVE_TOKEN")}
            </AuthLinkButton>
          </div>
        </motion.div>
        <AuthPaneLegal i18nKey="auth:LEGAL_CONTINUE" variants={variants} />
      </div>
    );
  }

  return (
    <div className={AUTH_PANE_ROOT_CLASS}>
      <AuthEntryHeader subtitleKey="auth:FORGOT_PASSWORD_MODAL_DESC" variants={variants} />
      <form className="grid gap-4" autoComplete="on" onSubmit={handleSubmit}>
        <AuthFormFeedback message={submitError} variants={variants} />
        <motion.div variants={variants}>
          <Field className={AUTH_FIELD_CLASS}>
            <FieldContent className="gap-2">
              <AuthInputControl
                autoComplete="email"
                aria-label={t("auth:FIELD_EMAIL_LABEL")}
                aria-invalid={form.formState.errors.email ? true : undefined}
                className={AUTH_INPUT_GROUP_CLASS}
                inputClassName={AUTH_INPUT_CLASS}
                placeholder={t("auth:FORGOT_PASSWORD_MODAL_FIELD_PLACEHOLDER")}
                startIcon={<Mail size={16} />}
                disabled={props.loading}
                spellCheck={false}
                {...form.register("email")}
              />
              <FieldError>
                {form.formState.errors.email?.message
                  ? String(form.formState.errors.email.message)
                  : undefined}
              </FieldError>
            </FieldContent>
          </Field>
        </motion.div>

        <motion.div variants={variants} className="grid gap-4 pt-1">
          <Button className={AUTH_BUTTON_CLASS} type="submit" size="lg" loading={props.loading}>
            <AuthButtonLabel>{t("auth:FORGOT_PASSWORD_SUBMIT_BUTTON")}</AuthButtonLabel>
          </Button>
          <Button
            className={AUTH_OUTLINE_BUTTON_CLASS}
            type="button"
            size="lg"
            variant="outline"
            disabled={props.loading}
            onClick={props.onBackToLogin}
          >
            {t("auth:BACK_TO_LOGIN")}
          </Button>
          <div className="pt-1 text-center">
            <AuthLinkButton onClick={goToReset} type="button">
              {t("auth:FORGOT_PASSWORD_MODAL_HAVE_TOKEN")}
            </AuthLinkButton>
          </div>
        </motion.div>
      </form>
      <AuthPaneLegal i18nKey="auth:LEGAL_CONTINUE" variants={variants} />
    </div>
  );
}
