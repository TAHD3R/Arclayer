import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PlatformAuthApiError } from "@/auth/auth-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { PlatformTotpSetupOut } from "@arclayer/platform-openapi";

const ERROR_KEYS: Readonly<Record<string, string>> = {
  PLATFORM_ACCESS_REQUIRED: "PLATFORM_ACCESS_REQUIRED",
  PLATFORM_AUTH_FLOW_CONSUMED: "PLATFORM_AUTH_FLOW_INVALID",
  PLATFORM_AUTH_FLOW_EXPIRED: "PLATFORM_AUTH_FLOW_INVALID",
  PLATFORM_AUTH_FLOW_INVALID: "PLATFORM_AUTH_FLOW_INVALID",
  PLATFORM_IDENTITY_CHANGED: "PLATFORM_IDENTITY_CHANGED",
  PLATFORM_IDENTITY_UNAVAILABLE: "PLATFORM_ACCESS_REQUIRED",
  PLATFORM_INVALID_CREDENTIALS: "PLATFORM_INVALID_CREDENTIALS",
  PLATFORM_MFA_SETUP_STATE_CHANGED: "PLATFORM_AUTH_FLOW_INVALID",
  PLATFORM_NETWORK_ERROR: "PLATFORM_NETWORK_ERROR",
  PLATFORM_SESSION_EXPIRED: "PLATFORM_SESSION_EXPIRED",
  PLATFORM_SESSION_REVOKED: "PLATFORM_SESSION_REVOKED",
  PLATFORM_SECURITY_KEY_REQUIRED: "SECURITY_KEY_REQUIRED",
  PLATFORM_TOTP_CODE_INVALID: "PLATFORM_CODE_INVALID",
  PLATFORM_TOTP_CODE_REPLAY: "PLATFORM_CODE_INVALID",
  PLATFORM_WEBAUTHN_CANCELLED: "SECURITY_KEY_CANCELLED",
  PLATFORM_WEBAUTHN_CHALLENGE_EXPIRED: "PLATFORM_AUTH_FLOW_INVALID",
  PLATFORM_WEBAUTHN_CHALLENGE_USED_OR_INVALID: "PLATFORM_AUTH_FLOW_INVALID",
  PLATFORM_WEBAUTHN_NOT_CONFIGURED: "SECURITY_KEY_UNAVAILABLE",
  PLATFORM_WEBAUTHN_UNAVAILABLE: "SECURITY_KEY_UNAVAILABLE",
};

function errorKey(error: PlatformAuthApiError): string {
  return ERROR_KEYS[error.code] ?? "PLATFORM_AUTH_UNEXPECTED";
}

export function LoginHeader({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <FieldDescription>{description}</FieldDescription>
    </div>
  );
}

