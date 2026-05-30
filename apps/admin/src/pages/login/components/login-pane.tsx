import { Lock, Mail } from "lucide-react";
import { motion, type Variants } from "motion/react";
import type { FormEvent } from "react";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { AuthOauthButtons } from "@/components/ui/oauth-buttons";
import { AuthInputControl, AuthLinkButton, AuthPasswordControl } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

import { useEmailVerificationCountdown } from "../hooks/use-email-verification-countdown";
import type { LoginEmailLookupResult, LoginFormValues, LoginPaneSeed } from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_INPUT_GROUP_CLASS,
  AUTH_PANE_CONTENT_CLASS,
  AUTH_PANE_META_CLASS,
  AUTH_PANE_ROOT_CLASS,
  AuthButtonLabel,
  AuthPaneHeader,
  AuthPaneTitleRow,
} from "./auth-pane-primitives";

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
  redirect?: string;
  pendingOAuthProvider?: string | null;
  onStartOAuth?: (input: { provider: string; startUrl: string; keepSession: boolean }) => void;
  onForgotPassword: (email?: string) => void;
  onSwitchToEmailCode: (
    email?: string,
    keepSession?: boolean,
    passwordLoginAvailable?: boolean,
  ) => void;
  onSwitchToRegister: (email?: string, step?: "details") => void;
  publicRegisterEnabled: boolean;
  reducedMotion: boolean;
  itemVariants: Variants;
};

export function LoginPane(props: LoginPaneProps) {
  const { t } = useTranslation();
  const variants = props.reducedMotion ? {} : props.itemVariants;
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

  const submitLogin = async () => {
    if (isVerificationPending) {
      if (retryAfter > 0 || busy) return;
      const email = verificationEmail || form.getValues("email");
      if (!email) return;
      const result = await props.onVerificationResend(email);
      setRetryAfter(result.retryAfter);
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
      form.setError("password", { message: t("auth:PASSWORD_INVALID") });
      return;
    }

    const email = form.getValues("email");
    const lookup = await props.onEmailSubmit(email);
    if (!lookup.exists) {
      form.setError("email", {
        message: t("auth:LOGIN_EMAIL_NOT_REACHABLE"),
      });
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
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitLogin();
  };
  const inactiveControlDisabled = busy || isVerificationPending;

  return (
    <div className={AUTH_PANE_ROOT_CLASS}>
      <AuthPaneHeader titleKey="auth:LOGIN_PAGE_TITLE" variants={variants} />
      <div className={AUTH_PANE_CONTENT_CLASS}>
        <motion.div variants={variants} className="empty:hidden">
          <AuthOauthButtons
            disabled={inactiveControlDisabled}
            redirect={props.redirect}
            dividerPlacement="after"
            loadingProvider={props.pendingOAuthProvider}
            onProviderStart={
              props.onStartOAuth && !isVerificationPending
                ? ({ provider, startUrl }) =>
                    props.onStartOAuth?.({ provider, startUrl, keepSession: true })
                : undefined
            }
          />
        </motion.div>
        <form onSubmit={handleSubmit} className="grid gap-2" autoComplete="on">
          <motion.div variants={variants}>
            <Field className={AUTH_FIELD_CLASS}>
              <FieldContent className="gap-2.5">
                <AuthPaneTitleRow
                  title={t("auth:FIELD_EMAIL_LABEL")}
                  action={
                    isVerificationPending ? null : (
                      <AuthLinkButton
                        disabled={inactiveControlDisabled}
                        onClick={() => props.onSwitchToEmailCode(form.getValues("email"), true)}
                        type="button"
                      >
                        {t("auth:LOGIN_EMAIL_CODE_ACTION")}
                      </AuthLinkButton>
                    )
                  }
                />
                <AuthInputControl
                  autoComplete="email"
                  aria-label={t("auth:FIELD_EMAIL_LABEL")}
                  aria-invalid={emailError ? true : undefined}
                  className={AUTH_INPUT_GROUP_CLASS}
                  inputClassName={AUTH_INPUT_CLASS}
                  placeholder={t("auth:FIELD_EMAIL_PLACEHOLDER")}
                  startIcon={<Mail size={16} />}
                  disabled={inactiveControlDisabled}
                  spellCheck={false}
                  {...form.register("email")}
                />
                <FieldError>{emailFieldError ?? undefined}</FieldError>
                {isVerificationPending ? (
                  <div className="text-callout text-label-secondary">
                    {t("auth:REGISTER_VERIFY_EMAIL_SENT_HINT", {
                      email: verificationEmail || form.getValues("email"),
                    })}
                  </div>
                ) : null}
              </FieldContent>
            </Field>
          </motion.div>

          {isVerificationPending ? null : (
            <motion.div variants={variants}>
              <Field className={AUTH_FIELD_CLASS}>
                <FieldContent className="gap-2.5">
                  <AuthPaneTitleRow
                    title={t("auth:FIELD_PASSWORD_LABEL")}
                    action={
                      <AuthLinkButton
                        disabled={inactiveControlDisabled}
                        onClick={() => props.onForgotPassword(form.getValues("email"))}
                        type="button"
                      >
                        {t("auth:FORGOT_PASSWORD")}
                      </AuthLinkButton>
                    }
                  />
                  <AuthPasswordControl
                    autoComplete="current-password"
                    aria-label={t("auth:FIELD_PASSWORD_LABEL")}
                    aria-invalid={passwordError ? true : undefined}
                    className={AUTH_INPUT_GROUP_CLASS}
                    inputClassName={AUTH_INPUT_CLASS}
                    placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
                    startIcon={<Lock size={16} />}
                    disabled={props.loading}
                    {...form.register("password")}
                  />
                  <FieldError>{passwordError ? String(passwordError) : undefined}</FieldError>
                </FieldContent>
              </Field>
            </motion.div>
          )}

          <motion.div variants={variants} className="grid gap-3 pt-1">
            <Button
              className="w-full"
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
          </motion.div>
        </form>
        {props.publicRegisterEnabled ? (
          <div className="grid mt-4 gap-2">
            <motion.div variants={variants} className={AUTH_PANE_META_CLASS}>
              <div className="text-callout text-label-secondary">
                <span>{t("auth:NO_ACCOUNT")} </span>
                <AuthLinkButton
                  className="!px-1 !text-callout font-normal"
                  disabled={isVerificationPending ? false : inactiveControlDisabled}
                  onClick={() => props.onSwitchToRegister()}
                  type="button"
                >
                  {t("auth:CREATE_ACCOUNT")}
                </AuthLinkButton>
              </div>
            </motion.div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
