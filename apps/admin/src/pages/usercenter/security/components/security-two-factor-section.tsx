import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Smartphone, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { SecurityConfiguredTag, SecurityNotConfiguredTag } from "@/components/ui/tags";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@arclayer/ui/input-otp";
import { PasswordInput } from "@arclayer/ui/password-input";
import { QRCode } from "@arclayer/ui/qr-code";
import { SettingCard, SettingCardContent, SettingCardHeader } from "@arclayer/ui/setting-card";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

const OTP_LENGTH = 6;

type BackupCodesDialogProps = {
  backupCodes: string[];
  onAcknowledge: () => void;
  title: string;
  description: string;
  acknowledgeLabel: string;
};

type SetupDialogProps = {
  open: boolean;
  requiresPassword: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (
    password?: string,
  ) => Promise<{ secret: string; otpauthUri?: string; otpauth_uri?: string }>;
  onConfirm: (code: string) => Promise<{ backupCodes?: string[]; backup_codes?: string[] }>;
};

type ReauthDialogProps = {
  open: boolean;
  pending: boolean;
  title: string;
  description: string;
  submitLabel: string;
  allowCode: boolean;
  allowBackupCode: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    code?: string;
    backupCode?: string;
  }) => Promise<{ backupCodes?: string[]; backup_codes?: string[] } | null>;
};

function normalizeBackupCodes(
  result: { backupCodes?: string[]; backup_codes?: string[] } | null,
): string[] {
  if (!result) return [];
  return result.backupCodes ?? result.backup_codes ?? [];
}

function BackupCodesDialog(props: BackupCodesDialogProps) {
  return (
    <div className="grid gap-4">
      <Alert className="border-amber-500/30 bg-amber-500/8 text-amber-900 dark:text-amber-100">
        <TriangleAlert className="text-amber-600 dark:text-amber-300" />
        <AlertTitle>{props.title}</AlertTitle>
        <AlertDescription>{props.description}</AlertDescription>
      </Alert>
      <div className="grid gap-2 rounded-xl border border-border/70 bg-muted/20 p-4">
        {props.backupCodes.map((code) => (
          <code key={code} className="font-mono text-body text-label-primary">
            {code}
          </code>
        ))}
      </div>
      <Button onClick={props.onAcknowledge}>{props.acknowledgeLabel}</Button>
    </div>
  );
}

