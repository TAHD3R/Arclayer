import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
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
import {
  AuthenticatorSetup,
  ChallengeMethods,
  CredentialsFields,
  IdentityConfirmed,
  LoginError,
  LoginHeader,
  RecoveryCodes,
  SecurityMethod,
} from "@/components/platform-login-steps";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type {
  PlatformSessionIssuedOut,
  PlatformSignInOut,
  PlatformTotpSetupOut,
} from "@arclayer/platform-openapi";

export function PlatformLoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const { t } = useTranslation(["access", "errors"]);
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
    if (!notice) return;
    setError(
      new PlatformAuthApiError(
        notice === "expired" ? "PLATFORM_SESSION_EXPIRED" : "PLATFORM_SESSION_REVOKED",
      ),
    );
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

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!flow) {
      submitCredentials(event);
      return;
    }
    if (totpSetup || totpMethodId) submitCode(event);
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

  const title = recoveryCodes
    ? t("access:SAVE_RECOVERY_CODES")
    : totpSetup
      ? t("access:AUTHENTICATOR_APP")
      : flow?.state === "phishing_resistant_setup_required"
        ? t("access:SECURITY_KEY_OR_PASSKEY")
        : flow?.state === "mfa_setup_required"
          ? t("access:AUTHENTICATOR_APP")
          : flow
            ? t("access:PLATFORM_VERIFICATION_REQUIRED")
            : t("access:SIGN_IN_TITLE");
  const description = recoveryCodes
    ? t("access:RECOVERY_CODES_DESCRIPTION")
    : flow
      ? t("access:SECURITY_CHECK_DESCRIPTION")
      : t("access:SIGN_IN_DESCRIPTION");

  return (
    <div
      className={cn("flex flex-col gap-6", className)}
      data-slot="platform-login-form"
      {...props}
    >
      <form onSubmit={submitForm}>
        <FieldGroup>
          <LoginHeader description={description} title={title} />
          {flow && !recoveryCodes ? <IdentityConfirmed /> : null}
          {error ? <LoginError error={error} /> : null}
          {!flow ? (
            <CredentialsFields pending={pending} />
          ) : recoveryCodes ? (
            <RecoveryCodes
              codes={recoveryCodes}
              confirmed={codesSaved}
              onConfirmedChange={setCodesSaved}
              onContinue={() => void navigate({ to: "/" })}
            />
          ) : totpSetup ? (
            <AuthenticatorSetup setup={totpSetup} pending={pending} error={error} />
          ) : flow.state === "phishing_resistant_setup_required" ? (
            <SecurityMethod
              action={t("access:ADD_SECURITY_KEY_TO_CONTINUE")}
              description={t("access:SECURITY_KEY_SETUP_DESCRIPTION")}
              icon="security-key"
              onAction={() => useSecurityKey(true)}
              pending={pending}
              title={t("access:SECURITY_KEY_OR_PASSKEY")}
            />
          ) : flow.state === "mfa_setup_required" ? (
            <SecurityMethod
              action={t("access:SET_UP_AUTHENTICATOR_APP")}
              description={t("access:AUTHENTICATOR_APP_SETUP_REQUIRED")}
              icon="authenticator"
              onAction={startTotpSetup}
              pending={pending}
              title={t("access:AUTHENTICATOR_APP")}
            />
          ) : (
            <ChallengeMethods
              error={error}
              hasSecurityKey={Boolean(
                flow.methods?.some((method) => method.kind === "security_key_or_passkey"),
              )}
              hasTotp={Boolean(totpMethodId)}
              onSecurityKey={() => useSecurityKey(false)}
              pending={pending}
            />
          )}
          {flow && !recoveryCodes ? (
            <Field>
              <Button disabled={pending} onClick={resetFlow} type="button" variant="ghost">
                {t("access:START_SIGN_IN_AGAIN")}
              </Button>
            </Field>
          ) : null}
        </FieldGroup>
      </form>
    </div>
  );
}
