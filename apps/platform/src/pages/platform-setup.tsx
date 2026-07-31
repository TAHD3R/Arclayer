import { useNavigate, useRouter } from "@tanstack/react-router";
import { CircleAlert, LockKeyhole, ServerCog, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  bootstrapPlatformInstance,
  PlatformSetupApiError,
  type PlatformSetupState,
} from "@/setup/setup-api";
import { LocaleMenu, ProductApplicationLink, ThemeMenu } from "@/components/platform-utilities";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";

const SETUP_ERROR_KEYS: Readonly<Record<string, string>> = {
  EMAIL_EXISTS: "EMAIL_EXISTS",
  INSTANCE_ALREADY_INITIALIZED: "INSTANCE_ALREADY_INITIALIZED",
  INSTANCE_SETUP_REPAIR_REQUIRED: "INSTANCE_SETUP_REPAIR_REQUIRED",
  USERNAME_EXISTS: "USERNAME_EXISTS",
};

function setupErrorKey(error: PlatformSetupApiError): string {
  return SETUP_ERROR_KEYS[error.code] ?? "PLATFORM_SETUP_FAILED";
}

function repairReasonKey(reason: string | null): string {
  if (reason === "invalid_install_lock") return "REPAIR_INVALID_INSTALL_RECORD";
  if (reason === "state_mismatch") return "REPAIR_STATE_MISMATCH";
  return "REPAIR_UNKNOWN";
}

export function PlatformSetupPage({ setupState }: { setupState: PlatformSetupState }) {
  const { t } = useTranslation(["setup", "errors"]);
  const navigate = useNavigate();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlatformSetupApiError | null>(null);
  const [createdOwner, setCreatedOwner] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const username = String(data.get("username") ?? "");
    setPending(true);
    setError(null);
    void bootstrapPlatformInstance({
      username,
      email: String(data.get("email") ?? ""),
      displayName: String(data.get("displayName") ?? ""),
      password: String(data.get("password") ?? ""),
    })
      .then(() => setCreatedOwner(username))
      .catch((caught: unknown) => {
        setError(
          caught instanceof PlatformSetupApiError
            ? caught
            : new PlatformSetupApiError("PLATFORM_SETUP_FAILED"),
        );
      })
      .finally(() => setPending(false));
  };

  return (
    <main className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 items-center justify-end gap-1 px-4 md:px-6">
        <ProductApplicationLink />
        <LocaleMenu />
        <ThemeMenu />
      </header>
      <section className="mx-auto flex w-full max-w-lg flex-1 items-center px-5 py-10 md:px-0">
        <div className="w-full space-y-6">
          <div className="space-y-4 text-center">
            <img alt="" aria-hidden="true" className="mx-auto size-11" src="/logo.svg" />
            <div className="space-y-2">
              <h1 className="text-largetitle">{t("setup:TITLE")}</h1>
              <p className="text-body text-label-secondary">{t("setup:DESCRIPTION")}</p>
            </div>
          </div>
          {setupState.status === "repair_required" ? (
            <RepairRequired
              reason={setupState.repairReason}
              retry={() => void router.invalidate()}
            />
          ) : createdOwner ? (
            <SetupComplete owner={createdOwner} signIn={() => void navigate({ to: "/sign-in" })} />
          ) : (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-title3">{t("setup:CREATE_OWNER_TITLE")}</CardTitle>
                <CardDescription>{t("setup:CREATE_OWNER_DESCRIPTION")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {error ? (
                  <Alert aria-live="polite" variant="destructive">
                    <LockKeyhole aria-hidden="true" />
                    <AlertTitle>{t(`errors:${setupErrorKey(error)}`)}</AlertTitle>
                    <AlertDescription>
                      {t(`errors:${setupErrorKey(error)}_RECOVERY`)}
                    </AlertDescription>
                  </Alert>
                ) : null}
                <form onSubmit={submit}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="platform-owner-username">
                        {t("setup:ACCOUNT_NAME")}
                      </FieldLabel>
                      <Input
                        autoCapitalize="none"
                        autoComplete="username"
                        id="platform-owner-username"
                        maxLength={32}
                        minLength={3}
                        name="username"
                        pattern={"[a-z0-9\\-]+"}
                        required
                        spellCheck={false}
                      />
                      <FieldDescription>{t("setup:ACCOUNT_NAME_DESCRIPTION")}</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="platform-owner-display-name">
                        {t("setup:DISPLAY_NAME")}
                      </FieldLabel>
                      <Input
                        autoComplete="name"
                        id="platform-owner-display-name"
                        maxLength={64}
                        name="displayName"
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="platform-owner-email">{t("setup:EMAIL")}</FieldLabel>
                      <Input
                        autoComplete="email"
                        id="platform-owner-email"
                        name="email"
                        required
                        type="email"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="platform-owner-password">
                        {t("setup:PASSWORD")}
                      </FieldLabel>
                      <Input
                        autoComplete="new-password"
                        id="platform-owner-password"
                        maxLength={128}
                        minLength={8}
                        name="password"
                        required
                        type="password"
                      />
                      <FieldDescription>{t("setup:PASSWORD_DESCRIPTION")}</FieldDescription>
                    </Field>
                    <Button className="w-full" loading={pending} type="submit">
                      {t("setup:CREATE_OWNER")}
                    </Button>
                  </FieldGroup>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </main>
  );
}

function SetupComplete({ owner, signIn }: { owner: string; signIn: () => void }) {
  const { t } = useTranslation("setup");
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-positive/10 text-positive">
          <ShieldCheck aria-hidden="true" />
        </div>
        <CardTitle className="text-title3">{t("COMPLETE_TITLE")}</CardTitle>
        <CardDescription>{t("COMPLETE_DESCRIPTION", { owner })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <ServerCog aria-hidden="true" />
          <AlertTitle>{t("SECURITY_SETUP_REQUIRED_TITLE")}</AlertTitle>
          <AlertDescription>{t("SECURITY_SETUP_REQUIRED_DESCRIPTION")}</AlertDescription>
        </Alert>
        <Button className="w-full" onClick={signIn}>
          {t("CONTINUE_TO_SIGN_IN")}
        </Button>
      </CardContent>
    </Card>
  );
}

function RepairRequired({ reason, retry }: { reason: string | null; retry: () => void }) {
  const { t } = useTranslation("setup");
  const reasonKey = repairReasonKey(reason);
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <CircleAlert aria-hidden="true" />
        </div>
        <CardTitle className="text-title3">{t("REPAIR_TITLE")}</CardTitle>
        <CardDescription>{t("REPAIR_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{t(`${reasonKey}_TITLE`)}</AlertTitle>
          <AlertDescription>{t(`${reasonKey}_DESCRIPTION`)}</AlertDescription>
        </Alert>
        <Button className="w-full" onClick={retry} variant="outline">
          {t("CHECK_AGAIN")}
        </Button>
      </CardContent>
    </Card>
  );
}
