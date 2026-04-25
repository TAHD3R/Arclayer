import { Mail } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { ApiError } from "@/lib/http";
import { notifySuccessText } from "@/lib/notifications";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { AuthOauthButtons } from "@/components/ui/oauth-buttons";
import { AuthLinkButton, AuthInputControl } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";

import type {
  LoginEmailCodeFormValues,
  LoginEmailCodePaneSeed,
  LoginEmailCodeRequestResult,
} from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_INPUT_GROUP_CLASS,
  AUTH_PANE_STACK_CLASS,
  AuthButtonLabel,
  AuthInlineNotice,
  AuthOtpInput,
  AuthPaneHeader,
  AuthPaneTitleRow,
} from "./auth-pane-primitives";

const OTP_LENGTH = 6;

type AutoRequestEntry = {
  promise: Promise<LoginEmailCodeRequestResult>;
  notified: boolean;
  settled: boolean;
  subscribers: number;
  cleanupQueued: boolean;
};

const autoRequestEntries = new Map<string, AutoRequestEntry>();

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

function getAutoRequestEntry(key: string, requestCode: () => Promise<LoginEmailCodeRequestResult>) {
  const existing = autoRequestEntries.get(key);
  if (existing) {
    existing.cleanupQueued = false;
    existing.subscribers += 1;
    return existing;
  }

  const entry: AutoRequestEntry = {
    promise: undefined as unknown as Promise<LoginEmailCodeRequestResult>,
    notified: false,
    settled: false,
    subscribers: 1,
    cleanupQueued: false,
  };
  entry.promise = Promise.resolve()
    .then(requestCode)
    .finally(() => {
      entry.settled = true;
      scheduleAutoRequestCleanup(key, entry);
    });
  autoRequestEntries.set(key, entry);
  return entry;
}

function scheduleAutoRequestCleanup(key: string, entry: AutoRequestEntry) {
  if (!entry.settled || entry.subscribers > 0 || entry.cleanupQueued) return;

  entry.cleanupQueued = true;
  queueMicrotask(() => {
    entry.cleanupQueued = false;
    if (autoRequestEntries.get(key) === entry && entry.settled && entry.subscribers === 0) {
      autoRequestEntries.delete(key);
    }
  });
}

function releaseAutoRequestEntry(key: string, entry: AutoRequestEntry) {
  entry.subscribers = Math.max(0, entry.subscribers - 1);
  scheduleAutoRequestCleanup(key, entry);
}

