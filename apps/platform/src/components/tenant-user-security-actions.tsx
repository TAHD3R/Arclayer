import { useState } from "react";
import { KeyRound, Link2Off, LogOut, Mail, ShieldOff, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DirectoryUserDetailOut } from "@arclayer/platform-openapi";

import {
  deleteTenantUserAccount,
  disableTenantUserTwoFactor,
  resetTenantUserPassword,
  revokeTenantUserSessions,
  sendTenantUserResetPasswordEmail,
  unlinkTenantUserOauthProvider,
  TenantDirectoryApiError,
} from "@/api/tenant-directory";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

const MIN_PASSWORD_LENGTH = 8;

type ConfirmableAction = "send-reset-email" | "revoke-sessions" | "disable-2fa" | "delete";
type SecurityDialog = "reset-password" | ConfirmableAction | null;

export function TenantUserSecurityActions(props: {
  user: DirectoryUserDetailOut;
  canManage: boolean;
  onChanged: () => void;
  onSaved: (next: DirectoryUserDetailOut, messageKey: string) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation("tenants");
  const [dialog, setDialog] = useState<SecurityDialog>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<string | null>(null);
  const label = props.user.displayName?.trim() || props.user.username;
  const providers = props.user.linkedOauthProviders ?? [];
  return (
    <section className="grid gap-3" aria-labelledby="user-security-heading">
      <div>
        <h3 className="text-base" id="user-security-heading">
          {t("USER_SECURITY_ACTIONS")}
        </h3>
        <p className="text-base text-muted-foreground">{t("USER_SECURITY_ACTIONS_DESCRIPTION")}</p>
      </div>
      {props.canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialog("reset-password")} variant="outline">
            <KeyRound aria-hidden="true" /> {t("USER_RESET_PASSWORD")}
          </Button>
          <Button
            disabled={!props.user.email}
            onClick={() => setDialog("send-reset-email")}
            title={props.user.email ? undefined : t("USER_NO_EMAIL")}
            variant="outline"
          >
            <Mail aria-hidden="true" /> {t("USER_SEND_RESET_EMAIL")}
          </Button>
          <Button onClick={() => setDialog("revoke-sessions")} variant="outline">
            <LogOut aria-hidden="true" /> {t("USER_REVOKE_SESSIONS")}
          </Button>
          {props.user.twoFactorEnabled ? (
            <Button onClick={() => setDialog("disable-2fa")} variant="outline">
              <ShieldOff aria-hidden="true" /> {t("USER_DISABLE_2FA")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {providers.length ? (
        <div className="grid gap-2 rounded-lg border bg-card p-4">
          <p className="font-medium">{t("USER_OAUTH_PROVIDERS")}</p>
          {props.canManage
            ? providers.map((provider) => (
                <div className="flex flex-wrap items-center justify-between gap-2" key={provider}>
                  <span className="font-mono text-sm">{provider}</span>
                  <Button onClick={() => setUnlinkTarget(provider)} size="sm" variant="outline">
                    <Link2Off aria-hidden="true" /> {t("USER_UNLINK_OAUTH")}
                  </Button>
                </div>
              ))
            : providers.map((provider) => (
                <span className="font-mono text-sm" key={provider}>
                  {provider}
                </span>
              ))}
        </div>
      ) : null}
      {props.canManage ? (
        <>
          <Separator />
          <div className="grid gap-3" aria-labelledby="user-danger-heading">
            <div>
              <h3 className="text-base" id="user-danger-heading">
                {t("USER_DELETE_ACCOUNT")}
              </h3>
              <p className="text-base text-muted-foreground">
                {t("USER_DELETE_ACCOUNT_DESCRIPTION")}
              </p>
            </div>
            <div>
              <Button onClick={() => setDialog("delete")} variant="destructive">
                <Trash2 aria-hidden="true" /> {t("USER_DELETE_ACCOUNT")}
              </Button>
            </div>
          </div>
        </>
      ) : null}
      {dialog === "reset-password" ? (
        <ResetPasswordDialog
          key={props.user.updatedAt}
          label={label}
          onApplied={(next) => {
            setDialog(null);
            props.onSaved(next, "USER_RESET_PASSWORD_DONE");
          }}
          onClose={() => setDialog(null)}
          userId={props.user.userId}
        />
      ) : null}
      {dialog && dialog !== "reset-password" ? (
        <ConfirmableActionDialog
          action={dialog}
          email={props.user.email}
          key={dialog}
          label={label}
          onApplied={(next) => {
            setDialog(null);
            if (next) props.onSaved(next, confirmDoneKey[dialog]);
            else props.onDeleted();
          }}
          onClose={() => setDialog(null)}
          userId={props.user.userId}
        />
      ) : null}
      {unlinkTarget ? (
        <UnlinkOauthDialog
          key={unlinkTarget}
          label={label}
          onApplied={(next) => {
            setUnlinkTarget(null);
            props.onSaved(next, "USER_UNLINK_OAUTH_DONE");
          }}
          onClose={() => setUnlinkTarget(null)}
          provider={unlinkTarget}
          userId={props.user.userId}
        />
      ) : null}
    </section>
  );
}

const confirmDoneKey: Readonly<Record<ConfirmableAction, string>> = {
  "send-reset-email": "USER_SEND_RESET_EMAIL_DONE",
  "revoke-sessions": "USER_REVOKE_SESSIONS_DONE",
  "disable-2fa": "USER_DISABLE_2FA_DONE",
  delete: "USER_DELETE_ACCOUNT_DONE",
};

function ResetPasswordDialog(props: {
  userId: string;
  label: string;
  onClose: () => void;
  onApplied: (next: DirectoryUserDetailOut) => void;
}) {
  const { t } = useTranslation("tenants");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = confirmation.length > 0 && password.length > 0 && confirmation !== password;
  const submit = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("USER_RESET_PASSWORD_TOO_SHORT", { count: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirmation) {
      setError(t("USER_RESET_PASSWORD_MISMATCH"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      props.onApplied(await resetTenantUserPassword(props.userId, password));
    } catch (cause) {
      setError(actionError(t, cause));
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog onOpenChange={(open) => !open && !pending && props.onClose()} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("USER_RESET_PASSWORD")} · {props.label}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("USER_RESET_PASSWORD_DESCRIPTION")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm" htmlFor="user-reset-password-value">
            <span>{t("USER_RESET_PASSWORD_NEW")}</span>
            <Input
              autoComplete="new-password"
              id="user-reset-password-value"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>
          <label className="grid gap-1 text-sm" htmlFor="user-reset-password-confirm">
            <span>{t("USER_RESET_PASSWORD_CONFIRM")}</span>
            <Input
              autoComplete="new-password"
              id="user-reset-password-confirm"
              onChange={(event) => setConfirmation(event.target.value)}
              type="password"
              value={confirmation}
            />
          </label>
          {mismatch ? (
            <p className="text-sm text-destructive">{t("USER_RESET_PASSWORD_MISMATCH")}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">{t("USER_RESET_PASSWORD_HANDOFF")}</p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("CANCEL")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {pending ? t("WORKING") : t("USER_RESET_PASSWORD")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmableActionDialog(props: {
  action: ConfirmableAction;
  userId: string;
  label: string;
  email?: string | null;
  onClose: () => void;
  onApplied: (next: DirectoryUserDetailOut | null) => void;
}) {
  const { t } = useTranslation("tenants");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apply = async () => {
    setPending(true);
    setError(null);
    try {
      if (props.action === "send-reset-email") {
        props.onApplied(await sendTenantUserResetPasswordEmail(props.userId));
      } else if (props.action === "revoke-sessions") {
        props.onApplied(await revokeTenantUserSessions(props.userId));
      } else if (props.action === "disable-2fa") {
        props.onApplied(await disableTenantUserTwoFactor(props.userId));
      } else {
        await deleteTenantUserAccount(props.userId);
        props.onApplied(null);
      }
    } catch (cause) {
      setError(actionError(t, cause));
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog onOpenChange={(open) => !open && !pending && props.onClose()} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(confirmTitleKey[props.action])} · {props.label}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(confirmDescriptionKey[props.action], { email: props.email ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {props.action === "delete" ? (
          <p className="text-sm text-destructive">{t("USER_DELETE_ACCOUNT_CONSEQUENCES")}</p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("CANCEL")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void apply();
            }}
          >
            {pending ? t("WORKING") : t(confirmTitleKey[props.action])}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const confirmTitleKey: Readonly<Record<ConfirmableAction, string>> = {
  "send-reset-email": "USER_SEND_RESET_EMAIL",
  "revoke-sessions": "USER_REVOKE_SESSIONS",
  "disable-2fa": "USER_DISABLE_2FA",
  delete: "USER_DELETE_ACCOUNT",
};

const confirmDescriptionKey: Readonly<Record<ConfirmableAction, string>> = {
  "send-reset-email": "USER_SEND_RESET_EMAIL_DESCRIPTION",
  "revoke-sessions": "USER_REVOKE_SESSIONS_DESCRIPTION",
  "disable-2fa": "USER_DISABLE_2FA_DESCRIPTION",
  delete: "USER_DELETE_ACCOUNT_DESCRIPTION",
};

function UnlinkOauthDialog(props: {
  userId: string;
  provider: string;
  label: string;
  onClose: () => void;
  onApplied: (next: DirectoryUserDetailOut) => void;
}) {
  const { t } = useTranslation("tenants");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apply = async () => {
    setPending(true);
    setError(null);
    try {
      props.onApplied(await unlinkTenantUserOauthProvider(props.userId, props.provider));
    } catch (cause) {
      setError(actionError(t, cause));
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog onOpenChange={(open) => !open && !pending && props.onClose()} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("USER_UNLINK_OAUTH")} · {props.label}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("USER_UNLINK_OAUTH_DESCRIPTION", { provider: props.provider })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("CANCEL")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void apply();
            }}
          >
            {pending ? t("WORKING") : t("USER_UNLINK_OAUTH")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function actionError(t: (key: string) => string, cause: unknown): string {
  if (cause instanceof TenantDirectoryApiError) {
    return `${t("USER_ACTION_FAILED")} (${cause.code})`;
  }
  return t("USER_ACTION_FAILED");
}
