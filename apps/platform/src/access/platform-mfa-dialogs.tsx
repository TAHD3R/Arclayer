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
import { verifyPlatformAction, verifyPlatformTotpAction } from "@/access/platform-step-up";
import { createPlatformSecurityKey } from "@/auth/webauthn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";

type DialogProps = Readonly<{
  open: boolean;
  methods: readonly PlatformMfaMethodReadinessOut[];
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string) => void;
  replaceMethod?: PlatformMfaMethodReadinessOut | null;
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
  if (
    error.message === "PLATFORM_WEBAUTHN_NOT_CONFIGURED" ||
    error.message === "PLATFORM_WEBAUTHN_UNAVAILABLE"
  )
    return "SECURITY_KEY_UNAVAILABLE";
  if (error.message === "PLATFORM_WEBAUTHN_METHOD_REQUIRED")
    return "SECURITY_KEY_ACTION_SETUP_REQUIRED";
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

type VerificationChoice = "webauthn" | `totp:${string}`;

function defaultVerificationChoice(
  methods: readonly PlatformMfaMethodReadinessOut[],
): VerificationChoice {
  if (methods.some((method) => method.kind === "webauthn")) return "webauthn";
  const totp = methods.find((method) => method.kind === "totp");
  return totp ? `totp:${totp.methodId}` : "webauthn";
}

function actionCode(replaceMethod?: PlatformMfaMethodReadinessOut | null) {
  return replaceMethod?.kind === "webauthn"
    ? "platform.access.reset_operator_mfa"
    : "platform.access.manage_current_mfa";
}

function requiresAuthenticatorCode(action: string, choice: VerificationChoice) {
  return action === "platform.access.manage_current_mfa" && choice.startsWith("totp:");
}

async function mfaProof({
  action,
  choice,
  code,
  idempotencyKey,
  scope,
  userId,
}: Readonly<{
  action: string;
  choice: VerificationChoice;
  code: string;
  idempotencyKey: string;
  scope: Record<string, string | null>;
  userId: string;
}>) {
  const context = {
    actionCode: action,
    idempotencyKey,
    scope,
    targetId: userId,
    targetType: "platform_mfa_actor",
  };
  if (!requiresAuthenticatorCode(action, choice)) return verifyPlatformAction(context);
  return verifyPlatformTotpAction(context, choice.slice("totp:".length), code.replace(/\s+/gu, ""));
}

