import { useRef, useState, type FormEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformMfaMethodReadinessOut,
  PlatformMfaWebAuthnCompleteRequest,
  PlatformTotpSetup,
} from "@arclayer/platform-openapi";

import {
  beginCurrentPlatformTotpMethod,
  beginCurrentPlatformWebauthnMethod,
  completeCurrentPlatformWebauthnMethod,
  confirmCurrentPlatformTotpMethod,
  PlatformAccessApiError,
  removeCurrentPlatformMfaMethod,
} from "@/access/access-api";
import { verifyPlatformAction } from "@/access/platform-step-up";
import { createPlatformSecurityKey } from "@/auth/webauthn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";

type DialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string) => void;
  userId: string;
}>;

type MutationAttempt = Readonly<{
  correlationId: string;
  fingerprint: string;
  idempotencyKey: string;
  stepUpProof?: string;
}>;

type WebAuthnRegistrationAttempt = MutationAttempt &
  Readonly<{ completeRequest?: PlatformMfaWebAuthnCompleteRequest }>;

function mutationAttempt(
  ref: RefObject<MutationAttempt | null>,
  fingerprint: string,
): MutationAttempt {
  if (!ref.current || ref.current.fingerprint !== fingerprint) {
    ref.current = {
      correlationId: crypto.randomUUID(),
      fingerprint,
      idempotencyKey: crypto.randomUUID(),
    };
  }
  return ref.current;
}

function errorKey(error: unknown): string {
  if (!(error instanceof PlatformAccessApiError)) return "ACTION_ERROR";
  if (error.message === "PLATFORM_WEBAUTHN_CANCELLED") return "SECURITY_KEY_CANCELLED";
  if (error.message === "PLATFORM_WEBAUTHN_UNAVAILABLE") return "SECURITY_KEY_UNAVAILABLE";
  if (error.status === 401 || error.status === 403) return "ACTION_PERMISSION_ERROR";
  if (error.status === 409) return "ACTION_CONFLICT_ERROR";
  if (error.status === 422) return "ACTION_VALIDATION_ERROR";
  return "ACTION_ERROR";
}

function MutationError({ messageKey }: Readonly<{ messageKey: string }>) {
  const { t } = useTranslation("access");
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("ACTION_FAILED")}</AlertTitle>
      <AlertDescription>{t(messageKey)}</AlertDescription>
    </Alert>
  );
}

async function mfaProof(
  userId: string,
  idempotencyKey: string,
  scope: Record<string, string | null>,
) {
  return verifyPlatformAction({
    actionCode: "platform.access.reset_operator_mfa",
    idempotencyKey,
    scope,
    targetId: userId,
    targetType: "platform_mfa_actor",
  });
}

export function AddAuthenticatorAppDialog(props: DialogProps) {
  const { t } = useTranslation("access");
  const [setup, setSetup] = useState<PlatformTotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const beginAttempt = useRef<MutationAttempt | null>(null);
  const confirmAttempt = useRef<MutationAttempt | null>(null);

  const begin = async () => {
    const accountLabel = t("AUTHENTICATOR_ACCOUNT_LABEL");
    const fingerprint = JSON.stringify([props.userId, "totp_enrollment", "Arclayer", accountLabel]);
    let attempt = mutationAttempt(beginAttempt, fingerprint);
    setPending(true);
    setError(null);
    try {
      if (!attempt.stepUpProof) {
        const stepUpProof = await mfaProof(props.userId, attempt.idempotencyKey, {
          operation: "totp_enrollment",
        });
        attempt = { ...attempt, stepUpProof };
        beginAttempt.current = attempt;
      }
      const stepUpProof = attempt.stepUpProof;
      if (!stepUpProof) throw new Error("PLATFORM_STEP_UP_PROOF_REQUIRED");
      const nextSetup = await beginCurrentPlatformTotpMethod({
        accountLabel,
        correlationId: attempt.correlationId,
        idempotencyKey: attempt.idempotencyKey,
        issuer: "Arclayer",
        stepUpProof,
      });
      if (beginAttempt.current === attempt) beginAttempt.current = null;
      setSetup(nextSetup);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedCode = code.replace(/\s+/gu, "");
    if (!setup || !normalizedCode) return;
    const fingerprint = JSON.stringify([props.userId, setup.methodId, normalizedCode, null]);
    let attempt = mutationAttempt(confirmAttempt, fingerprint);
    setPending(true);
    setError(null);
    try {
      if (!attempt.stepUpProof) {
        const stepUpProof = await mfaProof(props.userId, attempt.idempotencyKey, {
          operation: "totp_enrollment",
        });
        attempt = { ...attempt, stepUpProof };
        confirmAttempt.current = attempt;
      }
      const stepUpProof = attempt.stepUpProof;
      if (!stepUpProof) throw new Error("PLATFORM_STEP_UP_PROOF_REQUIRED");
      await confirmCurrentPlatformTotpMethod({
        code: normalizedCode,
        correlationId: attempt.correlationId,
        idempotencyKey: attempt.idempotencyKey,
        methodId: setup.methodId,
        replaceMethodId: null,
        stepUpProof,
      });
      if (confirmAttempt.current === attempt) confirmAttempt.current = null;
      props.onCompleted("AUTHENTICATOR_APP_ADDED");
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t("ADD_AUTHENTICATOR_APP")}
      description={t("ADD_AUTHENTICATOR_APP_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          {setup ? (
            <Button disabled={pending || !code.trim()} form="confirm-platform-totp" type="submit">
              {pending ? t("VERIFYING") : t("VERIFY_AND_ADD_METHOD")}
            </Button>
          ) : (
            <Button disabled={pending} onClick={begin}>
              {pending ? t("VERIFYING") : t("VERIFY_AND_START_SETUP")}
            </Button>
          )}
        </>
      }
    >
      {error ? <MutationError messageKey={error} /> : null}
      {setup ? (
        <form id="confirm-platform-totp" onSubmit={confirm}>
          <SettingDialogFields>
            <SettingDialogField
              title={t("AUTHENTICATOR_SETUP_KEY")}
              description={t("AUTHENTICATOR_SETUP_KEY_HELP")}
            >
              <code className="block break-all rounded-md border bg-muted p-3 text-sm">
                {setup.secret}
              </code>
            </SettingDialogField>
            <SettingDialogField
              title={<label htmlFor="platform-totp-code">{t("VERIFICATION_CODE")}</label>}
            >
              <Input
                autoComplete="one-time-code"
                id="platform-totp-code"
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </SettingDialogField>
          </SettingDialogFields>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">{t("SECURITY_KEY_REQUIRED")}</p>
      )}
    </SettingDialog>
  );
}

