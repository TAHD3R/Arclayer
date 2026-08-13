import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";

import { resolveAuthFormError } from "@/lib/auth/form-feedback";
import { ApiError } from "@/lib/http";
import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";
import { AuthLinkButton } from "@arclayer/ui/auth-controls";

import type { AuthChallengeSnapshot } from "@/stores/use-auth-challenge-store";

import type { LoginTwoFactorFormValues } from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_PANE_ROOT_CLASS,
  AUTH_PILL_BUTTON_CLASS,
  AUTH_PILL_OUTLINE_BUTTON_CLASS,
  AUTH_PILL_PLAIN_INPUT_CLASS,
  AuthFormFeedback,
  AuthOtpInput,
  AuthPaneLegal,
} from "./auth-pane-primitives";
import { AuthEntryHeader } from "./login-brand-slogan";

const OTP_LENGTH = 6;

type VerificationMethod = "totp" | "backup_code";

type LoginTwoFactorPaneProps = {
  challenge: AuthChallengeSnapshot;
  loading: boolean;
  onSubmit: (values: LoginTwoFactorFormValues) => Promise<void>;
  onPasskeySubmit?: () => void;
  onBackToLogin: () => void;
  reducedMotion: boolean;
  itemVariants: Variants;
};

function buildSubmitPayload(
  method: VerificationMethod,
  rawValue: string,
): LoginTwoFactorFormValues | null {
  const value = rawValue.trim();
  if (!value) return null;
  if (method === "backup_code") return { backupCode: value };
  return { code: value };
}

export function LoginTwoFactorPane(props: LoginTwoFactorPaneProps) {
  const { t } = useTranslation();
  const variants = props.reducedMotion ? {} : props.itemVariants;
  const [method, setMethod] = useState<VerificationMethod>("totp");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const methods = props.challenge.methods?.length
    ? props.challenge.methods
    : ["totp", "backup_code"];
  const allowTotp = methods.includes("totp");
  const allowBackupCode = methods.includes("backup_code");
  const allowWebAuthn = methods.includes("webauthn");

  useEffect(() => {
    setValue("");
    setError(null);
    setSubmitError(null);
  }, [method, props.challenge.twoFactorToken]);

  const handleSubmit = async () => {
    const payload = buildSubmitPayload(method, value);
    if (!payload) {
      setError(
        method === "backup_code"
          ? t("auth:VALIDATION_TWO_FACTOR_BACKUP_CODE_REQUIRED")
          : t("auth:VALIDATION_TWO_FACTOR_CODE_REQUIRED"),
      );
      return;
    }

    setError(null);
    setSubmitError(null);
    try {
      await props.onSubmit(payload);
    } catch (submitFailure) {
      if (
        submitFailure instanceof ApiError &&
        (submitFailure.error === "TWO_FACTOR_CODE_INVALID" ||
          submitFailure.error === "BACKUP_CODE_INVALID")
      ) {
        setError(resolveAuthFormError(submitFailure, t("errors:INVALID_CREDENTIALS")));
        return;
      }
      setSubmitError(resolveAuthFormError(submitFailure, t("errors:REQUEST_FAILED")));
    }
  };

  const methodSwitchLabel =
    method === "totp"
      ? t("auth:TWO_FACTOR_USE_BACKUP_CODE")
      : t("auth:TWO_FACTOR_USE_AUTHENTICATOR");
  const backToLoginLabel =
    props.challenge.source === "email-code"
      ? t("auth:TWO_FACTOR_BACK_TO_EMAIL_CODE")
      : t("auth:TWO_FACTOR_BACK_TO_PASSWORD");
  return (
    <div className={AUTH_PANE_ROOT_CLASS}>
      <AuthEntryHeader subtitleKey="auth:LOGIN_TWO_FACTOR_SUBTITLE" variants={variants} />
      <form
        className="grid gap-4"
        autoComplete="on"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <AuthFormFeedback message={submitError} variants={variants} />
        <motion.div variants={variants}>
          <Field className={AUTH_FIELD_CLASS}>
            <FieldContent className="gap-2">
              {method === "backup_code" ? (
                <Input
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setError(null);
                    setSubmitError(null);
                  }}
                  aria-label={t("auth:TWO_FACTOR_BACKUP_CODE_LABEL")}
                  aria-invalid={error ? true : undefined}
                  className={AUTH_PILL_PLAIN_INPUT_CLASS}
                  placeholder={t("auth:TWO_FACTOR_BACKUP_CODE_PLACEHOLDER")}
                  autoComplete="one-time-code"
                  disabled={props.loading}
                  spellCheck={false}
                />
              ) : (
                <AuthOtpInput
                  value={value}
                  onChange={(nextValue) => {
                    setValue(nextValue);
                    setError(null);
                    setSubmitError(null);
                  }}
                  aria-label={t("auth:TWO_FACTOR_CODE_LABEL")}
                  invalid={Boolean(error)}
                  disabled={props.loading}
                  maxLength={OTP_LENGTH}
                />
              )}
              <FieldError>{error}</FieldError>
              {allowTotp && allowBackupCode ? (
                <div className="flex justify-end px-1">
                  <AuthLinkButton
                    onClick={() =>
                      setMethod((current) => (current === "totp" ? "backup_code" : "totp"))
                    }
                    type="button"
                  >
                    {methodSwitchLabel}
                  </AuthLinkButton>
                </div>
              ) : null}
            </FieldContent>
          </Field>
        </motion.div>

        <motion.div variants={variants} className="grid gap-4">
          <Button
            className={AUTH_PILL_BUTTON_CLASS}
            type="submit"
            size="lg"
            loading={props.loading}
          >
            {t("auth:LOGIN_TWO_FACTOR_VERIFY_BUTTON")}
          </Button>
          {allowWebAuthn ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              className={AUTH_PILL_OUTLINE_BUTTON_CLASS}
              disabled={props.loading}
              onClick={() => props.onPasskeySubmit?.()}
            >
              <KeyRound className="size-4" />
              {t("account:ME_SECURITY_ACTION_USE_PASSKEY")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={props.loading}
            className={AUTH_PILL_OUTLINE_BUTTON_CLASS}
            onClick={props.onBackToLogin}
          >
            {backToLoginLabel}
          </Button>
        </motion.div>
      </form>
      <AuthPaneLegal i18nKey="auth:LEGAL_CONTINUE" variants={variants} />
    </div>
  );
}
