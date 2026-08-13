import { Lock, Mail } from "lucide-react";
import { motion, type Variants } from "motion/react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { PasswordRulesPopover } from "@/components/auth/password-rules-popover";
import { resolveAuthFormError, type PasswordRequirementState } from "@/lib/auth/form-feedback";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { AuthInputControl, AuthLinkButton, AuthPasswordControl } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

import { useEmailVerificationCountdown } from "../hooks/use-email-verification-countdown";
import type { LoginEmailLookupResult, LoginFormValues, LoginPaneSeed } from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_PANE_ROOT_CLASS,
  AUTH_PILL_BUTTON_CLASS,
  AUTH_PILL_INPUT_CLASS,
  AUTH_PILL_INPUT_GROUP_CLASS,
  AUTH_PILL_OUTLINE_BUTTON_CLASS,
  AuthButtonLabel,
  AuthFormFeedback,
  AuthPaneLegal,
} from "./auth-pane-primitives";
import { AuthEntryHeader } from "./login-brand-slogan";

const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

type LoginPaneValues = LoginFormValues;

type LoginPaneProps = {
  onEmailSubmit: (email: string) => Promise<LoginEmailLookupResult>;
  onSubmit: (values: LoginFormValues) => Promise<void>;
  onVerificationResend: (email: string) => Promise<{ retryAfter: number }>;
  verification?: { email: string; retryAfter: number } | null;
  emailCheckLoading: boolean;
  loading: boolean;
  resendLoading: boolean;
  loginSeed?: LoginPaneSeed | null;
  emailLocked?: boolean;
  onForgotPassword: (email?: string) => void;
  onSwitchToEmailCode: (
    email?: string,
    keepSession?: boolean,
    passwordLoginAvailable?: boolean,
  ) => void;
  onSwitchToRegister: (email?: string, step?: "details") => void;
  onBackToMethods?: () => void;
  oauthUnavailable?: boolean;
  publicRegisterEnabled: boolean;
  reducedMotion: boolean;
  itemVariants: Variants;
};

