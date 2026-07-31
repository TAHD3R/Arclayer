import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, KeyRound, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  beginAuthenticatorAppSetup,
  beginSecurityKeyChallenge,
  beginSecurityKeySetup,
  completeAuthenticatorAppChallenge,
  completeSecurityKeyChallenge,
  completeSecurityKeySetup,
  confirmAuthenticatorAppSetup,
  signInToPlatform,
  toPlatformAuthError,
  PlatformAuthApiError,
} from "@/auth/auth-api";
import { usePlatformAuth } from "@/auth/platform-auth";
import { consumePlatformSessionNotice } from "@/auth/platform-session";
import { createPlatformSecurityKey, getPlatformSecurityKey } from "@/auth/webauthn";
import { LocaleMenu, ProductApplicationLink, ThemeMenu } from "@/components/platform-utilities";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";
import type {
  PlatformSessionIssuedOut,
  PlatformSignInOut,
  PlatformTotpSetupOut,
} from "@arclayer/platform-openapi";

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

export function PlatformSignInPage() {
  const { t } = useTranslation(["common", "access", "errors"]);
  const navigate = useNavigate();
  const { establishSession } = usePlatformAuth();
  const [flow, setFlow] = useState<PlatformSignInOut | null>(null);
  const [totpSetup, setTotpSetup] = useState<PlatformTotpSetupOut | null>(null);
  const [totpMethodId, setTotpMethodId] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<ReadonlyArray<string> | null>(null);
  const [codesSaved, setCodesSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlatformAuthApiError | null>(null);

  useEffect(() => {
    const notice = consumePlatformSessionNotice();
    if (notice) {
      setError(
        new PlatformAuthApiError(
          notice === "expired" ? "PLATFORM_SESSION_EXPIRED" : "PLATFORM_SESSION_REVOKED",
        ),
      );
    }
  }, []);

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(toPlatformAuthError(caught));
    } finally {
      setPending(false);
    }
  };

  const finish = async (issued: PlatformSessionIssuedOut) => {
    establishSession(issued);
    const codes = issued.recoveryCodes?.codes;
    if (codes?.length) {
      setRecoveryCodes(codes);
      return;
    }
    await navigate({ to: "/" });
  };

  const submitCredentials = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(async () => {
      const nextFlow = await signInToPlatform(
        String(data.get("identifier") ?? ""),
        String(data.get("password") ?? ""),
      );
      if (nextFlow.state === "authenticated") throw new Error("Unexpected direct authentication");
      setFlow(nextFlow);
      setTotpMethodId(
        nextFlow.methods?.find((method) => method.kind === "authenticator_app")?.methodId ?? null,
      );
    });
  };

  const submitCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!flow) return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s+/gu, "");
    void run(async () => {
      if (totpSetup) {
        await finish(
          await confirmAuthenticatorAppSetup(flow.flowToken, totpSetup.setup.methodId, code),
        );
        return;
      }
      if (!totpMethodId) throw new Error("Authenticator-app method is missing");
      await finish(await completeAuthenticatorAppChallenge(flow.flowToken, totpMethodId, code));
    });
  };

  const useSecurityKey = (setup: boolean) => {
    if (!flow) return;
    void run(async () => {
      if (setup) {
        const started = await beginSecurityKeySetup(flow.flowToken);
        const credential = await createPlatformSecurityKey(started.options);
        await finish(
          await completeSecurityKeySetup(flow.flowToken, started.options.challengeId, credential),
        );
        return;
      }
      const started = await beginSecurityKeyChallenge(flow.flowToken);
      const credential = await getPlatformSecurityKey(started.options);
      await finish(
        await completeSecurityKeyChallenge(flow.flowToken, started.options.challengeId, credential),
      );
    });
  };

  const startTotpSetup = () => {
    if (!flow) return;
    void run(async () => setTotpSetup(await beginAuthenticatorAppSetup(flow.flowToken)));
  };

  const resetFlow = () => {
    setFlow(null);
    setTotpSetup(null);
    setTotpMethodId(null);
    setRecoveryCodes(null);
    setCodesSaved(false);
    setError(null);
  };

  return (
    <main className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 items-center justify-end gap-1 px-4 md:px-6">
        <ProductApplicationLink />
        <LocaleMenu />
        <ThemeMenu />
      </header>
      <section className="mx-auto flex w-full max-w-md flex-1 items-center px-5 py-10 md:px-0">
        <div className="w-full space-y-6">
          <div className="space-y-4 text-center">
            <img alt="" aria-hidden="true" className="mx-auto size-11" src="/logo.svg" />
            <div className="space-y-2">
              <h1 className="text-largetitle">{t("access:SIGN_IN_TITLE")}</h1>
              <p className="text-body text-label-secondary">{t("access:SIGN_IN_DESCRIPTION")}</p>
            </div>
          </div>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-title3">
                {recoveryCodes
                  ? t("access:SAVE_RECOVERY_CODES")
                  : flow
                    ? t("access:PLATFORM_VERIFICATION_REQUIRED")
                    : t("access:IDENTIFY_YOURSELF")}
              </CardTitle>
              <CardDescription>
                {recoveryCodes
                  ? t("access:RECOVERY_CODES_DESCRIPTION")
                  : flow
                    ? t("access:IDENTITY_CONFIRMED")
                    : t("access:CREDENTIALS_DESCRIPTION")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {flow && !recoveryCodes ? (
                <Alert className="border-positive/30 bg-positive/5">
                  <CheckCircle2 aria-hidden="true" />
                  <AlertTitle>{t("access:IDENTITY_CONFIRMED")}</AlertTitle>
                  <AlertDescription>{t("access:PLATFORM_VERIFICATION_REQUIRED")}</AlertDescription>
                </Alert>
              ) : null}
              {error ? (
                <Alert variant="destructive" aria-live="polite">
                  <LockKeyhole aria-hidden="true" />
                  <AlertTitle>{t(`errors:${errorKey(error)}`)}</AlertTitle>
                  <AlertDescription>{t(`errors:${errorKey(error)}_RECOVERY`)}</AlertDescription>
                </Alert>
              ) : null}
              {!flow ? (
                <form onSubmit={submitCredentials}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="platform-identifier">
                        {t("access:IDENTIFIER")}
                      </FieldLabel>
                      <Input
                        autoComplete="username"
                        id="platform-identifier"
                        maxLength={255}
                        name="identifier"
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="platform-password">{t("access:PASSWORD")}</FieldLabel>
                      <Input
                        autoComplete="current-password"
                        id="platform-password"
                        maxLength={128}
                        name="password"
                        required
                        type="password"
                      />
                    </Field>
                    <Button className="w-full" loading={pending} type="submit">
                      {t("access:CONTINUE")}
                    </Button>
                  </FieldGroup>
                </form>
              ) : recoveryCodes ? (
                <div className="space-y-5">
                  <ul className="grid gap-2 rounded-lg border bg-muted p-4 font-mono text-callout">
                    {recoveryCodes.map((code) => (
                      <li key={code}>{code}</li>
                    ))}
                  </ul>
                  <label className="flex items-start gap-3 text-footnote">
                    <input
                      checked={codesSaved}
                      className="mt-0.5 size-4"
                      onChange={(event) => setCodesSaved(event.currentTarget.checked)}
                      type="checkbox"
                    />
                    <span>{t("access:RECOVERY_CODES_SAVED_CONFIRMATION")}</span>
                  </label>
                  <Button
                    className="w-full"
                    disabled={!codesSaved}
                    onClick={() => void navigate({ to: "/" })}
                  >
                    {t("access:OPEN_PLATFORM_CONSOLE")}
                  </Button>
                </div>
              ) : totpSetup ? (
                <form className="space-y-5" onSubmit={submitCode}>
                  <div className="space-y-2 rounded-lg border bg-muted p-4">
                    <p className="text-footnote font-semibold">{t("access:AUTHENTICATOR_APP")}</p>
                    <p className="text-footnote text-label-secondary">
                      {t("access:AUTHENTICATOR_SETUP_DESCRIPTION")}
                    </p>
                    <code className="block break-all rounded-md bg-background p-3 text-callout">
                      {totpSetup.setup.secret}
                    </code>
                    <p className="text-caption text-label-secondary">
                      {totpSetup.setup.accountLabel}
                    </p>
                  </div>
                  <VerificationCodeField error={error} pending={pending} />
                </form>
              ) : flow.state === "phishing_resistant_setup_required" ? (
                <div className="space-y-4">
                  <MethodIntroduction
                    description={t("access:SECURITY_KEY_SETUP_DESCRIPTION")}
                    icon={<ShieldCheck aria-hidden="true" />}
                    title={t("access:SECURITY_KEY_OR_PASSKEY")}
                  />
                  <Button className="w-full" loading={pending} onClick={() => useSecurityKey(true)}>
                    {t("access:ADD_SECURITY_KEY_TO_CONTINUE")}
                  </Button>
                </div>
              ) : flow.state === "mfa_setup_required" ? (
                <div className="space-y-4">
                  <MethodIntroduction
                    description={t("access:AUTHENTICATOR_APP_SETUP_REQUIRED")}
                    icon={<Smartphone aria-hidden="true" />}
                    title={t("access:AUTHENTICATOR_APP")}
                  />
                  <Button className="w-full" loading={pending} onClick={startTotpSetup}>
                    {t("access:SET_UP_AUTHENTICATOR_APP")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  {flow.methods?.some((method) => method.kind === "security_key_or_passkey") ? (
                    <Button
                      className="w-full"
                      loading={pending}
                      onClick={() => useSecurityKey(false)}
                    >
                      <KeyRound aria-hidden="true" />
                      {t("access:USE_SECURITY_KEY_OR_PASSKEY")}
                    </Button>
                  ) : null}
                  {totpMethodId ? (
                    <form className="space-y-4" onSubmit={submitCode}>
                      <VerificationCodeField error={error} pending={pending} />
                    </form>
                  ) : null}
                </div>
              )}
              {flow && !recoveryCodes ? (
                <Button className="w-full" onClick={resetFlow} type="button" variant="ghost">
                  {t("access:START_SIGN_IN_AGAIN")}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

function MethodIntroduction({
  description,
  icon,
  title,
}: Readonly<{ description: string; icon: ReactNode; title: string }>) {
  return (
    <div className="flex gap-3 rounded-lg border p-4">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="space-y-1">
        <p className="text-footnote font-semibold">{title}</p>
        <p className="text-footnote text-label-secondary">{description}</p>
      </div>
    </div>
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
      <Button className="mt-2 w-full" loading={pending} type="submit">
        {t("VERIFY_AND_CONTINUE")}
      </Button>
    </Field>
  );
}