function SetupDialog(props: SetupDialogProps) {
  const { t } = useTranslation(["account", "auth", "common"]);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    if (props.open) return;
    setPassword("");
    setPasswordError(null);
    setSetupData(null);
    setBackupCodes([]);
    setCode("");
    setCodeError(null);
  }, [props.open]);

  const handleStart = async () => {
    const normalizedPassword = password.trim();
    if (props.requiresPassword && !normalizedPassword) {
      setPasswordError(t("auth:VALIDATION_PASSWORD_REQUIRED"));
      return;
    }
    const result = await props.onStart(normalizedPassword ? normalizedPassword : undefined);
    setPasswordError(null);
    setSetupData({
      secret: result.secret,
      otpauthUri: result.otpauthUri ?? result.otpauth_uri ?? "",
    });
  };

  const handleConfirm = async () => {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      setCodeError(t("auth:VALIDATION_TWO_FACTOR_CODE_REQUIRED"));
      return;
    }
    const result = await props.onConfirm(normalizedCode);
    setCodeError(null);
    setBackupCodes(normalizeBackupCodes(result));
  };

  const footer = backupCodes.length ? null : (
    <>
      <Button variant="ghost" disabled={props.pending} onClick={() => props.onOpenChange(false)}>
        {t("common:CANCEL")}
      </Button>
      <Button
        loading={props.pending}
        onClick={() => void (setupData ? handleConfirm() : handleStart())}
      >
        {setupData
          ? t("account:ME_SECURITY_2FA_SETUP_CONFIRM")
          : t("account:ME_SECURITY_2FA_SETUP_CONTINUE")}
      </Button>
    </>
  );

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next && props.pending) return;
        props.onOpenChange(next);
      }}
      title={t("account:ME_SECURITY_2FA_SETUP_DIALOG_TITLE")}
      description={t("account:ME_SECURITY_2FA_SETUP_DIALOG_DESC")}
      footer={footer}
    >
      {backupCodes.length ? (
        <BackupCodesDialog
          backupCodes={backupCodes}
          title={t("account:ME_SECURITY_2FA_BACKUP_CODES_TITLE")}
          description={t("account:ME_SECURITY_2FA_BACKUP_CODES_DESC")}
          acknowledgeLabel={t("account:ME_SECURITY_2FA_BACKUP_CODES_ACK")}
          onAcknowledge={() => props.onOpenChange(false)}
        />
      ) : setupData ? (
        <div className="grid gap-4">
          <div className="flex justify-center rounded-xl border border-border/70 bg-muted/20 p-4">
            <QRCode value={setupData.otpauthUri || setupData.secret} />
          </div>
          <div className="grid gap-1.5">
            <span className="text-callout text-label-primary">
              {t("account:ME_SECURITY_2FA_SETUP_SECRET_LABEL")}
            </span>
            <code className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 font-mono text-body text-label-primary">
              {setupData.secret}
            </code>
            <p className="text-footnote text-label-secondary">
              {t("account:ME_SECURITY_2FA_SETUP_SECRET_HELP")}
            </p>
          </div>
          <div className="grid gap-1.5">
            <span className="text-callout text-label-primary">
              {t("auth:TWO_FACTOR_CODE_LABEL")}
            </span>
            <InputOTP
              value={code}
              onChange={setCode}
              maxLength={OTP_LENGTH}
              aria-label={t("auth:TWO_FACTOR_CODE_LABEL")}
              inputMode="numeric"
              disabled={props.pending}
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
            {codeError ? <p className="text-footnote text-danger">{codeError}</p> : null}
          </div>
        </div>
      ) : props.requiresPassword ? (
        <div className="grid gap-1.5">
          <span className="text-callout text-label-primary">
            {t("account:ME_SECURITY_2FA_SETUP_PASSWORD")}
          </span>
          <PasswordInput
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-label={t("account:ME_SECURITY_2FA_SETUP_PASSWORD")}
            autoComplete="current-password"
          />
          {passwordError ? <p className="text-footnote text-danger">{passwordError}</p> : null}
        </div>
      ) : null}
    </SettingDialog>
  );
}

function ReauthDialog(props: ReauthDialogProps) {
  const { t } = useTranslation(["account", "auth", "common"]);
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultCodes, setResultCodes] = useState<string[]>([]);

  useEffect(() => {
    if (props.open) return;
    setCode("");
    setBackupCode("");
    setError(null);
    setResultCodes([]);
  }, [props.open]);

  const handleSubmit = async () => {
    const normalizedCode = code.trim();
    const normalizedBackupCode = backupCode.trim();
    if (props.allowCode && props.allowBackupCode) {
      if (!normalizedCode && !normalizedBackupCode) {
        setError(t("account:ME_SECURITY_2FA_REAUTH_ONE_OF_REQUIRED"));
        return;
      }
      if (normalizedCode && normalizedBackupCode) {
        setError(t("account:ME_SECURITY_2FA_REAUTH_MUTUALLY_EXCLUSIVE"));
        return;
      }
    }
    if (props.allowCode && !props.allowBackupCode && !normalizedCode) {
      setError(t("auth:VALIDATION_TWO_FACTOR_CODE_REQUIRED"));
      return;
    }
    if (!props.allowCode && props.allowBackupCode && !normalizedBackupCode) {
      setError(t("auth:VALIDATION_TWO_FACTOR_BACKUP_CODE_REQUIRED"));
      return;
    }
    const result = await props.onSubmit({
      ...(normalizedCode ? { code: normalizedCode } : {}),
      ...(normalizedBackupCode ? { backupCode: normalizedBackupCode } : {}),
    });
    setError(null);
    setResultCodes(normalizeBackupCodes(result));
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next && props.pending) return;
        props.onOpenChange(next);
      }}
      title={props.title}
      description={props.description}
      footer={
        resultCodes.length ? null : (
          <>
            <Button
              variant="ghost"
              disabled={props.pending}
              onClick={() => props.onOpenChange(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button loading={props.pending} onClick={() => void handleSubmit()}>
              {props.submitLabel}
            </Button>
          </>
        )
      }
    >
      {resultCodes.length ? (
        <BackupCodesDialog
          backupCodes={resultCodes}
          title={t("account:ME_SECURITY_2FA_BACKUP_CODES_TITLE")}
          description={t("account:ME_SECURITY_2FA_BACKUP_CODES_DESC")}
          acknowledgeLabel={t("account:ME_SECURITY_2FA_BACKUP_CODES_ACK")}
          onAcknowledge={() => props.onOpenChange(false)}
        />
      ) : (
        <div className="grid gap-4">
          {props.allowCode ? (
            <div className="grid gap-1.5">
              <span className="text-callout text-label-primary">
                {t("auth:TWO_FACTOR_CODE_LABEL")}
              </span>
              <InputOTP
                value={code}
                onChange={setCode}
                maxLength={OTP_LENGTH}
                aria-label={t("auth:TWO_FACTOR_CODE_LABEL")}
                inputMode="numeric"
                disabled={props.pending}
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
            </div>
          ) : null}
          {props.allowBackupCode ? (
            <div className="grid gap-1.5">
              <span className="text-callout text-label-primary">
                {t("auth:TWO_FACTOR_BACKUP_CODE_LABEL")}
              </span>
              <Input
                value={backupCode}
                onChange={(event) => setBackupCode(event.target.value)}
                aria-label={t("auth:TWO_FACTOR_BACKUP_CODE_LABEL")}
                placeholder={t("auth:TWO_FACTOR_BACKUP_CODE_PLACEHOLDER")}
                disabled={props.pending}
              />
            </div>
          ) : null}
          {error ? <p className="text-footnote text-danger">{error}</p> : null}
        </div>
      )}
    </SettingDialog>
  );
}

