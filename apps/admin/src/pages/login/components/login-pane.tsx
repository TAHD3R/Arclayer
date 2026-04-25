import { Lock, Mail } from "lucide-react";
import { motion, type Variants } from "motion/react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { AuthOauthButtons } from "@/components/ui/oauth-buttons";
import { AuthInputControl, AuthLinkButton, AuthPasswordControl } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

import type { LoginEmailLookupResult, LoginFormValues, LoginPaneSeed } from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_INPUT_GROUP_CLASS,
  AUTH_PANE_META_CLASS,
  AUTH_PANE_STACK_CLASS,
  AuthButtonLabel,
  AuthPaneHeader,
  AuthPaneLegal,
  AuthPaneTitleRow,
} from "./auth-pane-primitives";

const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

type LoginPaneValues = LoginFormValues;
type LoginPaneStep = "email" | "password";

type LoginPaneProps = {
  onEmailSubmit: (email: string) => Promise<LoginEmailLookupResult>;
  onSubmit: (values: LoginFormValues) => Promise<void>;
  emailCheckLoading: boolean;
  loading: boolean;
  initialKeepSession: boolean;
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
  const [step, setStep] = useState<LoginPaneStep>("email");
  const [emailMissing, setEmailMissing] = useState(false);
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
      keepSession: props.initialKeepSession,
    },
    mode: "onSubmit",
  });
  const resetRef = useRef(form.reset);
  resetRef.current = form.reset;
  const seedEmail = props.loginSeed?.email ?? "";
  const seedStep = props.loginSeed?.step;

  useEffect(() => {
    const nextStep = seedStep === "password" && seedEmail ? "password" : "email";
    resetRef.current({
      email: seedEmail,
      password: "",
      keepSession: props.initialKeepSession,
    });
    setStep(nextStep);
    setEmailMissing(false);
  }, [props.initialKeepSession, seedEmail, seedStep]);

  const emailError = form.formState.errors.email?.message;
  const passwordError = form.formState.errors.password?.message;
  const keepSession = Boolean(form.watch("keepSession"));
  const emailFieldError = emailError ? String(emailError) : null;

  const submitPassword = async () => {
    const isEmailValid = await form.trigger("email");
    if (!isEmailValid) return;

    const password = form.getValues("password") ?? "";
    if (!password) {
      form.setError("password", { message: t("auth:VALIDATION_PASSWORD_REQUIRED") });
      return;
    }
    if (!PASSWORD_PATTERN.test(password)) {
      form.setError("password", { message: t("auth:PASSWORD_INVALID") });
      return;
    }

    setEmailMissing(false);
    await props.onSubmit({
      email: form.getValues("email"),
      password,
      keepSession,
    });
  };

  const handleContinue = async () => {
    const isValid = await form.trigger("email");
    if (!isValid) return;
    setEmailMissing(false);
    const lookup = await props.onEmailSubmit(form.getValues("email"));
    if (!lookup.exists) {
      setStep("email");
      setEmailMissing(true);
      return;
    }
    if (!lookup.passwordLoginAvailable) {
      props.onSwitchToEmailCode(form.getValues("email"), keepSession, false);
      return;
    }
    setStep("password");
    form.clearErrors("password");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === "email") {
      void handleContinue();
      return;
    }
    void submitPassword();
  };

  const handleUseAnotherEmail = () => {
    setStep("email");
    setEmailMissing(false);
    form.setValue("password", "");
    form.clearErrors("password");
  };

  return (
    <div className={AUTH_PANE_STACK_CLASS}>
      <AuthPaneHeader
        titleKey="auth:LOGIN_PAGE_TITLE"
        subtitle={
          props.publicRegisterEnabled ? (
            <>
              <span>{t("auth:NO_ACCOUNT")} </span>
              <AuthLinkButton
                className="text-inherit font-normal"
                disabled={props.emailCheckLoading || props.loading}
                onClick={() => props.onSwitchToRegister()}
                type="button"
              >
                {t("auth:CREATE_ACCOUNT")}
              </AuthLinkButton>
            </>
          ) : null
        }
        variants={variants}
      />
      <form onSubmit={handleSubmit} className="grid gap-2" autoComplete="on">
        <motion.div variants={variants}>
          <Field className={AUTH_FIELD_CLASS}>
            <FieldContent className="gap-2">
              <AuthPaneTitleRow
                title={t("auth:FIELD_EMAIL_LABEL")}
                action={
                  step === "password" ? (
                    <AuthLinkButton
                      disabled={props.emailCheckLoading || props.loading}
                      onClick={handleUseAnotherEmail}
                      type="button"
                    >
                      {t("auth:AUTH_CHANGE_EMAIL")}
                    </AuthLinkButton>
                  ) : undefined
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
                disabled={props.emailCheckLoading || props.loading || step === "password"}
                readOnly={step === "password"}
                spellCheck={false}
                {...form.register("email")}
              />
              <FieldError>{emailFieldError ?? undefined}</FieldError>
              {emailMissing && !emailError ? (
                <div className="text-footnote text-label-secondary">
                  <span>{t("auth:LOGIN_EMAIL_NOT_FOUND_MESSAGE")} </span>
                  <AuthLinkButton
                    disabled={props.emailCheckLoading || props.loading}
                    onClick={() => props.onSwitchToRegister(form.getValues("email"), "details")}
                    type="button"
                  >
                    {t("auth:LOGIN_EMAIL_NOT_FOUND_ACTION")}
                  </AuthLinkButton>
                </div>
              ) : null}
            </FieldContent>
          </Field>
        </motion.div>

        {step === "password" ? (
          <motion.div variants={variants}>
            <Field className={AUTH_FIELD_CLASS}>
              <FieldContent className="gap-2">
                <AuthPaneTitleRow
                  title={t("auth:FIELD_PASSWORD_LABEL")}
                  action={
                    <AuthLinkButton
                      disabled={props.emailCheckLoading || props.loading}
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
        ) : null}

        {step === "password" ? (
          <motion.div variants={variants} className="my-2">
            <div className="grid gap-1.5">
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={keepSession}
                  onCheckedChange={(value) => form.setValue("keepSession", Boolean(value))}
                />
                <span className="text-callout">{t("auth:KEEP_SESSION")}</span>
              </label>
            </div>
          </motion.div>
        ) : null}

        <motion.div variants={variants} className="grid gap-3 pt-1">
          <Button
            className="w-full"
            type="submit"
            size="lg"
            loading={step === "email" ? props.emailCheckLoading : props.loading}
          >
            <AuthButtonLabel>
              {step === "email" ? t("auth:LOGIN_NEXT_BUTTON") : t("auth:LOGIN_BUTTON")}
            </AuthButtonLabel>
          </Button>
        </motion.div>
      </form>
      {step === "email" ? (
        <motion.div variants={variants} className="pt-1.5 empty:hidden">
          <AuthOauthButtons
            disabled={props.emailCheckLoading || props.loading}
            redirect={props.redirect}
            loadingProvider={props.pendingOAuthProvider}
            onProviderStart={
              props.onStartOAuth
                ? ({ provider, startUrl }) =>
                    props.onStartOAuth?.({ provider, startUrl, keepSession })
                : undefined
            }
          />
        </motion.div>
      ) : null}
      {step === "password" ? (
        <motion.div variants={variants} className="pt-1.5 empty:hidden">
          <AuthOauthButtons
            disabled={props.emailCheckLoading || props.loading}
            showProviders={false}
            leadingActions={[
              {
                key: "email-code",
                label: t("auth:LOGIN_EMAIL_CODE_TITLE"),
                onClick: () => props.onSwitchToEmailCode(form.getValues("email"), keepSession),
              },
            ]}
          />
        </motion.div>
      ) : null}
      <AuthPaneLegal
        i18nKey="auth:LEGAL_CONTINUE"
        variants={variants}
        className={AUTH_PANE_META_CLASS}
      />
    </div>
  );
}
