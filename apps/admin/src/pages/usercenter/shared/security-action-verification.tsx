import { useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { verifyProductPasskey } from "@/lib/auth/webauthn";
import { notifyError } from "@/lib/notifications";
import { AuthOtpInput, AuthPaneTitleRow } from "@/pages/login/components/auth-pane-primitives";
import { AuthLinkButton } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField } from "@arclayer/ui/setting-dialog-field";

type VerificationMethod = "totp" | "backup_code" | "webauthn";

type PendingVerification = {
  action: authApi.SecurityAction;
  methods: VerificationMethod[];
};

type VerificationDialogProps = {
  request: PendingVerification | null;
  onCancel: () => void;
  onVerified: (proof: string) => void;
};

function normalizeMethods(methods: string[] | undefined): VerificationMethod[] {
  return (methods ?? []).filter(
    (method): method is VerificationMethod =>
      method === "totp" || method === "backup_code" || method === "webauthn",
  );
}

function SecurityActionVerificationDialog(props: VerificationDialogProps) {
  const { t } = useTranslation(["account", "auth", "common"]);
  const methods = props.request?.methods ?? [];
  const [method, setMethod] = useState<VerificationMethod>("totp");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const activeMethod = methods.includes(method) ? method : (methods[0] ?? "totp");

  const close = () => {
    setMethod("totp");
    setValue("");
    setError(null);
    props.onCancel();
  };

  const submit = async () => {
    const request = props.request;
    if (!request) return;
    const normalized = value.trim();
    if (activeMethod !== "webauthn" && !normalized) {
      setError(
        activeMethod === "backup_code"
          ? t("auth:VALIDATION_TWO_FACTOR_BACKUP_CODE_REQUIRED")
          : t("auth:VALIDATION_TWO_FACTOR_CODE_REQUIRED"),
      );
      return;
    }

    setPending(true);
    setError(null);
    try {
      const result =
        activeMethod === "webauthn"
          ? await (async () => {
              const begin = await authApi.beginSecurityActionWebAuthn({
                action: request.action,
              });
              const credential = await verifyProductPasskey(begin.options);
              return authApi.completeSecurityActionWebAuthn({
                action: request.action,
                challengeId: begin.options.challengeId,
                credential,
              });
            })()
          : await authApi.verifySecurityActionTotp({
              action: request.action,
              ...(activeMethod === "backup_code"
                ? { backupCode: normalized }
                : { code: normalized }),
            });
      setValue("");
      props.onVerified(result.proof);
    } catch (submitError) {
      notifyError(submitError);
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={Boolean(props.request)}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
      title={t("account:ME_SECURITY_ACTION_VERIFY_TITLE")}
      description={t("account:ME_SECURITY_ACTION_VERIFY_DESC")}
      footer={
        <>
          <Button variant="ghost" disabled={pending} onClick={close}>
            {t("common:CANCEL")}
          </Button>
          <Button variant="primary" loading={pending} onClick={() => void submit()}>
            {t("account:ME_SECURITY_ACTION_VERIFY_SUBMIT")}
          </Button>
        </>
      }
    >
      <SettingDialogField
        title={
          <AuthPaneTitleRow
            title={
              activeMethod === "webauthn"
                ? t("account:ME_SECURITY_2FA_PASSKEY_TITLE")
                : activeMethod === "backup_code"
                  ? t("auth:TWO_FACTOR_BACKUP_CODE_LABEL")
                  : t("auth:TWO_FACTOR_CODE_LABEL")
            }
          />
        }
        error={error ?? undefined}
      >
        {activeMethod === "webauthn" ? (
          <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 text-body text-label-secondary">
            <KeyRound className="size-5 text-label-primary" />
            {t("account:ME_SECURITY_ACTION_VERIFY_PASSKEY_DESC")}
          </div>
        ) : activeMethod === "backup_code" ? (
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t("auth:TWO_FACTOR_BACKUP_CODE_PLACEHOLDER")}
            disabled={pending}
          />
        ) : (
          <AuthOtpInput
            value={value}
            onChange={setValue}
            aria-label={t("auth:TWO_FACTOR_CODE_LABEL")}
            invalid={Boolean(error)}
            disabled={pending}
            maxLength={6}
          />
        )}
        {methods.length > 1 ? (
          <div className="flex flex-wrap gap-2 pt-2">
            {methods
              .filter((candidate) => candidate !== activeMethod)
              .map((candidate) => (
                <AuthLinkButton
                  key={candidate}
                  type="button"
                  onClick={() => {
                    setMethod(candidate);
                    setValue("");
                    setError(null);
                  }}
                >
                  {candidate === "webauthn"
                    ? t("account:ME_SECURITY_ACTION_USE_PASSKEY")
                    : candidate === "backup_code"
                      ? t("auth:TWO_FACTOR_USE_BACKUP_CODE")
                      : t("auth:TWO_FACTOR_USE_AUTHENTICATOR")}
                </AuthLinkButton>
              ))}
          </div>
        ) : null}
      </SettingDialogField>
    </SettingDialog>
  );
}

export function useSecurityActionVerification() {
  const [request, setRequest] = useState<PendingVerification | null>(null);
  const resolver = useRef<
    ((result: { cancelled: true } | { cancelled: false; proof?: string }) => void) | null
  >(null);

  const requestProof = async (
    action: authApi.SecurityAction,
  ): Promise<{ cancelled: true } | { cancelled: false; proof?: string }> => {
    const status = await authApi.getTwoFactorStatus();
    if (!status.enabled) return { cancelled: false };
    const methods = normalizeMethods(status.methods);
    if (!methods.length) throw new Error("Enabled MFA account has no usable verification method");
    return new Promise((resolve) => {
      resolver.current = resolve;
      setRequest({ action, methods });
    });
  };

  const finish = (result: { cancelled: true } | { cancelled: false; proof?: string }) => {
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(result);
  };

  return {
    requestProof,
    verificationDialog: (
      <SecurityActionVerificationDialog
        request={request}
        onCancel={() => finish({ cancelled: true })}
        onVerified={(proof) => finish({ cancelled: false, proof })}
      />
    ),
  };
}
