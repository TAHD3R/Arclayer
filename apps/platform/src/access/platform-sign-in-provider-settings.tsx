import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformSignInProviderSettingsOut,
  PlatformSignInSettingsOut,
} from "@arclayer/platform-openapi";
import { toast } from "sonner";

import { deleteSignInProvider, updateSignInProvider } from "@/access/access-api";
import { signInSettingsErrorKey } from "@/access/platform-sign-in-errors";
import { verifyPlatformAction } from "@/access/platform-step-up";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";

type MutationAttempt = Readonly<{
  correlationId: string;
  fingerprint: string;
  idempotencyKey: string;
  stepUpProof?: string;
}>;

export function PlatformSignInProviderSettings({
  providers,
  revision,
  canManage,
  onChanged,
}: Readonly<{
  providers: readonly PlatformSignInProviderSettingsOut[];
  revision: number;
  canManage: boolean;
  onChanged: (settings: PlatformSignInSettingsOut) => void;
}>) {
  const { t } = useTranslation("access");
  const [provider, setProvider] = useState<PlatformSignInProviderSettingsOut | null>(null);
  const completed = (messageKey: string, settings: PlatformSignInSettingsOut) => {
    toast.success(t(messageKey));
    setProvider(null);
    onChanged(settings);
  };
  return (
    <div className="space-y-4">
      {!canManage ? (
        <Alert>
          <AlertTitle>{t("READ_ONLY_TITLE")}</AlertTitle>
          <AlertDescription>{t("OAUTH_READ_ONLY_DESCRIPTION")}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {providers.map((item) => (
          <Card key={item.key}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle>{item.label}</CardTitle>
                  <CardDescription>{t("PROVIDER_CARD_DESCRIPTION")}</CardDescription>
                </div>
                <Badge variant={item.enabled && item.configured ? "secondary" : "outline"}>
                  {t(item.enabled && item.configured ? "PROVIDER_READY" : "PROVIDER_NOT_READY")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("PROVIDER_CLIENT_ID")}</dt>
                  <dd className="max-w-[65%] truncate font-mono">
                    {item.clientId || t("NOT_CONFIGURED")}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("PROVIDER_CLIENT_SECRET")}</dt>
                  <dd>{t(item.hasClientSecret ? "SECRET_CONFIGURED" : "NOT_CONFIGURED")}</dd>
                </div>
              </dl>
              {canManage ? (
                <Button className="w-full" variant="outline" onClick={() => setProvider(item)}>
                  {item.configured ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
                  {t(item.configured ? "EDIT_PROVIDER" : "CONFIGURE_PROVIDER")}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      {!providers.length ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("PROVIDERS_EMPTY")}
          </CardContent>
        </Card>
      ) : null}
      {provider ? (
        <ProviderDialog
          canDelete={
            provider.configured ||
            provider.enabled ||
            Boolean(provider.clientId) ||
            provider.hasClientSecret
          }
          open
          provider={provider}
          revision={revision}
          onCompleted={completed}
          onOpenChange={(open) => !open && setProvider(null)}
        />
      ) : null}
    </div>
  );
}

function ProviderDialog({
  provider,
  revision,
  canDelete,
  open,
  onOpenChange,
  onCompleted,
}: Readonly<{
  provider: PlatformSignInProviderSettingsOut;
  revision: number;
  canDelete: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string, settings: PlatformSignInSettingsOut) => void;
}>) {
  const { t } = useTranslation("access");
  const [enabled, setEnabled] = useState(provider.enabled);
  const [clientId, setClientId] = useState(provider.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [clearSecret, setClearSecret] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const attemptRef = useRef<MutationAttempt | null>(null);
  const deleteAttemptRef = useRef<MutationAttempt | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const fingerprint = JSON.stringify([
      revision,
      provider.key,
      enabled,
      clientId,
      clearSecret,
      clientSecret,
    ]);
    let attempt = getAttempt(attemptRef, fingerprint);
    setPending(true);
    try {
      attempt = await withProof(attempt, attemptRef, {
        operation: "update_provider",
        providerKey: provider.key,
        revision,
      });
      if (!attempt.stepUpProof) throw new Error("PLATFORM_STEP_UP_PROOF_REQUIRED");
      const settings = await updateSignInProvider(provider.key, {
        clearClientSecret: clearSecret,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim() || null,
        correlationId: attempt.correlationId,
        enabled,
        expectedRevision: revision,
        idempotencyKey: attempt.idempotencyKey,
        stepUpProof: attempt.stepUpProof,
      });
      attemptRef.current = null;
      onCompleted("PROVIDER_SAVED", settings);
    } catch (caught) {
      toast.error(t("ACTION_FAILED"), {
        description: t(signInSettingsErrorKey(caught, "PROVIDER_SAVE_ERROR")),
      });
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    let attempt = getAttempt(deleteAttemptRef, JSON.stringify([revision, provider.key, "delete"]));
    setPending(true);
    try {
      attempt = await withProof(attempt, deleteAttemptRef, {
        operation: "delete_provider",
        providerKey: provider.key,
        revision,
      });
      if (!attempt.stepUpProof) throw new Error("PLATFORM_STEP_UP_PROOF_REQUIRED");
      const settings = await deleteSignInProvider(provider.key, {
        correlationId: attempt.correlationId,
        expectedRevision: revision,
        idempotencyKey: attempt.idempotencyKey,
        stepUpProof: attempt.stepUpProof,
      });
      deleteAttemptRef.current = null;
      setDeleteOpen(false);
      onCompleted("PROVIDER_DELETED", settings);
    } catch (caught) {
      toast.error(t("ACTION_FAILED"), {
        description: t(signInSettingsErrorKey(caught, "PROVIDER_SAVE_ERROR")),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <SettingDialog
        open={open}
        onOpenChange={(next) => !pending && onOpenChange(next)}
        title={t(provider.configured ? "EDIT_PROVIDER_TITLE" : "CONFIGURE_PROVIDER_TITLE", {
          provider: provider.label,
        })}
        description={t("PROVIDER_DIALOG_DESCRIPTION")}
        footer={
          <>
            {canDelete ? (
              <Button
                className="mr-auto"
                disabled={pending}
                variant="ghost"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 aria-hidden="true" />
                {t("DELETE_PROVIDER_CONFIGURATION")}
              </Button>
            ) : null}
            <Button disabled={pending} variant="outline" onClick={() => onOpenChange(false)}>
              {t("CANCEL")}
            </Button>
            <Button disabled={pending} form="platform-provider-form" type="submit">
              <KeyRound aria-hidden="true" />
              {pending ? t("VERIFYING") : t("VERIFY_AND_SAVE_PROVIDER")}
            </Button>
          </>
        }
      >
        <form id="platform-provider-form" onSubmit={save}>
          <SettingDialogFields>
            <SettingDialogField
              title={t("ENABLE_PROVIDER")}
              description={t("ENABLE_PROVIDER_DESCRIPTION")}
            >
              <Checkbox
                aria-label={t("ENABLE_PROVIDER")}
                checked={enabled}
                disabled={pending}
                onCheckedChange={(value) => setEnabled(value === true)}
              />
            </SettingDialogField>
            <SettingDialogField
              title={<label htmlFor="provider-client-id">{t("PROVIDER_CLIENT_ID")}</label>}
              description={t("PROVIDER_CLIENT_ID_DESCRIPTION")}
            >
              <Input
                autoComplete="off"
                disabled={pending}
                id="provider-client-id"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              />
            </SettingDialogField>
            <SettingDialogField
              title={<label htmlFor="provider-client-secret">{t("PROVIDER_CLIENT_SECRET")}</label>}
              description={t(
                provider.hasClientSecret
                  ? "PROVIDER_CLIENT_SECRET_REPLACE_DESCRIPTION"
                  : "PROVIDER_CLIENT_SECRET_DESCRIPTION",
              )}
            >
              <Input
                autoComplete="new-password"
                disabled={pending || clearSecret}
                id="provider-client-secret"
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
              />
            </SettingDialogField>
            {provider.hasClientSecret ? (
              <SettingDialogField
                title={t("CLEAR_PROVIDER_SECRET")}
                description={t("CLEAR_PROVIDER_SECRET_DESCRIPTION")}
              >
                <Checkbox
                  aria-label={t("CLEAR_PROVIDER_SECRET")}
                  checked={clearSecret}
                  disabled={pending}
                  onCheckedChange={(value) => {
                    setClearSecret(value === true);
                    if (value === true) {
                      setClientSecret("");
                      setEnabled(false);
                    }
                  }}
                />
              </SettingDialogField>
            ) : null}
          </SettingDialogFields>
        </form>
      </SettingDialog>
      <AlertDialog open={deleteOpen} onOpenChange={(next) => !pending && setDeleteOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("DELETE_PROVIDER_TITLE", { provider: provider.label })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("DELETE_PROVIDER_DESCRIPTION")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("CANCEL")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {pending ? t("VERIFYING") : t("VERIFY_AND_DELETE_PROVIDER")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function getAttempt(
  ref: React.RefObject<MutationAttempt | null>,
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

async function withProof(
  attempt: MutationAttempt,
  ref: React.RefObject<MutationAttempt | null>,
  context: Readonly<{ operation: string; providerKey: string; revision: number }>,
): Promise<MutationAttempt> {
  if (attempt.stepUpProof) return attempt;
  const next = {
    ...attempt,
    stepUpProof: await verifyPlatformAction({
      actionCode: "platform.access.change_sign_in_settings",
      expectedRevision: context.revision,
      idempotencyKey: attempt.idempotencyKey,
      scope: { operation: context.operation, provider_key: context.providerKey },
      targetType: "platform_sign_in_settings",
    }),
  };
  ref.current = next;
  return next;
}