function CurrentVerificationFields({
  choice,
  code,
  idPrefix,
  methods,
  onChoiceChange,
  onCodeChange,
}: Readonly<{
  choice: VerificationChoice;
  code: string;
  idPrefix: string;
  methods: readonly PlatformMfaMethodReadinessOut[];
  onChoiceChange: (choice: VerificationChoice) => void;
  onCodeChange: (code: string) => void;
}>) {
  const { t } = useTranslation("access");
  const choices = [
    ...(methods.some((method) => method.kind === "webauthn")
      ? [{ label: t("SECURITY_KEY_OR_PASSKEY"), value: "webauthn" as const }]
      : []),
    ...methods
      .filter((method) => method.kind === "totp")
      .map((method) => ({
        label: method.label ?? t("AUTHENTICATOR_APP"),
        value: `totp:${method.methodId}` as const,
      })),
  ];
  return (
    <SettingDialogFields>
      <SettingDialogField
        title={t("CURRENT_VERIFICATION_TITLE")}
        description={t("CURRENT_VERIFICATION_DESCRIPTION")}
      >
        <Select
          value={choice}
          onValueChange={(value) => onChoiceChange(value as VerificationChoice)}
        >
          <SelectTrigger aria-label={t("VERIFICATION_METHOD")} id={`${idPrefix}-method`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingDialogField>
      {choice.startsWith("totp:") ? (
        <SettingDialogField
          title={<label htmlFor={`${idPrefix}-code`}>{t("CURRENT_VERIFICATION_CODE")}</label>}
          description={t("CURRENT_VERIFICATION_CODE_DESCRIPTION")}
        >
          <Input
            autoComplete="one-time-code"
            id={`${idPrefix}-code`}
            inputMode="numeric"
            value={code}
            onChange={(event) => onCodeChange(event.target.value)}
          />
        </SettingDialogField>
      ) : null}
    </SettingDialogFields>
  );
}

export function AddAuthenticatorAppDialog(props: DialogProps) {
  const { t } = useTranslation("access");
  const replacing = Boolean(props.replaceMethod);
  const action = actionCode(props.replaceMethod);
  const [setup, setSetup] = useState<PlatformTotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [verificationChoice, setVerificationChoice] = useState<VerificationChoice>(() =>
    defaultVerificationChoice(props.methods),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const beginAttempt = useRef<MutationAttempt | null>(null);
  const confirmAttempt = useRef<MutationAttempt | null>(null);

  const begin = async () => {
    const accountLabel = t("AUTHENTICATOR_ACCOUNT_LABEL");
    const fingerprint = JSON.stringify([
      props.userId,
      "totp_enrollment",
      "Arclayer",
      accountLabel,
      props.replaceMethod?.methodId ?? null,
    ]);
    let attempt = mutationAttempt(beginAttempt, fingerprint);
    setPending(true);
    setError(null);
    try {
      if (!attempt.stepUpProof) {
        const stepUpProof = await mfaProof({
          action,
          choice: verificationChoice,
          code: currentCode,
          idempotencyKey: attempt.idempotencyKey,
          scope: {
            operation: "totp_enrollment",
            replace_method_id: props.replaceMethod?.methodId ?? null,
          },
          userId: props.userId,
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
        replaceMethodId: props.replaceMethod?.methodId ?? null,
        stepUpProof,
      });
      if (beginAttempt.current === attempt) beginAttempt.current = null;
      setSetup(nextSetup);
      setCurrentCode("");
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
    const fingerprint = JSON.stringify([
      props.userId,
      setup.methodId,
      normalizedCode,
      props.replaceMethod?.methodId ?? null,
    ]);
    let attempt = mutationAttempt(confirmAttempt, fingerprint);
    setPending(true);
    setError(null);
    try {
      if (!attempt.stepUpProof) {
        const stepUpProof = await mfaProof({
          action,
          choice: verificationChoice,
          code: currentCode,
          idempotencyKey: attempt.idempotencyKey,
          scope: {
            operation: "totp_enrollment",
            replace_method_id: props.replaceMethod?.methodId ?? null,
          },
          userId: props.userId,
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
        replaceMethodId: props.replaceMethod?.methodId ?? null,
        stepUpProof,
      });
      if (confirmAttempt.current === attempt) confirmAttempt.current = null;
      props.onCompleted(replacing ? "AUTHENTICATOR_APP_REPLACED" : "AUTHENTICATOR_APP_ADDED");
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
      title={t(replacing ? "REPLACE_AUTHENTICATOR_APP" : "ADD_AUTHENTICATOR_APP")}
      description={t(
        replacing ? "REPLACE_AUTHENTICATOR_APP_DESCRIPTION" : "ADD_AUTHENTICATOR_APP_DESCRIPTION",
      )}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          {setup ? (
            <Button
              disabled={
                pending ||
                !code.trim() ||
                (requiresAuthenticatorCode(action, verificationChoice) && !currentCode.trim())
              }
              form="confirm-platform-totp"
              type="submit"
            >
              {pending
                ? t("VERIFYING")
                : t(replacing ? "VERIFY_AND_REPLACE_METHOD" : "VERIFY_AND_ADD_METHOD")}
            </Button>
          ) : (
            <Button
              disabled={
                pending ||
                (requiresAuthenticatorCode(action, verificationChoice) && !currentCode.trim())
              }
              onClick={begin}
            >
              {pending ? t("VERIFYING") : t("VERIFY_AND_START_SETUP")}
            </Button>
          )}
        </>
      }
    >
      {error ? <MutationError messageKey={error} /> : null}
      {action === "platform.access.reset_operator_mfa" ? (
        <p className="text-sm text-muted-foreground">{t("SECURITY_KEY_REQUIRED")}</p>
      ) : (
        <CurrentVerificationFields
          choice={verificationChoice}
          code={currentCode}
          idPrefix="platform-current-totp"
          methods={props.methods}
          onChoiceChange={(choice) => {
            setVerificationChoice(choice);
            setCurrentCode("");
          }}
          onCodeChange={setCurrentCode}
        />
      )}
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
      ) : null}
    </SettingDialog>
  );
}

export function AddSecurityKeyDialog(props: DialogProps) {
  const { t } = useTranslation("access");
  const replacing = Boolean(props.replaceMethod);
  const action = actionCode(props.replaceMethod);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCode, setCurrentCode] = useState("");
  const [verificationChoice, setVerificationChoice] = useState<VerificationChoice>(() =>
    defaultVerificationChoice(props.methods),
  );
  const request = useRef<WebAuthnRegistrationAttempt | null>(null);

  const add = async () => {
    const scope = {
      operation: "webauthn_enrollment",
      replace_method_id: props.replaceMethod?.methodId ?? null,
    };
    let attempt: WebAuthnRegistrationAttempt = mutationAttempt(
      request,
      JSON.stringify([props.userId, scope]),
    );
    setPending(true);
    setError(null);
    try {
      if (!attempt.stepUpProof) {
        const stepUpProof = await mfaProof({
          action,
          choice: verificationChoice,
          code: currentCode,
          idempotencyKey: attempt.idempotencyKey,
          scope,
          userId: props.userId,
        });
        attempt = { ...attempt, stepUpProof };
        request.current = attempt;
      }
      const stepUpProof = attempt.stepUpProof;
      if (!stepUpProof) throw new Error("PLATFORM_STEP_UP_PROOF_REQUIRED");
      if (!attempt.completeRequest) {
        const registration = await beginCurrentPlatformWebauthnMethod({
          correlationId: attempt.correlationId,
          idempotencyKey: attempt.idempotencyKey,
          replaceMethodId: props.replaceMethod?.methodId ?? null,
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
            replaceMethodId: props.replaceMethod?.methodId ?? null,
            stepUpProof,
          },
        };
        request.current = attempt;
      }
      const completeRequest = attempt.completeRequest;
      if (!completeRequest) throw new Error("PLATFORM_WEBAUTHN_COMPLETE_REQUEST_REQUIRED");
      await completeCurrentPlatformWebauthnMethod(completeRequest);
      if (request.current === attempt) request.current = null;
      props.onCompleted(replacing ? "SECURITY_KEY_REPLACED" : "SECURITY_KEY_ADDED");
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
      title={t(replacing ? "REPLACE_SECURITY_KEY" : "ADD_SECURITY_KEY")}
      description={t(
        replacing ? "REPLACE_SECURITY_KEY_DESCRIPTION" : "ADD_SECURITY_KEY_DESCRIPTION",
      )}
      footer={
        <>
          <Button disabled={pending} variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("CANCEL")}
          </Button>
          <Button
            disabled={
              pending ||
              (requiresAuthenticatorCode(action, verificationChoice) && !currentCode.trim())
            }
            onClick={add}
          >
            {pending
              ? t("VERIFYING")
              : t(replacing ? "VERIFY_AND_REPLACE_METHOD" : "VERIFY_AND_ADD_SECURITY_KEY")}
          </Button>
        </>
      }
    >
      {error ? <MutationError messageKey={error} /> : null}
      {action === "platform.access.reset_operator_mfa" ? (
        <p className="text-sm text-muted-foreground">{t("SECURITY_KEY_REQUIRED")}</p>
      ) : (
        <CurrentVerificationFields
          choice={verificationChoice}
          code={currentCode}
          idPrefix="platform-current-webauthn"
          methods={props.methods}
          onChoiceChange={(choice) => {
            setVerificationChoice(choice);
            setCurrentCode("");
          }}
          onCodeChange={setCurrentCode}
        />
      )}
    </SettingDialog>
  );
}

type RemoveMethodDialogProps = DialogProps & Readonly<{ method: PlatformMfaMethodReadinessOut }>;

export function RemoveMfaMethodDialog(props: RemoveMethodDialogProps) {
  const { t } = useTranslation("access");
  const action = actionCode(props.method);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCode, setCurrentCode] = useState("");
  const [verificationChoice, setVerificationChoice] = useState<VerificationChoice>(() =>
    defaultVerificationChoice(props.methods),
  );
  const request = useRef<MutationAttempt | null>(null);

  const remove = async () => {
    let attempt = mutationAttempt(request, JSON.stringify([props.userId, props.method.methodId]));
    setPending(true);
    setError(null);
    try {
      if (!attempt.stepUpProof) {
        const stepUpProof = await mfaProof({
          action,
          choice: verificationChoice,
          code: currentCode,
          idempotencyKey: attempt.idempotencyKey,
          scope: { method_id: props.method.methodId, operation: "remove_method" },
          userId: props.userId,
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
          <Button
            disabled={
              pending ||
              (requiresAuthenticatorCode(action, verificationChoice) && !currentCode.trim())
            }
            variant="destructive"
            onClick={remove}
          >
            {pending ? t("VERIFYING") : t("VERIFY_AND_REMOVE_METHOD")}
          </Button>
        </>
      }
    >
      {error ? <MutationError messageKey={error} /> : null}
      {action === "platform.access.reset_operator_mfa" ? null : (
        <CurrentVerificationFields
          choice={verificationChoice}
          code={currentCode}
          idPrefix="platform-current-remove"
          methods={props.methods}
          onChoiceChange={(choice) => {
            setVerificationChoice(choice);
            setCurrentCode("");
          }}
          onCodeChange={setCurrentCode}
        />
      )}
      <p className="text-sm text-muted-foreground">{t("REMOVE_MFA_METHOD_CONSEQUENCE")}</p>
    </SettingDialog>
  );
}