export function CredentialsFields({ pending }: Readonly<{ pending: boolean }>) {
  const { t } = useTranslation("access");
  const [passwordVisible, setPasswordVisible] = useState(false);
  return (
    <>
      <Field>
        <FieldLabel htmlFor="platform-identifier">{t("IDENTIFIER")}</FieldLabel>
        <Input
          autoComplete="username"
          disabled={pending}
          id="platform-identifier"
          maxLength={255}
          name="identifier"
          placeholder={t("IDENTIFIER_PLACEHOLDER")}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="platform-password">{t("PASSWORD")}</FieldLabel>
        <InputGroup data-disabled={pending ? true : undefined}>
          <InputGroupInput
            autoComplete="current-password"
            disabled={pending}
            id="platform-password"
            maxLength={128}
            name="password"
            placeholder={t("PASSWORD_PLACEHOLDER")}
            required
            type={passwordVisible ? "text" : "password"}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label={t(passwordVisible ? "HIDE_PASSWORD" : "SHOW_PASSWORD")}
              aria-pressed={passwordVisible}
              disabled={pending}
              onClick={() => setPasswordVisible((visible) => !visible)}
              size="icon-xs"
            >
              {passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <Field>
        <Button aria-busy={pending} disabled={pending} type="submit">
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
          {t(pending ? "SIGNING_IN" : "CONTINUE")}
        </Button>
      </Field>
    </>
  );
}

export function LoginError({ error }: Readonly<{ error: PlatformAuthApiError }>) {
  const { t } = useTranslation("errors");
  const key = errorKey(error);
  return (
    <Alert aria-live="polite" variant="destructive">
      <LockKeyhole aria-hidden="true" />
      <AlertTitle>{t(key)}</AlertTitle>
      <AlertDescription>{t(`${key}_RECOVERY`)}</AlertDescription>
    </Alert>
  );
}

export function IdentityConfirmed() {
  const { t } = useTranslation("access");
  return (
    <Alert>
      <CheckCircle2 aria-hidden="true" />
      <AlertTitle>{t("IDENTITY_CONFIRMED")}</AlertTitle>
      <AlertDescription>{t("PLATFORM_VERIFICATION_REQUIRED")}</AlertDescription>
    </Alert>
  );
}

export function SecurityMethod({
  action,
  description,
  icon,
  onAction,
  pending,
  title,
}: Readonly<{
  action: string;
  description: string;
  icon: "security-key" | "authenticator";
  onAction: () => void;
  pending: boolean;
  title: string;
}>) {
  const Icon = icon === "security-key" ? ShieldCheck : Smartphone;
  return (
    <>
      <Alert>
        <Icon aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
      <Field>
        <Button aria-busy={pending} disabled={pending} onClick={onAction} type="button">
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
          {action}
        </Button>
      </Field>
    </>
  );
}

export function AuthenticatorSetup({
  error,
  pending,
  setup,
}: Readonly<{
  error: PlatformAuthApiError | null;
  pending: boolean;
  setup: PlatformTotpSetupOut;
}>) {
  const { t } = useTranslation("access");
  return (
    <>
      <Field>
        <p className="text-sm leading-none font-medium">{t("AUTHENTICATOR_SETUP_KEY")}</p>
        <div className="rounded-md border bg-muted/50 p-4">
          <code className="block break-all text-sm font-medium">{setup.setup.secret}</code>
          <p className="mt-2 text-sm text-muted-foreground">{setup.setup.accountLabel}</p>
        </div>
        <FieldDescription>{t("AUTHENTICATOR_SETUP_DESCRIPTION")}</FieldDescription>
      </Field>
      <VerificationCodeField error={error} pending={pending} />
    </>
  );
}

export function ChallengeMethods({
  error,
  hasSecurityKey,
  hasTotp,
  onSecurityKey,
  pending,
}: Readonly<{
  error: PlatformAuthApiError | null;
  hasSecurityKey: boolean;
  hasTotp: boolean;
  onSecurityKey: () => void;
  pending: boolean;
}>) {
  const { t } = useTranslation("access");
  return (
    <>
      {hasSecurityKey ? (
        <Field>
          <Button
            aria-busy={pending}
            disabled={pending}
            onClick={onSecurityKey}
            type="button"
            variant="outline"
          >
            {pending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <KeyRound aria-hidden="true" />
            )}
            {t("USE_SECURITY_KEY_OR_PASSKEY")}
          </Button>
        </Field>
      ) : null}
      {hasSecurityKey && hasTotp ? <FieldSeparator>{t("OR_USE_CODE")}</FieldSeparator> : null}
      {hasTotp ? <VerificationCodeField error={error} pending={pending} /> : null}
    </>
  );
}

function VerificationCodeField({
  error,
  pending,
}: Readonly<{ error: PlatformAuthApiError | null; pending: boolean }>) {
  const { t } = useTranslation("access");
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="platform-verification-code">{t("VERIFICATION_CODE")}</FieldLabel>
      <Input
        aria-invalid={error ? true : undefined}
        autoComplete="one-time-code"
        disabled={pending}
        id="platform-verification-code"
        inputMode="numeric"
        maxLength={12}
        minLength={6}
        name="code"
        pattern="[0-9 ]*"
        required
      />
      <FieldDescription>{t("VERIFICATION_CODE_DESCRIPTION")}</FieldDescription>
      {error ? <FieldError>{t("VERIFICATION_CODE_RETRY")}</FieldError> : null}
      <Button aria-busy={pending} disabled={pending} type="submit">
        {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
        {t("VERIFY_AND_CONTINUE")}
      </Button>
    </Field>
  );
}

export function RecoveryCodes({
  codes,
  confirmed,
  onConfirmedChange,
  onContinue,
}: Readonly<{
  codes: ReadonlyArray<string>;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  onContinue: () => void;
}>) {
  const { t } = useTranslation("access");
  return (
    <>
      <Field>
        <ul
          aria-label={t("SAVE_RECOVERY_CODES")}
          className="grid gap-2 rounded-md border bg-muted/50 p-4 font-mono text-sm"
        >
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </Field>
      <Field orientation="horizontal">
        <Checkbox
          checked={confirmed}
          id="platform-recovery-codes-saved"
          onCheckedChange={(checked) => onConfirmedChange(checked === true)}
        />
        <FieldLabel htmlFor="platform-recovery-codes-saved">
          {t("RECOVERY_CODES_SAVED_CONFIRMATION")}
        </FieldLabel>
      </Field>
      <Field>
        <Button disabled={!confirmed} onClick={onContinue} type="button">
          {t("OPEN_PLATFORM_CONSOLE")}
        </Button>
      </Field>
    </>
  );
}
