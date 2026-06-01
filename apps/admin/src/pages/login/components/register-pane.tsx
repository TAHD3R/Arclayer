import { Lock, Mail } from "lucide-react";
import { motion, type Variants } from "motion/react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { PASSWORD_PATTERN } from "@/lib/auth/form-feedback";
import { PasswordRequirementChecklist } from "@/components/auth/password-requirement-checklist";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { AuthOauthButtons } from "@/components/ui/oauth-buttons";
import { AuthInputControl, AuthLinkButton, AuthPasswordControl } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

import { useEmailVerificationCountdown } from "../hooks/use-email-verification-countdown";
import type { RegisterFormValues, RegisterPaneSeed } from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_INPUT_GROUP_CLASS,
  AUTH_PANE_CONTENT_CLASS,
  AUTH_PANE_META_CLASS,
  AUTH_PANE_ROOT_CLASS,
  AuthButtonLabel,
  AuthPaneHeader,
  AuthPaneLegal,
  AuthPaneTitleRow,
} from "./auth-pane-primitives";

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
  pendingOAuthProvider?: string | null;
  onStartOAuth?: (input: { provider: string; startUrl: string; keepSession: boolean }) => void;
  onSwitchToLogin: (email?: string, step?: "password") => void;
  reducedMotion: boolean;
  itemVariants: Variants;
};

function RegisterField(props: {
  title: string;
  helpText?: string;
  error?: string;
  variants: Variants | {};
  children: ReactNode;
}) {
  return (
    <motion.div variants={props.variants}>
      <Field className={AUTH_FIELD_CLASS}>
        <FieldContent className="gap-2.5">
          <AuthPaneTitleRow title={props.title} helpText={props.helpText} />
          {props.children}
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
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(
      z.object({
        email: z
          .string()
          .min(1, t("auth:VALIDATION_EMAIL_REQUIRED"))
          .email(t("auth:VALIDATION_EMAIL_INVALID")),
        password: z
          .string()
          .min(1, t("auth:VALIDATION_PASSWORD_REQUIRED"))
          .regex(PASSWORD_PATTERN, t("auth:PASSWORD_INVALID")),
      }),
    ),
    defaultValues: {
      email: "",
      password: "",
    },
    mode: "onSubmit",
  });
  const emailValue = form.watch("email");
  const passwordValue = form.watch("password");
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
    });
    setEmailExists(false);
  }, [seedEmail]);

  useEffect(() => {
    if (!props.verification) return;
    resetRef.current({
      email: props.verification.email,
      password: "",
    });
  }, [props.verification]);

  useEffect(() => {
    setEmailExists(false);
  }, [emailValue]);

  const submitRegister = form.handleSubmit(async (values) => {
    setEmailExists(false);
    const exists = await props.onEmailSubmit(values.email);
    if (exists) {
      setEmailExists(true);
      return;
    }
    await props.onSubmit(values);
  });

  const resendVerification = async () => {
    const email = verificationEmail || form.getValues("email");
    if (!email) return;
    const result = await props.onVerificationResend(email);
    setRetryAfter(result.retryAfter);
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
      <AuthPaneHeader titleKey="auth:REGISTER_PAGE_TITLE" variants={variants} />
      <div className={AUTH_PANE_CONTENT_CLASS}>
        <motion.div variants={variants} className="empty:hidden">
          <AuthOauthButtons
            disabled={busy || isVerificationPending}
            redirect={props.redirect}
            dividerPlacement="after"
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
        <form onSubmit={handleSubmit} className="grid gap-2" autoComplete="on">
          <motion.div variants={variants}>
            <Field className={AUTH_FIELD_CLASS}>
              <FieldContent className="gap-2.5">
                <AuthPaneTitleRow title={t("auth:FIELD_EMAIL_LABEL")} />
                <AuthInputControl
                  autoComplete="email"
                  aria-label={t("auth:FIELD_EMAIL_LABEL")}
                  aria-invalid={form.formState.errors.email ? true : undefined}
                  className={AUTH_INPUT_GROUP_CLASS}
                  inputClassName={AUTH_INPUT_CLASS}
                  placeholder={t("auth:FIELD_EMAIL_PLACEHOLDER")}
                  startIcon={<Mail size={16} />}
                  disabled={busy || isVerificationPending}
                  spellCheck={false}
                  {...form.register("email")}
                />
                <FieldError>
                  {form.formState.errors.email?.message
                    ? String(form.formState.errors.email.message)
                    : undefined}
                </FieldError>
                {isVerificationPending ? (
                  <div className="text-callout text-label-secondary">
                    {t("auth:REGISTER_VERIFY_EMAIL_SENT_HINT", {
                      email: verificationEmail || form.getValues("email"),
                    })}
                  </div>
                ) : null}
                {emailExists && !form.formState.errors.email ? (
                  <div className="text-callout text-label-secondary">
                    <span>{t("auth:REGISTER_EMAIL_EXISTS_MESSAGE")} </span>
                    <AuthLinkButton
                      className="!text-callout"
                      disabled={busy}
                      onClick={() => props.onSwitchToLogin(form.getValues("email"), "password")}
                      type="button"
                    >
                      {t("auth:REGISTER_EMAIL_EXISTS_ACTION")}
                    </AuthLinkButton>
                  </div>
                ) : null}
              </FieldContent>
            </Field>
          </motion.div>

          {isVerificationPending ? null : (
            <>
              <RegisterField
                title={t("auth:FIELD_PASSWORD_LABEL")}
                error={
                  form.formState.errors.password?.message
                    ? String(form.formState.errors.password.message)
                    : undefined
                }
                variants={variants}
              >
                <AuthPasswordControl
                  autoComplete="new-password"
                  aria-label={t("auth:FIELD_PASSWORD_LABEL")}
                  aria-invalid={form.formState.errors.password ? true : undefined}
                  className={AUTH_INPUT_GROUP_CLASS}
                  inputClassName={AUTH_INPUT_CLASS}
                  placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
                  startIcon={<Lock size={16} />}
                  disabled={busy}
                  {...form.register("password")}
                />
                <PasswordRequirementChecklist
                  password={passwordValue}
                  active={Boolean(form.formState.dirtyFields.password) || passwordValue.length > 0}
                  t={t}
                />
              </RegisterField>
            </>
          )}

          <motion.div variants={variants} className="grid gap-3 pt-1">
            <Button
              className="w-full"
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
          </motion.div>
        </form>
        <div className="grid mt-4 gap-2">
          <motion.div variants={variants} className={AUTH_PANE_META_CLASS}>
            <div className="text-callout text-label-secondary">
              <span>{t("auth:HAVE_ACCOUNT")} </span>
              <AuthLinkButton
                className="!px-1 !text-callout font-normal"
                disabled={busy}
                onClick={() => props.onSwitchToLogin()}
                type="button"
              >
                {t("auth:SIGN_IN")}
              </AuthLinkButton>
            </div>
          </motion.div>
          <AuthPaneLegal
            i18nKey="auth:LEGAL_REGISTER"
            variants={variants}
            className={AUTH_PANE_META_CLASS}
          />
        </div>
      </div>
    </div>
  );
}
