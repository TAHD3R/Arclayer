import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { copyToClipboard } from "@/lib/clipboard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { AuthOtpInput, AuthPaneTitleRow } from "@/pages/login/components/auth-pane-primitives";
import { useSecurityRelogin } from "@/pages/usercenter/shared/use-security-relogin";
import { useAuthStore } from "@/stores/use-auth-store";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { AuthLinkButton } from "@arclayer/ui/auth-controls";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { PasswordInput } from "@arclayer/ui/password-input";
import { QRCode } from "@arclayer/ui/qr-code";
import { SettingCard, SettingCardHeader } from "@arclayer/ui/setting-card";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import type { TwoFactorCapabilitiesOut, TwoFactorConfirmOut } from "@arclayer/openapi";

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
  onAcknowledgeBackupCodes: () => void;
  onStart: (password?: string) => Promise<{ secret: string; otpauthUri: string }>;
  onConfirm: (code: string) => Promise<TwoFactorConfirmOut>;
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
  }) => Promise<TwoFactorConfirmOut | null>;
};

type ReauthMethod = "totp" | "backup_code";

function normalizeBackupCodes(result: TwoFactorConfirmOut | null): string[] {
  return result?.backupCodes ?? [];
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
      <Button variant="outline" onClick={props.onAcknowledge}>
        {props.acknowledgeLabel}
      </Button>
    </div>
  );
}

function resolveHasPassword(data: TwoFactorCapabilitiesOut | undefined): boolean {
  return data?.hasPassword ?? true;
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
      otpauthUri: result.otpauthUri,
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

  const handleCopySecret = async () => {
    if (!setupData?.secret) return;
    try {
      await copyToClipboard(setupData.secret);
      notifySuccessText(t("account:ME_SECURITY_2FA_SETUP_SECRET_COPIED"));
    } catch (error) {
      notifyError(error);
    }
  };

  const footer = backupCodes.length ? null : (
    <>
      <Button variant="ghost" disabled={props.pending} onClick={() => props.onOpenChange(false)}>
        {t("common:CANCEL")}
      </Button>
      <Button
        variant="outline"
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
          onAcknowledge={props.onAcknowledgeBackupCodes}
        />
      ) : setupData ? (
        <SettingDialogFields>
          <div className="flex justify-center py-2">
            <QRCode value={setupData.otpauthUri || setupData.secret} />
          </div>
          <SettingDialogField
            title={t("account:ME_SECURITY_2FA_SETUP_SECRET_LABEL")}
            description={t("account:ME_SECURITY_2FA_SETUP_SECRET_HELP")}
          >
            <div className="flex min-w-0 items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-body text-label-primary">
                {setupData.secret}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t("account:ME_SECURITY_2FA_SETUP_SECRET_COPY")}
                onClick={() => void handleCopySecret()}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </SettingDialogField>
          <SettingDialogField
            title={<AuthPaneTitleRow title={t("auth:TWO_FACTOR_CODE_LABEL")} />}
            description={t("account:ME_SECURITY_2FA_SETUP_DIALOG_DESC")}
            error={codeError ?? undefined}
          >
            <AuthOtpInput
              value={code}
              onChange={setCode}
              aria-label={t("auth:TWO_FACTOR_CODE_LABEL")}
              invalid={Boolean(codeError)}
              disabled={props.pending}
              maxLength={OTP_LENGTH}
            />
          </SettingDialogField>
        </SettingDialogFields>
      ) : props.requiresPassword ? (
        <SettingDialogField
          title={t("account:ME_SECURITY_2FA_SETUP_PASSWORD")}
          error={passwordError ?? undefined}
        >
          <PasswordInput
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-label={t("account:ME_SECURITY_2FA_SETUP_PASSWORD")}
            autoComplete="current-password"
          />
        </SettingDialogField>
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
  const [method, setMethod] = useState<ReauthMethod>(props.allowCode ? "totp" : "backup_code");

  useEffect(() => {
    if (props.open) return;
    setCode("");
    setBackupCode("");
    setError(null);
    setResultCodes([]);
    setMethod(props.allowCode ? "totp" : "backup_code");
  }, [props.allowCode, props.open]);

  const activeMethod: ReauthMethod =
    props.allowCode && props.allowBackupCode
      ? method
      : props.allowBackupCode
        ? "backup_code"
        : "totp";
  const methodSwitchLabel =
    activeMethod === "totp"
      ? t("auth:TWO_FACTOR_USE_BACKUP_CODE")
      : t("auth:TWO_FACTOR_USE_AUTHENTICATOR");

  const handleSubmit = async () => {
    const normalizedCode = code.trim();
    const normalizedBackupCode = backupCode.trim();
    if (activeMethod === "totp" && !normalizedCode) {
      setError(t("auth:VALIDATION_TWO_FACTOR_CODE_REQUIRED"));
      return;
    }
    if (activeMethod === "backup_code" && !normalizedBackupCode) {
      setError(t("auth:VALIDATION_TWO_FACTOR_BACKUP_CODE_REQUIRED"));
      return;
    }
    const result = await props.onSubmit({
      ...(activeMethod === "totp" ? { code: normalizedCode } : {}),
      ...(activeMethod === "backup_code" ? { backupCode: normalizedBackupCode } : {}),
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
            <Button variant="outline" loading={props.pending} onClick={() => void handleSubmit()}>
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
        <SettingDialogFields>
          {activeMethod === "totp" ? (
            <SettingDialogField
              title={
                <AuthPaneTitleRow
                  title={t("auth:TWO_FACTOR_CODE_LABEL")}
                  action={
                    props.allowCode && props.allowBackupCode ? (
                      <AuthLinkButton
                        className="shrink-0"
                        onClick={() => {
                          setError(null);
                          setMethod("backup_code");
                        }}
                        type="button"
                      >
                        {methodSwitchLabel}
                      </AuthLinkButton>
                    ) : null
                  }
                />
              }
              error={error ?? undefined}
            >
              <AuthOtpInput
                value={code}
                onChange={setCode}
                aria-label={t("auth:TWO_FACTOR_CODE_LABEL")}
                invalid={Boolean(error)}
                disabled={props.pending}
                maxLength={OTP_LENGTH}
              />
            </SettingDialogField>
          ) : null}
          {activeMethod === "backup_code" ? (
            <SettingDialogField
              title={
                <AuthPaneTitleRow
                  title={t("auth:TWO_FACTOR_BACKUP_CODE_LABEL")}
                  action={
                    props.allowCode && props.allowBackupCode ? (
                      <AuthLinkButton
                        className="shrink-0"
                        onClick={() => {
                          setError(null);
                          setMethod("totp");
                        }}
                        type="button"
                      >
                        {methodSwitchLabel}
                      </AuthLinkButton>
                    ) : null
                  }
                />
              }
              error={error ?? undefined}
            >
              <Input
                value={backupCode}
                onChange={(event) => setBackupCode(event.target.value)}
                aria-label={t("auth:TWO_FACTOR_BACKUP_CODE_LABEL")}
                placeholder={t("auth:TWO_FACTOR_BACKUP_CODE_PLACEHOLDER")}
                disabled={props.pending}
              />
            </SettingDialogField>
          ) : null}
        </SettingDialogFields>
      )}
    </SettingDialog>
  );
}