export function LoginEmailCodePane(props: LoginEmailCodePaneProps) {
  const { t } = useTranslation();
  const variants = props.reducedMotion ? {} : props.itemVariants;
  const [step, setStep] = useState<LoginEmailCodePaneStep>("request");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState(0);
  const [codeValue, setCodeValue] = useState("");
  const attemptedSeedRef = useRef<string | null>(null);
  const requestCodeRef = useRef(props.onRequestCode);
  const tRef = useRef(t);
  const seedEmail = props.seed?.email ?? "";
  const seedAutoRequest = Boolean(props.seed?.autoRequest);
  const seedKey = `${seedEmail}:${seedAutoRequest ? "auto" : "manual"}:${
    props.seed?.passwordLoginAvailable === false ? "passwordless" : "password"
  }`;
  const autoRequestKey = seedEmail.trim().toLowerCase();
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
      email: seedEmail,
      code: "",
    },
    mode: "onSubmit",
  });
  const { clearErrors, reset, setValue } = form;

  useEffect(() => {
    requestCodeRef.current = props.onRequestCode;
    tRef.current = t;
  }, [props.onRequestCode, t]);

  const handleCodeRequestSuccess = useCallback(
    (result: LoginEmailCodeRequestResult, options: { notify?: boolean } = {}) => {
      const normalized = normalizeRequestResult(result);
      setRequestError(null);
      setVerifyError(null);
      setStep("verify");
      setRetryAfter(normalized.retryAfter);
      clearErrors("code");
      setCodeValue("");
      setValue("code", "");
      if (options.notify ?? true) {
        notifySuccessText(t("auth:LOGIN_CODE_SENT"));
      }
    },
    [clearErrors, setValue, t],
  );
  const handleCodeRequestSuccessRef = useRef(handleCodeRequestSuccess);

  useEffect(() => {
    handleCodeRequestSuccessRef.current = handleCodeRequestSuccess;
  }, [handleCodeRequestSuccess]);

  useEffect(() => {
    reset({
      email: seedEmail,
      code: "",
    });
    setStep("request");
    setRequestError(null);
    setVerifyError(null);
    setRetryAfter(0);
    setCodeValue("");
    attemptedSeedRef.current = null;
  }, [seedEmail, seedKey]);

  useEffect(() => {
    if (!seedEmail || !seedAutoRequest || !autoRequestKey) return;
    if (attemptedSeedRef.current === autoRequestKey) return;
    attemptedSeedRef.current = autoRequestKey;

    let active = true;
    const entry = getAutoRequestEntry(autoRequestKey, () => requestCodeRef.current(seedEmail));
    void entry.promise
      .then((result) => {
        if (!active) return;
        const shouldNotify = !entry.notified;
        entry.notified = true;
        handleCodeRequestSuccessRef.current(result, { notify: shouldNotify });
      })
      .catch((error) => {
        if (!active) return;
        setStep("request");
        setRequestError(
          error instanceof ApiError
            ? error.message
            : tRef.current("auth:LOGIN_EMAIL_CODE_REQUEST_FAILED"),
        );
      });

    return () => {
      active = false;
      attemptedSeedRef.current = null;
      releaseAutoRequestEntry(autoRequestKey, entry);
    };
  }, [autoRequestKey, seedAutoRequest, seedEmail]);

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
      handleCodeRequestSuccess(await props.onRequestCode(form.getValues("email")));
    } catch (error) {
      setStep("request");
      setRequestError(
        error instanceof ApiError ? error.message : t("auth:LOGIN_EMAIL_CODE_REQUEST_FAILED"),
      );
    }
  };

  const submitVerification = async () => {
    const code = codeValue.trim();
    if (code.length !== OTP_LENGTH) {
      form.setError("code", { message: t("auth:LOGIN_EMAIL_CODE_REQUIRED") });
      return;
    }
    try {
      setVerifyError(null);
      await props.onSubmit({ email: form.getValues("email"), code });
    } catch (error) {
      setVerifyError(
        error instanceof ApiError ? error.message : t("auth:LOGIN_EMAIL_CODE_INVALID"),
      );
    }
  };
  const canSubmitVerification = codeValue.trim().length === OTP_LENGTH;

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
                <AuthOtpInput
                  value={codeValue}
                  onChange={(value) => {
                    setCodeValue(value);
                    form.setValue("code", value, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: false,
                    });
                    if (form.formState.errors.code) {
                      form.clearErrors("code");
                    }
                    if (verifyError) setVerifyError(null);
                  }}
                  aria-label={t("auth:LOGIN_EMAIL_CODE_FIELD_LABEL")}
                  invalid={Boolean(verifyError)}
                  disabled={props.verifyLoading}
                  maxLength={OTP_LENGTH}
                />
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
            disabled={step === "verify" ? !canSubmitVerification : undefined}
          >
            <AuthButtonLabel>
              {step === "request" ? t("auth:LOGIN_EMAIL_CODE_SEND_BUTTON") : t("auth:LOGIN_BUTTON")}
            </AuthButtonLabel>
          </Button>
        </motion.div>
        {step === "verify" ? (
          <motion.div variants={variants} className="grid gap-2 text-center text-footnote">
            <div className="text-label-secondary">
              <span>{t("auth:LOGIN_EMAIL_CODE_RESEND_PREFIX")} </span>
              <AuthLinkButton
                disabled={props.requestLoading || retryAfter > 0}
                onClick={() => void requestEmailCode()}
                type="button"
              >
                {retryAfter > 0
                  ? t("auth:LOGIN_EMAIL_CODE_RESEND_WAIT", {
                      countdown: formatCountdown(retryAfter),
                    })
                  : t("auth:LOGIN_EMAIL_CODE_RESEND_ACTION")}
              </AuthLinkButton>
            </div>
          </motion.div>
        ) : null}
      </form>
      {props.seed?.passwordLoginAvailable === false ? null : (
        <motion.div variants={variants} className="pt-1.5 empty:hidden">
          <AuthOauthButtons
            disabled={props.requestLoading || props.verifyLoading}
            showProviders={false}
            leadingActions={[
              {
                key: "password-login",
                label: t("auth:LOGIN_EMAIL_CODE_USE_PASSWORD"),
                onClick: () => props.onBackToPassword(form.getValues("email")),
              },
            ]}
          />
        </motion.div>
      )}
    </div>
  );
}
