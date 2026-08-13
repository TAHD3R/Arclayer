import { Lock, Mail, UserRound } from "lucide-react";
import { motion, type Variants } from "motion/react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { PasswordRulesPopover } from "@/components/auth/password-rules-popover";
import {
  getAuthValidationDetails,
  PASSWORD_PATTERN,
  resolveAuthFormError,
} from "@/lib/auth/form-feedback";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { AuthOauthButtons } from "@/components/ui/oauth-buttons";
import { AuthInputControl, AuthLinkButton, AuthPasswordControl } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

import { useEmailVerificationCountdown } from "../hooks/use-email-verification-countdown";
import type { RegisterFormValues, RegisterPaneSeed } from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_PANE_CONTENT_CLASS,
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

type RegisterPaneProps = {
  onEmailSubmit: (email: string) => Promise<boolean>;
  onSubmit: (values: RegisterFormValues) => Promise<void>;
  onVerificationResend: (email: string) => Promise<{ retryAfter: number }>;
  verification?: { email: string; retryAfter: number } | null;
  emailCheckLoading: boolean;
  loading: boolean;
  resendLoading: boolean;
  redirect?: string;
  registerSeed?: RegisterPaneSeed | null;
  invitationRegistration?: boolean;
  emailLocked?: boolean;
  pendingOAuthProvider?: string | null;
  onStartOAuth?: (input: { provider: string; startUrl: string; keepSession: boolean }) => void;
  onSwitchToLogin: (email?: string, step?: "password") => void;
  reducedMotion: boolean;
  itemVariants: Variants;
};

function RegisterField(props: {
  helpText?: string;
  error?: string;
  variants: Variants | {};
  children: ReactNode;
}) {
  return (
    <motion.div variants={props.variants}>
      <Field className={AUTH_FIELD_CLASS}>
        <FieldContent className="gap-2">
          {props.children}
          {props.helpText ? (
            <p className="px-4 text-footnote text-label-secondary">{props.helpText}</p>
          ) : null}
          <FieldError>{props.error}</FieldError>
        </FieldContent>
      </Field>
    </motion.div>
  );
}