export function AddSecurityKeyDialog(props: DialogProps) {
  const { t } = useTranslation("access");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<WebAuthnRegistrationAttempt | null>(null);

  const add = async () => {
    const scope = { operation: "webauthn_enrollment", replace_method_id: null };
    let attempt: WebAuthnRegistrationAttempt = mutationAttempt(
      request,
      JSON.stringify([props.userId, scope]),
    );
    setPending(true);
    setError(null);
    try {
      if (!attempt.stepUpProof) {
        const stepUpProof = await mfaProof(props.userId, attempt.idempotencyKey, scope);
        attempt = { ...attempt, stepUpProof };
        request.current = attempt;
      }
      const stepUpProof = attempt.stepUpProof;
      if (!stepUpProof) throw new Error("PLATFORM_STEP_UP_PROOF_REQUIRED");
      if (!attempt.completeRequest) {
        const registration = await beginCurrentPlatformWebauthnMethod({
          correlationId: attempt.correlationId,
          idempotencyKey: attempt.idempotencyKey,
          replaceMethodId: null,
          stepUpProof,
        });
        const credential = await createPlatformSecurityKey(registration.options);
        attempt = {
          ...attempt,
          completeRequest: {
            challengeId: registration.options.challengeId,
            correlationId: attempt.correlationId,
            credential,
            idempotencyKey: attempt.idempotencyKey,
            replaceMethodId: null,
            stepUpProof,
          },
        };
        request.current = attempt;
      }
      const completeRequest = attempt.completeRequest;
      if (!completeRequest) throw new Error("PLATFORM_WEBAUTHN_COMPLETE_REQUEST_REQUIRED");
      await completeCurrentPlatformWebauthnMethod(completeRequest);
      if (request.current === attempt) request.current = null;
      props.onCompleted("SECURITY_KEY_ADDED");
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t("ADD_SECURITY_KEY")}
      description={t("ADD_SECURITY_KEY_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} onClick={add}>
            {pending ? t("VERIFYING") : t("VERIFY_AND_ADD_SECURITY_KEY")}
          </Button>
        </>
      }
    >
      {error ? <MutationError messageKey={error} /> : null}
      <p className="text-sm text-muted-foreground">{t("SECURITY_KEY_REQUIRED")}</p>
    </SettingDialog>
  );
}

type RemoveMethodDialogProps = DialogProps & Readonly<{ method: PlatformMfaMethodReadinessOut }>;

export function RemoveMfaMethodDialog(props: RemoveMethodDialogProps) {
  const { t } = useTranslation("access");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<MutationAttempt | null>(null);

  const remove = async () => {
    let attempt = mutationAttempt(request, JSON.stringify([props.userId, props.method.methodId]));
    setPending(true);
    setError(null);
    try {
      if (!attempt.stepUpProof) {
        const stepUpProof = await verifyPlatformAction({
          actionCode: "platform.access.reset_operator_mfa",
          idempotencyKey: attempt.idempotencyKey,
          scope: {},
          targetId: props.method.methodId,
          targetType: "platform_mfa_method",
        });
        attempt = { ...attempt, stepUpProof };
        request.current = attempt;
      }
      const stepUpProof = attempt.stepUpProof;
      if (!stepUpProof) throw new Error("PLATFORM_STEP_UP_PROOF_REQUIRED");
      await removeCurrentPlatformMfaMethod(props.method.methodId, {
        correlationId: attempt.correlationId,
        idempotencyKey: attempt.idempotencyKey,
        stepUpProof,
      });
      if (request.current === attempt) request.current = null;
      props.onCompleted("MFA_METHOD_REMOVED");
      props.onOpenChange(false);
    } catch (caught) {
      setError(errorKey(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t("REMOVE_MFA_METHOD_TITLE")}
      description={t("REMOVE_MFA_METHOD_DESCRIPTION", {
        method: props.method.label ?? t(`MFA_KIND_${props.method.kind.toUpperCase()}`),
      })}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} variant="destructive" onClick={remove}>
            {pending ? t("VERIFYING") : t("VERIFY_AND_REMOVE_METHOD")}
          </Button>
        </>
      }
    >
      {error ? <MutationError messageKey={error} /> : null}
      <p className="text-sm text-muted-foreground">{t("REMOVE_MFA_METHOD_CONSEQUENCE")}</p>
    </SettingDialog>
  );
}