export function UserTwoFactorSection() {
  const { t } = useTranslation(["account"]);
  const queryClient = useQueryClient();
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["auth", "2fa", "status", sessionVersion],
    queryFn: async () => authApi.getTwoFactorStatus(),
    retry: false,
  });
  const capabilitiesQuery = useQuery({
    queryKey: ["auth", "2fa", "capabilities", sessionVersion],
    queryFn: async () => authApi.getTwoFactorCapabilities(),
    retry: false,
  });

  const refreshSecurityState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["auth", "2fa", "status", sessionVersion] }),
      queryClient.invalidateQueries({ queryKey: ["auth", "2fa", "capabilities", sessionVersion] }),
    ]);
  };

  const beginSetupMutation = useMutation({
    mutationFn: async (payload: { password?: string }) => authApi.beginTwoFactorSetup(payload),
    onError: (error) => notifyError(error),
  });
  const confirmSetupMutation = useMutation({
    mutationFn: async (payload: { code: string }) => authApi.confirmTwoFactorSetup(payload),
    onSuccess: async () => {
      await refreshSecurityState();
      notifySuccessText(t("account:ME_SECURITY_2FA_SETUP_SUCCESS"));
    },
    onError: (error) => notifyError(error),
  });
  const disableMutation = useMutation({
    mutationFn: async (payload: { code?: string; backupCode?: string }) =>
      authApi.disableTwoFactor(payload),
    onSuccess: async () => {
      await refreshSecurityState();
      notifySuccessText(t("account:ME_SECURITY_2FA_DISABLE_SUCCESS"));
      setDisableOpen(false);
    },
    onError: (error) => notifyError(error),
  });
  const regenerateMutation = useMutation({
    mutationFn: async (payload: { code?: string; backupCode?: string }) =>
      authApi.regenerateTwoFactorBackupCodes(payload),
    onSuccess: async () => {
      await refreshSecurityState();
      notifySuccessText(t("account:ME_SECURITY_2FA_REGENERATE_SUCCESS"));
    },
    onError: (error) => notifyError(error),
  });

  const enabled = Boolean(statusQuery.data?.enabled ?? capabilitiesQuery.data?.enabled);
  const backupCodesRemaining =
    statusQuery.data?.backupCodesRemaining ?? statusQuery.data?.backup_codes_remaining ?? 0;
  const setupRequiredMethods =
    capabilitiesQuery.data?.setupRequiredReauthMethods ??
    capabilitiesQuery.data?.setup_required_reauth_methods ??
    [];
  const disableRequiredMethods =
    capabilitiesQuery.data?.disableRequiredReauthMethods ??
    capabilitiesQuery.data?.disable_required_reauth_methods ??
    [];
  const regenerateRequiredMethods =
    capabilitiesQuery.data?.regenerateBackupCodesRequiredReauthMethods ??
    capabilitiesQuery.data?.regenerate_backup_codes_required_reauth_methods ??
    [];
  const canSetup = Boolean(capabilitiesQuery.data?.canSetup ?? capabilitiesQuery.data?.can_setup);
  const actionLoading = statusQuery.isLoading || capabilitiesQuery.isLoading;

  const secondaryDescription = useMemo(() => {
    if (!enabled) return t("account:ME_SECURITY_2FA_AUTH_APP_DESC");
    return t("account:ME_SECURITY_2FA_BACKUP_CODES_REMAINING", { count: backupCodesRemaining });
  }, [backupCodesRemaining, enabled, t]);

  return (
    <>
      <SettingCard>
        <SettingCardHeader
          title={t("account:ME_SECURITY_2FA_TITLE")}
          description={
            enabled
              ? t("account:ME_SECURITY_2FA_ENABLED_DESC")
              : t("account:ME_SECURITY_2FA_DISABLED_DESC")
          }
          action={
            enabled ? (
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setRegenerateOpen(true)}>
                  {t("account:ME_SECURITY_2FA_REGENERATE")}
                </Button>
                <Button variant="destructive" onClick={() => setDisableOpen(true)}>
                  {t("account:ME_SECURITY_2FA_DISABLE")}
                </Button>
              </div>
            ) : (
              <Button disabled={actionLoading || !canSetup} onClick={() => setSetupOpen(true)}>
                {t("account:ME_SECURITY_2FA_ENABLE")}
              </Button>
            )
          }
        />
        <SettingCardContent>
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30 shadow-sm">
              <Smartphone className="h-5 w-5 text-label-secondary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-body font-medium text-label-primary">
                  {t("account:ME_SECURITY_2FA_AUTH_APP_TITLE")}
                </span>
                {enabled ? (
                  <SecurityConfiguredTag label={t("account:ME_SECURITY_2FA_AUTH_APP_CONFIGURED")} />
                ) : (
                  <SecurityNotConfiguredTag
                    label={t("account:ME_SECURITY_2FA_AUTH_APP_NOT_CONFIGURED")}
                  />
                )}
              </div>
              <div className="mt-1 text-callout text-label-secondary">{secondaryDescription}</div>
            </div>
          </div>
        </SettingCardContent>
      </SettingCard>

      <SetupDialog
        open={setupOpen}
        requiresPassword={setupRequiredMethods.includes("password")}
        pending={beginSetupMutation.isPending || confirmSetupMutation.isPending}
        onOpenChange={setSetupOpen}
        onStart={async (password) => beginSetupMutation.mutateAsync(password ? { password } : {})}
        onConfirm={async (code) => confirmSetupMutation.mutateAsync({ code })}
      />

      <ReauthDialog
        open={regenerateOpen}
        pending={regenerateMutation.isPending}
        title={t("account:ME_SECURITY_2FA_REGENERATE_DIALOG_TITLE")}
        description={t("account:ME_SECURITY_2FA_REGENERATE_DIALOG_DESC")}
        submitLabel={t("account:ME_SECURITY_2FA_REGENERATE")}
        allowCode={regenerateRequiredMethods.includes("totp")}
        allowBackupCode={regenerateRequiredMethods.includes("backup_code")}
        onOpenChange={setRegenerateOpen}
        onSubmit={async (payload) => regenerateMutation.mutateAsync(payload)}
      />

      <ReauthDialog
        open={disableOpen}
        pending={disableMutation.isPending}
        title={t("account:ME_SECURITY_2FA_DISABLE_DIALOG_TITLE")}
        description={t("account:ME_SECURITY_2FA_DISABLE_DIALOG_DESC")}
        submitLabel={t("account:ME_SECURITY_2FA_DISABLE")}
        allowCode={disableRequiredMethods.includes("totp")}
        allowBackupCode={disableRequiredMethods.includes("backup_code")}
        onOpenChange={setDisableOpen}
        onSubmit={async (payload) => {
          await disableMutation.mutateAsync(payload);
          return null;
        }}
      />
    </>
  );
}
