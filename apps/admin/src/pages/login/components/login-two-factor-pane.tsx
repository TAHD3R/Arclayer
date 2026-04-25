import { Lock, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Field, FieldContent, FieldError } from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";
import { AuthLinkButton } from "@arclayer/ui/auth-controls";
import { Separator } from "@arclayer/ui/separator";

import type { AuthChallengeSnapshot } from "@/stores/use-auth-challenge-store";

import type { LoginTwoFactorFormValues } from "../types";
import {
  AUTH_FIELD_CLASS,
  AUTH_PANE_STACK_CLASS,
  AUTH_PLAIN_INPUT_CLASS,
  AuthOtpInput,
  AuthPaneHeader,
  AuthPaneTitleRow,
} from "./auth-pane-primitives";

const OTP_LENGTH = 6;

type VerificationMethod = "totp" | "backup_code";

type LoginTwoFactorPaneProps = {
  challenge: AuthChallengeSnapshot;
  loading: boolean;
  onSubmit: (values: LoginTwoFactorFormValues) => void;
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

  useEffect(() => {
    setValue("");
    setError(null);
  }, [method, props.challenge.twoFactorToken]);

  const handleSubmit = () => {
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
    props.onSubmit(payload);
  };

  const primaryLabel =
    method === "backup_code"
      ? t("auth:TWO_FACTOR_BACKUP_CODE_LABEL")
      : t("auth:TWO_FACTOR_CODE_LABEL");
  const methodSwitchLabel =
    method === "totp"
      ? t("auth:TWO_FACTOR_USE_BACKUP_CODE")
      : t("auth:TWO_FACTOR_USE_AUTHENTICATOR");
  const backToLoginLabel =
    props.challenge.source === "email-code"
      ? t("auth:TWO_FACTOR_BACK_TO_EMAIL_CODE")
      : t("auth:TWO_FACTOR_BACK_TO_PASSWORD");
  const backToLoginIcon =
    props.challenge.source === "email-code" ? (
      <Mail className="size-4" />
    ) : (
      <Lock className="size-4" />
    );

  return (
    <div className={AUTH_PANE_STACK_CLASS}>
      <AuthPaneHeader
        titleKey="auth:LOGIN_TWO_FACTOR_TITLE"
        subtitleKey="auth:LOGIN_TWO_FACTOR_SUBTITLE"
        variants={variants}
      />

      <form
        className="grid gap-4"
        autoComplete="on"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <motion.div variants={variants}>
          <Field className={AUTH_FIELD_CLASS}>
            <FieldContent className="gap-2.5">
              <AuthPaneTitleRow
                title={primaryLabel}
                action={
                  <AuthLinkButton
                    className="shrink-0"
                    onClick={() =>
                      setMethod((current) => (current === "totp" ? "backup_code" : "totp"))
                    }
                    type="button"
                  >
                    {methodSwitchLabel}
                  </AuthLinkButton>
                }
              />
              {method === "backup_code" ? (
                <Input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  aria-label={t("auth:TWO_FACTOR_BACKUP_CODE_LABEL")}
                  aria-invalid={error ? true : undefined}
                  className={AUTH_PLAIN_INPUT_CLASS}
                  placeholder={t("auth:TWO_FACTOR_BACKUP_CODE_PLACEHOLDER")}
                  autoComplete="one-time-code"
                  disabled={props.loading}
                  spellCheck={false}
                />
              ) : (
                <AuthOtpInput
                  value={value}
                  onChange={setValue}
                  aria-label={t("auth:TWO_FACTOR_CODE_LABEL")}
                  invalid={Boolean(error)}
                  disabled={props.loading}
                  maxLength={OTP_LENGTH}
                />
              )}
              <FieldError>{error}</FieldError>
            </FieldContent>
          </Field>
        </motion.div>

        <motion.div variants={variants} className="grid gap-3">
          <Button type="submit" size="lg" loading={props.loading}>
            {t("auth:LOGIN_TWO_FACTOR_VERIFY_BUTTON")}
          </Button>
          <div className="grid gap-2.5 pt-1.5">
            <div className="flex items-center gap-3 py-1 text-footnote text-label-secondary">
              <Separator className="flex-1" />
              <span className="shrink-0">{t("auth:OAUTH_ACCOUNT_DIVIDER")}</span>
              <Separator className="flex-1" />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={props.loading}
              className="h-10 w-full justify-center rounded-md border-border/80 bg-card/80 px-4 transition-colors hover:bg-accent/35"
              onClick={props.onBackToLogin}
            >
              <span className="inline-flex shrink-0 items-center justify-center self-center">
                {backToLoginIcon}
              </span>
              <span className="inline-flex min-w-0 items-center justify-center truncate text-center">
                {backToLoginLabel}
              </span>
            </Button>
          </div>
        </motion.div>
      </form>
    </div>
  );
}
