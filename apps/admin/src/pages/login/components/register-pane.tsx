import { CheckCircle2, CircleAlert, LoaderCircle, Lock, Mail, User } from "lucide-react";
import { motion, type Variants } from "motion/react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import {
  ACCOUNT_NAME_PATTERN,
  PASSWORD_PATTERN,
  useUsernameAvailability,
} from "@/lib/auth/form-feedback";
import { PasswordRequirementChecklist } from "@/components/auth/password-requirement-checklist";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { AuthOauthButtons } from "@/components/ui/oauth-buttons";
import { AuthInputControl, AuthLinkButton, AuthPasswordControl } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

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

type RegisterPaneStep = "email" | "details";

type RegisterPaneProps = {
  onEmailSubmit: (email: string) => Promise<boolean>;
  onSubmit: (values: RegisterFormValues) => Promise<void>;
  emailCheckLoading: boolean;
  loading: boolean;
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
  const [step, setStep] = useState<RegisterPaneStep>("email");
  const [emailExists, setEmailExists] = useState(false);
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(
      z.object({
        email: z
          .string()
          .min(1, t("auth:VALIDATION_EMAIL_REQUIRED"))
          .email(t("auth:VALIDATION_EMAIL_INVALID")),
        displayName: z.string().min(1, t("auth:VALIDATION_DISPLAY_NAME_REQUIRED")),
        username: z
          .string()
          .min(1, t("auth:VALIDATION_USERNAME_REQUIRED"))
          .regex(ACCOUNT_NAME_PATTERN, t("auth:VALIDATION_USERNAME_INVALID")),
        password: z
          .string()
          .min(1, t("auth:VALIDATION_PASSWORD_REQUIRED"))
          .regex(PASSWORD_PATTERN, t("auth:PASSWORD_INVALID")),
      }),
    ),
    defaultValues: {
      email: "",
      displayName: "",
      username: "",
      password: "",
    },
    mode: "onSubmit",
  });
  const usernameValue = form.watch("username");
  const passwordValue = form.watch("password");
  const usernameAvailability = useUsernameAvailability(usernameValue, step === "details");
  const normalizedUsername = String(usernameValue || "")
    .trim()
    .toLowerCase();
  const usernameHasValue = normalizedUsername.length > 0;
  const usernameFeedback = !usernameHasValue
    ? null
    : !usernameAvailability.formatValid
      ? {
          tone: "danger" as const,
          message: t("auth:VALIDATION_USERNAME_INVALID"),
          icon: <CircleAlert className="size-4" />,
        }
      : usernameAvailability.isChecking
        ? {
            tone: "default" as const,
            message: t("auth:USERNAME_AVAILABILITY_CHECKING"),
            icon: <LoaderCircle className="size-4 animate-spin" />,
          }
        : usernameAvailability.isError
          ? {
              tone: "danger" as const,
              message: t("auth:USERNAME_AVAILABILITY_CHECK_FAILED"),
              icon: <CircleAlert className="size-4" />,
            }
          : usernameAvailability.available
            ? {
                tone: "success" as const,
                message: t("auth:USERNAME_AVAILABILITY_AVAILABLE"),
                icon: <CheckCircle2 className="size-4" />,
              }
            : usernameAvailability.unavailable
              ? {
                  tone: "danger" as const,
                  message: t("auth:USERNAME_AVAILABILITY_UNAVAILABLE"),
                  icon: <CircleAlert className="size-4" />,
                }
              : null;
  const usernameFeedbackClassName =
    usernameFeedback?.tone === "success"
      ? "text-success"
      : usernameFeedback?.tone === "danger"
        ? "text-destructive"
        : "text-label-secondary";
  const usernameChecking = step === "details" && usernameAvailability.isChecking;
  const usernameUnavailable =
    step === "details" && usernameAvailability.formatValid && usernameAvailability.unavailable;
  const resetRef = useRef(form.reset);
  resetRef.current = form.reset;
  const seedEmail = props.registerSeed?.email ?? "";
  const seedStep = props.registerSeed?.step;

  useEffect(() => {
    const nextStep = seedStep === "details" && seedEmail ? "details" : "email";
    resetRef.current({
      email: seedEmail,
      displayName: "",
      username: "",
      password: "",
    });
    setStep(nextStep);
    setEmailExists(false);
  }, [seedEmail, seedStep]);

  const submitDetails = form.handleSubmit(async (values) => {
    setEmailExists(false);
    await props.onSubmit(values);
  });

  const handleContinue = async () => {
    const isValid = await form.trigger("email");
    if (!isValid) return;
    setEmailExists(false);
    const exists = await props.onEmailSubmit(form.getValues("email"));
    if (exists) {
      setStep("email");
      setEmailExists(true);
      return;
    }
    setStep("details");
    form.clearErrors(["displayName", "username", "password"]);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === "email") {
      void handleContinue();
      return;
    }
    void submitDetails();
  };

  const handleUseAnotherEmail = () => {
    setStep("email");
    setEmailExists(false);
    form.setValue("displayName", "");
    form.setValue("username", "");
    form.setValue("password", "");
    form.clearErrors(["displayName", "username", "password"]);
  };

  return (
    <div className={AUTH_PANE_ROOT_CLASS}>
      <AuthPaneHeader titleKey="auth:REGISTER_PAGE_TITLE" variants={variants} />
      <div className={AUTH_PANE_CONTENT_CLASS}>
        {step === "email" ? (
          <motion.div variants={variants} className="empty:hidden">
            <AuthOauthButtons
              disabled={props.emailCheckLoading || props.loading}
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
        ) : null}
        <form onSubmit={handleSubmit} className="grid gap-2" autoComplete="on">
          <motion.div variants={variants}>
            <Field className={AUTH_FIELD_CLASS}>
              <FieldContent className="gap-2.5">
                <AuthPaneTitleRow
                  title={t("auth:FIELD_EMAIL_LABEL")}
                  action={
                    step === "details" ? (
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
                  aria-invalid={form.formState.errors.email ? true : undefined}
                  className={AUTH_INPUT_GROUP_CLASS}
                  inputClassName={AUTH_INPUT_CLASS}
                  placeholder={t("auth:FIELD_EMAIL_PLACEHOLDER")}
                  startIcon={<Mail size={16} />}
                  disabled={props.emailCheckLoading || props.loading || step === "details"}
                  readOnly={step === "details"}
                  spellCheck={false}
                  {...form.register("email")}
                />
                <FieldError>
                  {form.formState.errors.email?.message
                    ? String(form.formState.errors.email.message)
                    : undefined}
                </FieldError>
                {emailExists && !form.formState.errors.email ? (
                  <div className="text-body text-label-secondary">
                    <span>{t("auth:REGISTER_EMAIL_EXISTS_MESSAGE")} </span>
                    <AuthLinkButton
                      className="!text-body"
                      disabled={props.emailCheckLoading || props.loading}
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

          {step === "details" ? (
            <>
              <RegisterField
                title={t("auth:FIELD_DISPLAY_NAME_LABEL")}
                helpText={t("auth:FIELD_DISPLAY_NAME_HELP")}
                error={
                  form.formState.errors.displayName?.message
                    ? String(form.formState.errors.displayName.message)
                    : undefined
                }
                variants={variants}
              >
                <AuthInputControl
                  autoComplete="name"
                  aria-label={t("auth:FIELD_DISPLAY_NAME_LABEL")}
                  aria-invalid={form.formState.errors.displayName ? true : undefined}
                  className={AUTH_INPUT_GROUP_CLASS}
                  inputClassName={AUTH_INPUT_CLASS}
                  placeholder={t("auth:FIELD_DISPLAY_NAME_PLACEHOLDER")}
                  startIcon={<User size={16} />}
                  disabled={props.loading}
                  spellCheck={false}
                  {...form.register("displayName")}
                />
              </RegisterField>

              <RegisterField
                title={t("auth:FIELD_USERNAME_LABEL")}
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
                  className={AUTH_INPUT_GROUP_CLASS}
                  inputClassName={AUTH_INPUT_CLASS}
                  placeholder={t("auth:FIELD_USERNAME_PLACEHOLDER")}
                  startIcon={<User size={16} />}
                  endIcon={
                    usernameChecking ? <LoaderCircle className="size-4 animate-spin" /> : undefined
                  }
                  disabled={props.loading}
                  spellCheck={false}
                  {...form.register("username")}
                />
                {usernameFeedback ? (
                  <div
                    className={`flex items-center gap-2 text-footnote ${usernameFeedbackClassName}`}
                  >
                    {usernameFeedback.icon}
                    <span>{usernameFeedback.message}</span>
                  </div>
                ) : null}
              </RegisterField>

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
                  disabled={props.loading}
                  {...form.register("password")}
                />
                <PasswordRequirementChecklist
                  password={passwordValue}
                  active={Boolean(form.formState.dirtyFields.password) || passwordValue.length > 0}
                  t={t}
                />
              </RegisterField>
            </>
          ) : null}

          <motion.div variants={variants} className="grid gap-3 pt-1">
            <Button
              className="w-full"
              type="submit"
              size="lg"
              loading={step === "email" ? props.emailCheckLoading : props.loading}
              disabled={
                props.emailCheckLoading ||
                props.loading ||
                (step === "details" && (usernameChecking || usernameUnavailable))
              }
            >
              <AuthButtonLabel>
                {step === "email" ? t("auth:REGISTER_NEXT_BUTTON") : t("auth:REGISTER_BUTTON")}
              </AuthButtonLabel>
            </Button>
          </motion.div>
        </form>
        <motion.div variants={variants} className={AUTH_PANE_META_CLASS}>
          <div className="text-body text-label-secondary">
            <span>{t("auth:HAVE_ACCOUNT")} </span>
            <AuthLinkButton
              className="!px-1 !text-body font-normal"
              disabled={props.emailCheckLoading || props.loading}
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
  );
}
