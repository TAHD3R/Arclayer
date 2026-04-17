import { CheckCircle2, CircleAlert, LoaderCircle, Lock, Mail, User } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
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
import { AuthInputControl, AuthLinkButton, AuthPasswordControl } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

import type { BootstrapFormValues, BootstrapPaneProps } from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_INPUT_GROUP_CLASS,
  AUTH_PANE_META_CLASS,
  AUTH_PANE_STACK_CLASS,
  AuthButtonLabel,
  AuthInlineNotice,
  AuthPaneHeader,
  AuthPaneLegal,
  AuthPaneTitleRow,
} from "./auth-pane-primitives";

type BootstrapStep = "email" | "details";

function BootstrapField(props: {
  title: string;
  helpText?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <Field className={AUTH_FIELD_CLASS}>
      <FieldContent className="gap-2">
        <AuthPaneTitleRow title={props.title} helpText={props.helpText} />
        {props.children}
        <FieldError>{props.error}</FieldError>
      </FieldContent>
    </Field>
  );
}

export function BootstrapPane(props: BootstrapPaneProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<BootstrapStep>("email");
  const [emailExists, setEmailExists] = useState(false);
  const form = useForm<BootstrapFormValues>({
    resolver: zodResolver(
      z.object({
        displayName: z.string().min(1, t("auth:VALIDATION_DISPLAY_NAME_REQUIRED")),
        email: z
          .string()
          .min(1, t("auth:VALIDATION_EMAIL_REQUIRED"))
          .email(t("auth:VALIDATION_EMAIL_INVALID")),
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
      displayName: "",
      email: "",
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
    <div className={AUTH_PANE_STACK_CLASS}>
      <AuthPaneHeader
        titleKey="auth:INSTANCE_BOOTSTRAP_TITLE"
        subtitleKey="auth:INSTANCE_BOOTSTRAP_SUBTITLE"
        variants={{}}
      />
      {emailExists ? (
        <AuthInlineNotice tone="danger">
          {t("auth:INSTANCE_BOOTSTRAP_EMAIL_EXISTS")}
        </AuthInlineNotice>
      ) : null}
      <form onSubmit={handleSubmit} className="grid gap-2" autoComplete="on">
        <Field className={AUTH_FIELD_CLASS}>
          <FieldContent className="gap-2">
            <AuthPaneTitleRow
              title={t("auth:FIELD_EMAIL_LABEL")}
              action={
                step === "details" ? (
                  <AuthLinkButton
                    disabled={props.emailLoading || props.loading}
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
              disabled={props.emailLoading || props.loading || step === "details"}
              readOnly={step === "details"}
              spellCheck={false}
              {...form.register("email")}
            />
            <FieldError>{form.formState.errors.email?.message}</FieldError>
          </FieldContent>
        </Field>

        {step === "details" ? (
          <>
            <BootstrapField
              title={t("auth:FIELD_DISPLAY_NAME_LABEL")}
              helpText={t("auth:FIELD_DISPLAY_NAME_HELP")}
              error={form.formState.errors.displayName?.message}
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
            </BootstrapField>

            <BootstrapField
              title={t("auth:FIELD_USERNAME_LABEL")}
              helpText={t("auth:FIELD_USERNAME_HELP")}
              error={form.formState.errors.username?.message}
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
            </BootstrapField>

            <BootstrapField
              title={t("auth:FIELD_PASSWORD_LABEL")}
              error={form.formState.errors.password?.message}
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
            </BootstrapField>
          </>
        ) : null}

        <div className="grid gap-3 pt-1">
          <Button
            className="w-full"
            type="submit"
            size="lg"
            loading={step === "email" ? props.emailLoading : props.loading}
            disabled={
              props.emailLoading ||
              props.loading ||
              (step === "details" && (usernameChecking || usernameUnavailable))
            }
          >
            <AuthButtonLabel>
              {step === "email"
                ? t("auth:INSTANCE_BOOTSTRAP_NEXT_BUTTON")
                : t("auth:INSTANCE_BOOTSTRAP_BUTTON")}
            </AuthButtonLabel>
          </Button>
        </div>
      </form>
      <AuthPaneLegal i18nKey="auth:LEGAL_CONTINUE" variants={{}} className={AUTH_PANE_META_CLASS} />
    </div>
  );
}