export function RegisterPane(props: RegisterPaneProps) {
  const { t } = useTranslation();
  const variants = props.reducedMotion ? {} : props.itemVariants;
  const [emailExists, setEmailExists] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(
      z
        .object({
          email: z
            .string()
            .min(1, t("auth:VALIDATION_EMAIL_REQUIRED"))
            .email(t("auth:VALIDATION_EMAIL_INVALID")),
          password: z
            .string()
            .min(1, t("auth:VALIDATION_PASSWORD_REQUIRED"))
            .regex(PASSWORD_PATTERN, t("auth:PASSWORD_INVALID")),
          username: z.string().optional(),
        })
        .superRefine((value, context) => {
          if (!props.invitationRegistration) return;
          const username = value.username?.trim() ?? "";
          if (!username) {
            context.addIssue({
              code: "custom",
              path: ["username"],
              message: t("auth:VALIDATION_USERNAME_REQUIRED"),
            });
            return;
          }
          if (
            username.length < 6 ||
            username.length > 18 ||
            !/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)
          ) {
            context.addIssue({
              code: "custom",
              path: ["username"],
              message: t("auth:VALIDATION_INVITE_USERNAME_INVALID"),
            });
          }
        }),
    ),
    defaultValues: {
      email: "",
      password: "",
      username: "",
    },
    mode: "onSubmit",
  });
  const emailValue = form.watch("email");
  const passwordValue = form.watch("password");
  const usernameValue = form.watch("username");
  const resetRef = useRef(form.reset);
  resetRef.current = form.reset;
  const seedEmail = props.registerSeed?.email ?? "";
  const verificationEmail = props.verification?.email ?? "";
  const isVerificationPending = Boolean(props.verification);
  const busy = props.emailCheckLoading || props.loading || props.resendLoading;
  const { retryAfter, setRetryAfter } = useEmailVerificationCountdown(props.verification);

  useEffect(() => {
    resetRef.current({
      email: seedEmail,
      password: "",
      username: "",
    });
    setEmailExists(false);
    setSubmitError(null);
  }, [seedEmail]);

  useEffect(() => {
    if (!props.verification) return;
    resetRef.current({
      email: props.verification.email,
      password: "",
      username: "",
    });
  }, [props.verification]);

  useEffect(() => {
    setEmailExists(false);
    setSubmitError(null);
    form.clearErrors("email");
  }, [emailValue]);

  useEffect(() => {
    setSubmitError(null);
    form.clearErrors("password");
  }, [passwordValue]);

  useEffect(() => {
    setSubmitError(null);
    form.clearErrors("username");
  }, [usernameValue]);

  const submitRegister = form.handleSubmit(async (values) => {
    setEmailExists(false);
    setSubmitError(null);
    try {
      const exists = await props.onEmailSubmit(values.email);
      if (exists) {
        setEmailExists(true);
        return;
      }
      await props.onSubmit(
        props.invitationRegistration
          ? values
          : {
              email: values.email,
              password: values.password,
            },
      );
    } catch (error) {
      const validationDetails = getAuthValidationDetails(error);
      let fieldErrorHandled = false;
      let formValidationError: string | null = null;
      for (const detail of validationDetails) {
        if (
          detail.field !== "email" &&
          detail.field !== "password" &&
          detail.field !== "username"
        ) {
          formValidationError ??= detail.message;
          continue;
        }
        form.setError(detail.field, {
          type: "server",
          message: detail.code === "PASSWORD_INVALID" ? t("auth:PASSWORD_INVALID") : detail.message,
        });
        fieldErrorHandled = true;
      }
      if (formValidationError) setSubmitError(formValidationError);
      if (fieldErrorHandled || formValidationError) return;
      setSubmitError(resolveAuthFormError(error, t("errors:REQUEST_FAILED")));
    }
  });

  const resendVerification = async () => {
    const email = verificationEmail || form.getValues("email");
    if (!email) return;
    setSubmitError(null);
    try {
      const result = await props.onVerificationResend(email);
      setRetryAfter(result.retryAfter);
    } catch (error) {
      setSubmitError(resolveAuthFormError(error, t("errors:REQUEST_FAILED")));
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isVerificationPending) {
      if (retryAfter > 0 || busy) return;
      void resendVerification();
      return;
    }
    void submitRegister();
  };

  return (
    <div className={AUTH_PANE_ROOT_CLASS}>
      <AuthEntryHeader
        mode="register"
        onSwitch={() => props.onSwitchToLogin()}
        disabled={busy}
        variants={variants}
      />
      <h2 className="sr-only">{t("auth:REGISTER_PAGE_TITLE")}</h2>
      <div className={AUTH_PANE_CONTENT_CLASS}>
        <motion.div variants={variants} className="empty:hidden">
          <AuthOauthButtons
            disabled={busy || isVerificationPending}
            redirect={props.redirect}
            dividerLabelKey="auth:OAUTH_REGISTER_DIVIDER"
            dividerPlacement="after"
            providerLayout="primary-plus-grid"
            loadingProvider={props.pendingOAuthProvider}
            onProviderStart={
              props.onStartOAuth
                ? ({ provider, startUrl }) =>
                    props.onStartOAuth?.({
                      provider,
                      startUrl,
                      keepSession: true,
                    })
                : undefined
            }
          />
        </motion.div>
        <form onSubmit={handleSubmit} className="grid gap-4" autoComplete="on">
          <AuthFormFeedback message={submitError} variants={variants} />
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
          <AuthFormFeedback
            message={emailExists ? t("auth:REGISTER_EMAIL_EXISTS_MESSAGE") : null}
            tone="neutral"
            variants={variants}
            action={
              <AuthLinkButton
                className="!text-callout"
                disabled={busy}
                onClick={() => props.onSwitchToLogin(form.getValues("email"), "password")}
                type="button"
              >
                {t("auth:REGISTER_EMAIL_EXISTS_ACTION")}
              </AuthLinkButton>
            }
          />
          <motion.div variants={variants}>
            <Field className={AUTH_FIELD_CLASS}>
              <FieldContent className="gap-2">
                <AuthInputControl
                  autoComplete="email"
                  aria-label={t("auth:FIELD_EMAIL_LABEL")}
                  aria-invalid={form.formState.errors.email ? true : undefined}
                  className={AUTH_PILL_INPUT_GROUP_CLASS}
                  inputClassName={AUTH_PILL_INPUT_CLASS}
                  placeholder={t("auth:FIELD_EMAIL_PLACEHOLDER")}
                  startIcon={<Mail size={16} />}
                  disabled={busy || isVerificationPending || props.emailLocked}
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

          {isVerificationPending ? null : (
            <>
              {props.invitationRegistration ? (
                <RegisterField
                  helpText={t("auth:FIELD_USERNAME_HELP")}
                  error={
                    form.formState.errors.username?.message
                      ? String(form.formState.errors.username.message)
                      : undefined
                  }
                  variants={variants}
                >
                  <AuthInputControl
                    autoComplete="username"
                    aria-label={t("auth:FIELD_USERNAME_LABEL")}
                    aria-invalid={form.formState.errors.username ? true : undefined}
                    className={AUTH_PILL_INPUT_GROUP_CLASS}
                    inputClassName={AUTH_PILL_INPUT_CLASS}
                    placeholder={t("auth:FIELD_USERNAME_PLACEHOLDER")}
                    startIcon={<UserRound size={16} />}
                    disabled={busy}
                    spellCheck={false}
                    {...form.register("username")}
                  />
                </RegisterField>
              ) : null}
              <RegisterField
                error={
                  form.formState.errors.password?.message
                    ? String(form.formState.errors.password.message)
                    : undefined
                }
                variants={variants}
              >
                <PasswordRulesPopover password={passwordValue}>
                  <AuthPasswordControl
                    autoComplete="new-password"
                    aria-label={t("auth:FIELD_PASSWORD_LABEL")}
                    aria-invalid={form.formState.errors.password ? true : undefined}
                    className={AUTH_PILL_INPUT_GROUP_CLASS}
                    inputClassName={AUTH_PILL_INPUT_CLASS}
                    placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
                    startIcon={<Lock size={16} />}
                    disabled={busy}
                    {...form.register("password")}
                  />
                </PasswordRulesPopover>
              </RegisterField>
            </>
          )}

          <motion.div variants={variants} className="grid gap-4 pt-1">
            <Button
              className={AUTH_PILL_BUTTON_CLASS}
              type="submit"
              size="lg"
              loading={busy && (!isVerificationPending || props.resendLoading)}
              disabled={busy || (isVerificationPending ? retryAfter > 0 : false)}
            >
              <AuthButtonLabel>
                {isVerificationPending
                  ? retryAfter > 0
                    ? t("auth:REGISTER_VERIFY_EMAIL_RESEND_WAIT", { countdown: `${retryAfter}s` })
                    : t("auth:REGISTER_VERIFY_EMAIL_RESEND_ACTION")
                  : t("auth:REGISTER_BUTTON")}
              </AuthButtonLabel>
            </Button>
            {isVerificationPending ? null : (
              <Button
                className={AUTH_PILL_OUTLINE_BUTTON_CLASS}
                type="button"
                size="lg"
                variant="outline"
                disabled={busy}
                onClick={() => props.onSwitchToLogin()}
              >
                {t("auth:BACK_TO_LOGIN")}
              </Button>
            )}
          </motion.div>
        </form>
        <AuthPaneLegal i18nKey="auth:LEGAL_REGISTER" variants={variants} className="mt-2" />
      </div>
    </div>
  );
}
