import { Lock, Mail } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { AuthOauthButtons } from "@/components/ui/oauth-buttons";
import { ApiError } from "@/lib/http";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { AuthLinkButton, AuthInputControl } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@arclayer/ui/input-otp";

import type {
  LoginEmailCodeFormValues,
  LoginEmailCodePaneSeed,
  LoginEmailCodeRequestResult,
} from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_INPUT_GROUP_CLASS,
  AUTH_OTP_GROUP_CLASS,
  AUTH_OTP_SLOT_CLASS,
  AUTH_PANE_STACK_CLASS,
  AuthButtonLabel,
  AuthInlineNotice,
  AuthPaneHeader,
  AuthPaneLegal,
  AuthPaneTitleRow,
} from "./auth-pane-primitives";

const OTP_LENGTH = 6;

type LoginEmailCodePaneStep = "request" | "verify";

type LoginEmailCodePaneProps = {
  seed?: LoginEmailCodePaneSeed | null;
  requestLoading: boolean;
  verifyLoading: boolean;
  onRequestCode: (email: string) => Promise<LoginEmailCodeRequestResult>;
  onSubmit: (values: LoginEmailCodeFormValues) => Promise<void>;
  onBackToPassword: (email?: string) => void;
  reducedMotion: boolean;
  itemVariants: Variants;
};

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function normalizeRequestResult(result: LoginEmailCodeRequestResult) {
  return {
    expiresIn: result.expiresIn ?? result.expires_in ?? 0,
    retryAfter: result.retryAfter ?? result.retry_after ?? 0,
  };
}