export function LoginPane(props: LoginPaneProps) {
  const { t } = useTranslation();
  const variants = props.reducedMotion ? {} : props.itemVariants;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<LoginPaneValues>({
    resolver: zodResolver(
      z.object({
        email: z
          .string()
          .min(1, t("auth:VALIDATION_EMAIL_REQUIRED"))
          .email(t("auth:VALIDATION_EMAIL_INVALID")),
        password: z.string(),
        keepSession: z.boolean(),
      }),
    ),
    defaultValues: {
      email: "",
      password: "",
      keepSession: true,
    },
    mode: "onSubmit",
  });
  const resetRef = useRef(form.reset);
  resetRef.current = form.reset;
  const seedEmail = props.loginSeed?.email ?? "";
  const verificationEmail = props.verification?.email ?? "";
  const isVerificationPending = Boolean(props.verification);
  const busy = props.emailCheckLoading || props.loading || props.resendLoading;
  const { retryAfter, setRetryAfter } = useEmailVerificationCountdown(props.verification);

  useEffect(() => {
    if (isVerificationPending) return;
    resetRef.current({
      email: seedEmail,
      password: "",
      keepSession: true,
    });
  }, [isVerificationPending, seedEmail]);

  useEffect(() => {
    if (!props.verification) return;
    resetRef.current({
      email: props.verification.email,
      password: "",
      keepSession: true,
    });
  }, [props.verification]);

  const emailError = form.formState.errors.email?.message;
  const passwordError = form.formState.errors.password?.message;
  const emailFieldError = emailError ? String(emailError) : null;
  const passwordValue = form.watch("password");
  const emailValue = form.watch("email");
  const passwordRequirements: PasswordRequirementState[] = [
    {
      key: "length",
      label: t("auth:PASSWORD_REQUIREMENT_LENGTH"),
      met: passwordValue.length >= 8 && passwordValue.length <= 128,
    },
    {
      key: "letter",
      label: t("auth:LOGIN_PASSWORD_REQUIREMENT_LETTER"),
      met: /[A-Za-z]/.test(passwordValue),
    },
    {
      key: "number",
      label: t("auth:PASSWORD_REQUIREMENT_NUMBER"),
      met: /\d/.test(passwordValue),
    },
  ];

  useEffect(() => {
    setSubmitError(null);
  }, [emailValue, passwordValue]);

  const submitLogin = async () => {
    if (isVerificationPending) {
      if (retryAfter > 0 || busy) return;
      const email = verificationEmail || form.getValues("email");
      if (!email) return;
      setSubmitError(null);
      try {
        const result = await props.onVerificationResend(email);
        setRetryAfter(result.retryAfter);
      } catch (error) {
        setSubmitError(resolveAuthFormError(error, t("errors:REQUEST_FAILED")));
      }
      return;
    }

    const isEmailValid = await form.trigger("email");
    if (!isEmailValid) return;

    const password = form.getValues("password") ?? "";
    if (!password) {
      form.setError("password", {
        message: t("auth:VALIDATION_PASSWORD_REQUIRED"),
      });
      return;
    }
    if (!PASSWORD_PATTERN.test(password)) {
      form.setError("password", { message: t("auth:LOGIN_PASSWORD_INVALID") });
      return;
    }

    const email = form.getValues("email");
    setSubmitError(null);
    try {
      const lookup = await props.onEmailSubmit(email);
      if (!lookup.exists) {
        setSubmitError(t("errors:INVALID_CREDENTIALS"));
        return;
      }
      if (!lookup.passwordLoginAvailable) {
        props.onSwitchToEmailCode(email, true, false);
        return;
      }

      await props.onSubmit({
        email,
        password,
        keepSession: true,
      });
    } catch (error) {
      setSubmitError(resolveAuthFormError(error, t("errors:REQUEST_FAILED")));
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitLogin();
  };
  const inactiveControlDisabled = busy || isVerificationPending;
  const showBackButton = Boolean(props.onBackToMethods) && !isVerificationPending;

  return (
    <div className={AUTH_PANE_ROOT_CLASS}>
      <AuthEntryHeader
        mode="login"
        onSwitch={props.publicRegisterEnabled ? () => props.onSwitchToRegister() : undefined}
        disabled={isVerificationPending ? false : inactiveControlDisabled}
        variants={variants}
      />
      <div className="grid gap-6">
        <form onSubmit={handleSubmit} className="grid gap-4" autoComplete="on">
          <AuthFormFeedback
            message={props.oauthUnavailable ? t("auth:SSO_UNAVAILABLE") : null}
            tone="neutral"
            variants={variants}
          />
          <AuthFormFeedback
            message={
              isVerificationPending
                ? t("auth:REGISTER_VERIFY_EMAIL_SENT_HINT", {
                    email: verificationEmail || form.getValues("email"),
                  })
                : null
            }
            tone="neutral"
            variants={variants}
          />
          <AuthFormFeedback message={submitError} variants={variants} />
          <motion.div variants={variants}>
            <Field className={AUTH_FIELD_CLASS}>
              <FieldContent className="gap-2">
                <AuthInputControl
                  autoComplete="email"
                  aria-label={t("auth:FIELD_EMAIL_LABEL")}
                  aria-invalid={emailError ? true : undefined}
                  className={AUTH_PILL_INPUT_GROUP_CLASS}
                  inputClassName={AUTH_PILL_INPUT_CLASS}
                  placeholder={t("auth:FIELD_EMAIL_PLACEHOLDER")}
                  startIcon={<Mail size={16} />}
                  disabled={inactiveControlDisabled || props.emailLocked}
                  spellCheck={false}
                  {...form.register("email")}
                />
                <FieldError>{emailFieldError ?? undefined}</FieldError>
              </FieldContent>
            </Field>
          </motion.div>

          {isVerificationPending ? null : (
            <motion.div variants={variants}>
              <Field className={AUTH_FIELD_CLASS}>
                <FieldContent className="gap-2">
                  <PasswordRulesPopover
                    password={passwordValue}
                    requirements={passwordRequirements}
                  >
                    <AuthPasswordControl
                      autoComplete="current-password"
                      aria-label={t("auth:FIELD_PASSWORD_LABEL")}
                      aria-invalid={passwordError ? true : undefined}
                      className={AUTH_PILL_INPUT_GROUP_CLASS}
                      inputClassName={AUTH_PILL_INPUT_CLASS}
                      placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
                      startIcon={<Lock size={16} />}
                      disabled={props.loading}
                      {...form.register("password")}
                    />
                  </PasswordRulesPopover>
                  <FieldError>{passwordError ? String(passwordError) : undefined}</FieldError>
                  <div className="flex justify-end px-1 pt-1">
                    <AuthLinkButton
                      disabled={inactiveControlDisabled}
                      onClick={() => props.onForgotPassword(form.getValues("email"))}
                      type="button"
                    >
                      {t("auth:FORGOT_PASSWORD")}
                    </AuthLinkButton>
                  </div>
                </FieldContent>
              </Field>
            </motion.div>
          )}

          <motion.div variants={variants} className="grid gap-4 pt-1">
            <Button
              className={AUTH_PILL_BUTTON_CLASS}
              type="submit"
              size="lg"
              loading={busy && (!isVerificationPending || props.resendLoading)}
              disabled={busy || (isVerificationPending && retryAfter > 0)}
            >
              <AuthButtonLabel>
                {isVerificationPending
                  ? retryAfter > 0
                    ? t("auth:REGISTER_VERIFY_EMAIL_RESEND_WAIT", { countdown: `${retryAfter}s` })
                    : t("auth:REGISTER_VERIFY_EMAIL_RESEND_ACTION")
                  : t("auth:LOGIN_BUTTON")}
              </AuthButtonLabel>
            </Button>
            {showBackButton ? (
              <Button
                className={AUTH_PILL_OUTLINE_BUTTON_CLASS}
                type="button"
                size="lg"
                variant="outline"
                disabled={inactiveControlDisabled}
                onClick={props.onBackToMethods}
              >
                {t("auth:LOGIN_BACK_TO_METHODS")}
              </Button>
            ) : null}
            {isVerificationPending ? null : (
              <AuthLinkButton
                className="mx-auto px-2 font-semibold text-label-secondary"
                disabled={inactiveControlDisabled}
                onClick={() => props.onSwitchToEmailCode(form.getValues("email"), true)}
                type="button"
              >
                {t("auth:LOGIN_EMAIL_CODE_ACTION")}
              </AuthLinkButton>
            )}
          </motion.div>
        </form>
        <AuthPaneLegal i18nKey="auth:LEGAL_CONTINUE" variants={variants} />
      </div>
    </div>
  );
}