export type UserTwoFactorSectionProps = {
  redirect?: string;
};

export function UserTwoFactorSection(props: UserTwoFactorSectionProps) {
  const { t } = useTranslation(["account"]);
  const queryClient = useQueryClient();
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const forceRelogin = useSecurityRelogin(props.redirect);
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
      notifySuccessText(t("account:ME_SECURITY_2FA_SETUP_SUCCESS"));
    },
    onError: (error) => notifyError(error),
  });
  const disableMutation = useMutation({
    mutationFn: async (payload: { code?: string; backupCode?: string }) =>
      authApi.disableTwoFactor(payload),
    onSuccess: async () => {
      notifySuccessText(t("account:ME_SECURITY_2FA_DISABLE_SUCCESS"));
      setDisableOpen(false);
      await forceRelogin();
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
  const setupRequiredMethods = capabilitiesQuery.data?.setupRequiredReauthMethods ?? [];
  const disableRequiredMethods = capabilitiesQuery.data?.disableRequiredReauthMethods ?? [];
  const regenerateRequiredMethods =
    capabilitiesQuery.data?.regenerateBackupCodesRequiredReauthMethods ?? [];
  const canSetup = Boolean(capabilitiesQuery.data?.canSetup);
  const hasPassword = resolveHasPassword(capabilitiesQuery.data);
  const actionLoading = statusQuery.isLoading || capabilitiesQuery.isLoading;
  const setupDisabled = actionLoading || !canSetup || !hasPassword;
  const setupAction = (
    <Button variant="outline" disabled={setupDisabled} onClick={() => setSetupOpen(true)}>
      {t("account:ME_SECURITY_2FA_ENABLE")}
    </Button>
  );

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
                <Button variant="outline" onClick={() => setRegenerateOpen(true)}>
                  {t("account:ME_SECURITY_2FA_REGENERATE")}
                </Button>
                <Button variant="outline" onClick={() => setDisableOpen(true)}>
                  {t("account:ME_SECURITY_2FA_DISABLE")}
                </Button>
              </div>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild focusTrigger={false}>
                    <span>{setupAction}</span>
                  </TooltipTrigger>
                  {!hasPassword ? (
                    <TooltipContent>
                      {t("account:ME_SECURITY_2FA_ENABLE_DISABLED_NO_PASSWORD")}
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              </TooltipProvider>
            )
          }
        />
      </SettingCard>

      <SetupDialog
        open={setupOpen}
        requiresPassword={setupRequiredMethods.includes("password")}
        pending={beginSetupMutation.isPending || confirmSetupMutation.isPending}
        onOpenChange={setSetupOpen}
        onAcknowledgeBackupCodes={() => void forceRelogin()}
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