export function LoginEmailCodePane(props: LoginEmailCodePaneProps) {
  const { t } = useTranslation();
  const variants = props.reducedMotion ? {} : props.itemVariants;
  const [step, setStep] = useState<LoginEmailCodePaneStep>("request");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState(0);
  const attemptedSeedRef = useRef<string | null>(null);
  const form = useForm<LoginEmailCodeFormValues>({
    resolver: zodResolver(
      z.object({
        email: z
          .string()
          .min(1, t("auth:VALIDATION_EMAIL_REQUIRED"))
          .email(t("auth:VALIDATION_EMAIL_INVALID")),
        code: z
          .string()
          .trim()
          .min(OTP_LENGTH, t("auth:LOGIN_EMAIL_CODE_REQUIRED"))
          .max(OTP_LENGTH, t("auth:LOGIN_EMAIL_CODE_REQUIRED")),
      }),
    ),
    defaultValues: {
      email: props.seed?.email ?? "",
      code: "",
    },
    mode: "onSubmit",
  });

  useEffect(() => {
    form.reset({
      email: props.seed?.email ?? "",
      code: "",
    });
    setStep("request");
    setRequestError(null);
    setVerifyError(null);
    setRetryAfter(0);
    attemptedSeedRef.current = null;
  }, [form, props.seed]);

  useEffect(() => {
    if (!props.seed?.email || !props.seed.autoRequest) return;
    if (attemptedSeedRef.current === props.seed.email) return;
    attemptedSeedRef.current = props.seed.email;
    void (async () => {
      try {
        const result = normalizeRequestResult(await props.onRequestCode(props.seed!.email));
        setRequestError(null);
        setVerifyError(null);
        setStep("verify");
        setRetryAfter(result.retryAfter);
      } catch (error) {
        setStep("request");
        setRequestError(
          error instanceof ApiError ? error.message : t("auth:LOGIN_EMAIL_CODE_REQUEST_FAILED"),
        );
      }
    })();
  }, [props.onRequestCode, props.seed, t]);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setInterval(() => {
      setRetryAfter((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAfter]);

  const requestEmailCode = async () => {
    const isValid = await form.trigger("email");
    if (!isValid) return;
    try {
      const result = normalizeRequestResult(await props.onRequestCode(form.getValues("email")));
      setRequestError(null);
      setVerifyError(null);
      setStep("verify");
      setRetryAfter(result.retryAfter);
      form.clearErrors("code");
      form.setValue("code", "");
    } catch (error) {
      setStep("request");
      setRequestError(
        error instanceof ApiError ? error.message : t("auth:LOGIN_EMAIL_CODE_REQUEST_FAILED"),
      );
    }
  };

  const submitVerification = form.handleSubmit(async (values) => {
    try {
      setVerifyError(null);
      await props.onSubmit(values);
    } catch (error) {
      setVerifyError(
        error instanceof ApiError ? error.message : t("auth:LOGIN_EMAIL_CODE_INVALID"),
      );
    }
  });

  return (
    <div className={AUTH_PANE_STACK_CLASS}>
      <AuthPaneHeader
        titleKey={
          step === "verify" ? "auth:LOGIN_EMAIL_CODE_VERIFY_TITLE" : "auth:LOGIN_EMAIL_CODE_TITLE"
        }
        subtitleKey={
          step === "verify"
            ? "auth:LOGIN_EMAIL_CODE_VERIFY_SUBTITLE"
            : "auth:LOGIN_EMAIL_CODE_SUBTITLE"
        }
        variants={variants}
      />
      {step === "verify" ? (
        <AuthInlineNotice variants={variants}>
          {t("auth:LOGIN_EMAIL_CODE_SENT_HINT", { email: form.getValues("email") })}
        </AuthInlineNotice>
      ) : null}
      <form
        className="grid gap-4"
        autoComplete="on"
        onSubmit={(event) => {
          event.preventDefault();
          if (step === "request") {
            void requestEmailCode();
            return;
          }
          void submitVerification();
        }}
      >
        {step === "request" ? (
          <motion.div variants={variants}>
            <Field className={AUTH_FIELD_CLASS}>
              <FieldContent className="gap-2">
                <AuthPaneTitleRow title={t("auth:FIELD_EMAIL_LABEL")} />
                <AuthInputControl
                  autoComplete="email"
                  aria-label={t("auth:FIELD_EMAIL_LABEL")}
                  aria-invalid={form.formState.errors.email || requestError ? true : undefined}
                  className={AUTH_INPUT_GROUP_CLASS}
                  inputClassName={AUTH_INPUT_CLASS}
                  placeholder={t("auth:FIELD_EMAIL_PLACEHOLDER")}
                  startIcon={<Mail size={16} />}
                  disabled={props.requestLoading}
                  spellCheck={false}
                  {...form.register("email")}
                />
                <FieldError>
                  {form.formState.errors.email?.message
                    ? String(form.formState.errors.email.message)
                    : requestError}
                </FieldError>
              </FieldContent>
            </Field>
          </motion.div>
        ) : (
          <motion.div variants={variants}>
            <Field className={AUTH_FIELD_CLASS}>
              <FieldContent className="gap-2">
                <AuthPaneTitleRow title={t("auth:LOGIN_EMAIL_CODE_FIELD_LABEL")} />
                <InputOTP
                  value={form.watch("code")}
                  onChange={(value) => {
                    form.setValue("code", value, { shouldValidate: false });
                    if (form.formState.errors.code) {
                      form.clearErrors("code");
                    }
                    if (verifyError) setVerifyError(null);
                  }}
                  maxLength={OTP_LENGTH}
                  aria-label={t("auth:LOGIN_EMAIL_CODE_FIELD_LABEL")}
                  aria-invalid={verifyError ? true : undefined}
                  inputMode="numeric"
                  disabled={props.verifyLoading}
                  containerClassName="justify-start"
                >
                  <InputOTPGroup className={AUTH_OTP_GROUP_CLASS}>
                    <InputOTPSlot index={0} className={AUTH_OTP_SLOT_CLASS} />
                    <InputOTPSlot index={1} className={AUTH_OTP_SLOT_CLASS} />
                    <InputOTPSlot index={2} className={AUTH_OTP_SLOT_CLASS} />
                    <InputOTPSlot index={3} className={AUTH_OTP_SLOT_CLASS} />
                    <InputOTPSlot index={4} className={AUTH_OTP_SLOT_CLASS} />
                    <InputOTPSlot index={5} className={AUTH_OTP_SLOT_CLASS} />
                  </InputOTPGroup>
                </InputOTP>
                <FieldError>
                  {form.formState.errors.code?.message
                    ? String(form.formState.errors.code.message)
                    : verifyError}
                </FieldError>
              </FieldContent>
            </Field>
          </motion.div>
        )}

        <motion.div variants={variants} className="grid gap-3 pt-1">
          <Button
            className="w-full"
            type="submit"
            size="lg"
            loading={step === "request" ? props.requestLoading : props.verifyLoading}
          >
            <AuthButtonLabel>
              {step === "request" ? t("auth:LOGIN_EMAIL_CODE_SEND_BUTTON") : t("auth:LOGIN_BUTTON")}
            </AuthButtonLabel>
          </Button>
        </motion.div>
        {step === "verify" ? (
          <motion.div
            variants={variants}
            className="text-center text-footnote text-label-secondary"
          >
            <span>{t("auth:LOGIN_EMAIL_CODE_RESEND_PREFIX")} </span>
            <AuthLinkButton
              disabled={props.requestLoading || retryAfter > 0}
              onClick={() => void requestEmailCode()}
              type="button"
            >
              {retryAfter > 0
                ? t("auth:LOGIN_EMAIL_CODE_RESEND_WAIT", { countdown: formatCountdown(retryAfter) })
                : t("auth:LOGIN_EMAIL_CODE_RESEND_ACTION")}
            </AuthLinkButton>
          </motion.div>
        ) : null}
        <motion.div variants={variants} className="pt-1.5 empty:hidden">
          <AuthOauthButtons
            disabled={props.requestLoading || props.verifyLoading}
            leadingActions={[
              {
                key: "password-login",
                label: t("auth:LOGIN_EMAIL_CODE_USE_PASSWORD"),
                icon: <Lock size={14} />,
                onClick: () => props.onBackToPassword(form.getValues("email")),
              },
            ]}
          />
        </motion.div>
        <AuthPaneLegal i18nKey="auth:LEGAL_LOGIN" variants={variants} />
      </form>
    </div>
  );
}
