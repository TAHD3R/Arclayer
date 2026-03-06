import { useEffect, useState } from "react";
import { Button, Input } from "antd";
import { motion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@celestial/ui/input-otp";

import type { AuthChallengeSnapshot } from "@/stores/use-auth-challenge-store";

import type { LoginTwoFactorFormValues } from "../types";

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

export function LoginTwoFactorPane({
  challenge,
  loading,
  onSubmit,
  onBackToLogin,
  reducedMotion,
  itemVariants,
}: LoginTwoFactorPaneProps) {
  const { t } = useTranslation();
  const v = reducedMotion ? {} : itemVariants;
  const [method, setMethod] = useState<VerificationMethod>("totp");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue("");
    setError(null);
  }, [method, challenge.twoFactorToken]);

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
    onSubmit(payload);
  };

  const primaryLabel =
    method === "backup_code"
      ? t("auth:TWO_FACTOR_BACKUP_CODE_LABEL")
      : t("auth:TWO_FACTOR_CODE_LABEL");

  return (
    <>
      <motion.div variants={v}>
        <h1 className="text-largetitle text-label-primary">{t("auth:LOGIN_TWO_FACTOR_TITLE")}</h1>
        <p className="mt-2 mb-8 text-title3 font-normal text-label-secondary">
          {t("auth:LOGIN_TWO_FACTOR_SUBTITLE")}
        </p>
      </motion.div>

      <motion.div variants={v} className="grid gap-4">
        <div className="grid gap-1.5">
          <span className="text-callout text-label-primary">{primaryLabel}</span>
          {method === "backup_code" ? (
            <Input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-label={t("auth:TWO_FACTOR_BACKUP_CODE_LABEL")}
              placeholder={t("auth:TWO_FACTOR_BACKUP_CODE_PLACEHOLDER")}
              size="large"
              variant="filled"
              autoComplete="one-time-code"
              disabled={loading}
            />
          ) : (
            <InputOTP
              value={value}
              onChange={setValue}
              maxLength={OTP_LENGTH}
              aria-label={t("auth:TWO_FACTOR_CODE_LABEL")}
              inputMode="numeric"
              disabled={loading}
              containerClassName="justify-start"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          )}
          {error ? <p className="text-footnote text-danger">{error}</p> : null}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="primary"
            size="large"
            loading={loading}
            onClick={handleSubmit}
            autoInsertSpace={false}
          >
            {t("auth:LOGIN_TWO_FACTOR_VERIFY_BUTTON")}
          </Button>
          <Button
            type="link"
            className="px-0! justify-start"
            onClick={() => setMethod((current) => (current === "totp" ? "backup_code" : "totp"))}
            autoInsertSpace={false}
          >
            {method === "totp"
              ? t("auth:TWO_FACTOR_USE_BACKUP_CODE")
              : t("auth:TWO_FACTOR_USE_AUTHENTICATOR")}
          </Button>
          <Button
            type="link"
            className="px-0! justify-start"
            onClick={onBackToLogin}
            autoInsertSpace={false}
          >
            {t("auth:TWO_FACTOR_BACK_TO_PASSWORD")}
          </Button>
        </div>
      </motion.div>
    </>
  );
}
