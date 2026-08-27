import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MailProviderInfo, MailServiceOut } from "@arclayer/platform-openapi";

import { getMailService, listMailProviders } from "@/communications/communications-api";
import { MessagesPage, MessagesState } from "@/communications/messages-page-state";
import {
  MailCredentialDialog,
  MailServiceActionDialog,
  MailServiceProfileDialog,
  MailServiceTestDialog,
} from "@/communications/mail-service-dialogs";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type MailDialogState =
  | Readonly<{
      kind: "credentials" | "disable" | "profile" | "recover" | "rotate" | "test";
      service: MailServiceOut;
    }>
  | Readonly<{ kind: "switch"; provider: MailProviderInfo; service: MailServiceOut }>;

function mailActionAvailable(
  service: MailServiceOut,
  action: NonNullable<MailServiceOut["permittedActions"]>[number]["action"],
): boolean {
  return (
    service.permittedActions?.some((item) => item.action === action && item.available) ?? false
  );
}

export function CommunicationsEmailPage() {
  const { t } = useTranslation("communications");
  const providersLoad = useCallback(() => listMailProviders(), []);
  const profileLoad = useCallback(() => getMailService(), []);
  const providers = useMonitoringQuery(providersLoad, []);
  const profile = useMonitoringQuery(profileLoad, []);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<MailDialogState | null>(null);
  const completed = (messageKey: string) => {
    setNotice(t(messageKey));
    providers.retry();
    profile.retry();
  };
  const service = profile.state.status === "ready" ? profile.state.data : undefined;
  return (
    <MessagesPage title={t("EMAIL_TITLE")} description={t("EMAIL_DESCRIPTION")}>
      <MessagesState empty={() => false} retry={profile.retry} state={profile.state}>
        {(service: MailServiceOut) => (
          <Card>
            <CardHeader>
              <CardTitle>{t("MAIL_READINESS")}</CardTitle>
              <CardDescription>
                {t(`MAIL_READINESS_${service.readiness.toUpperCase()}`)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant={service.active ? "secondary" : "outline"}>
                  {service.active ? t("ACTIVE") : t("INACTIVE")}
                </Badge>
                <Badge variant={service.senderVerified ? "secondary" : "outline"}>
                  {service.senderVerified ? t("SENDER_VERIFIED") : t("SENDER_UNVERIFIED")}
                </Badge>
                <Badge variant={service.reachable ? "secondary" : "destructive"}>
                  {service.reachable ? t("REACHABLE") : t("UNREACHABLE")}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {service.sender.address ?? t("SENDER_NOT_CONFIGURED")}
              </p>
              <p className="text-sm text-muted-foreground">
                {service.credentialConfigured
                  ? t("CREDENTIALS_CONFIGURED")
                  : t("CREDENTIALS_NOT_CONFIGURED")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("LAST_TEST")}:{" "}
                {service.lastTestStatus
                  ? `${t(`TEST_STATUS_${service.lastTestStatus.toUpperCase()}`)} · ${
                      service.lastTestedAt
                        ? new Date(service.lastTestedAt).toLocaleString()
                        : t("LAST_TEST_NOT_RUN")
                    }`
                  : t("LAST_TEST_NOT_RUN")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!mailActionAvailable(service, "configure")}
                  onClick={() => setDialog({ kind: "profile", service })}
                  title={
                    mailActionAvailable(service, "configure") ? undefined : t("ACTION_UNAVAILABLE")
                  }
                  variant="outline"
                >
                  {t("CONFIGURE_SERVICE")}
                </Button>
                {service.credentialConfigured ? (
                  <Button
                    disabled={!mailActionAvailable(service, "rotate_credentials")}
                    onClick={() => setDialog({ kind: "rotate", service })}
                    title={
                      mailActionAvailable(service, "rotate_credentials")
                        ? undefined
                        : t("ACTION_UNAVAILABLE")
                    }
                    variant="outline"
                  >
                    {t("ROTATE_CREDENTIALS")}
                  </Button>
                ) : (
                  <Button
                    disabled={!mailActionAvailable(service, "configure_credentials")}
                    onClick={() => setDialog({ kind: "credentials", service })}
                    title={
                      mailActionAvailable(service, "configure_credentials")
                        ? undefined
                        : t("ACTION_UNAVAILABLE")
                    }
                    variant="outline"
                  >
                    {t("CONFIGURE_CREDENTIALS")}
                  </Button>
                )}
                <Button
                  disabled={!mailActionAvailable(service, "test")}
                  onClick={() => setDialog({ kind: "test", service })}
                  title={mailActionAvailable(service, "test") ? undefined : t("ACTION_UNAVAILABLE")}
                  variant="outline"
                >
                  {t("TEST_SERVICE")}
                </Button>
                {service.active ? (
                  <Button
                    disabled={!mailActionAvailable(service, "disable")}
                    onClick={() => setDialog({ kind: "disable", service })}
                    title={
                      mailActionAvailable(service, "disable") ? undefined : t("ACTION_UNAVAILABLE")
                    }
                    variant="outline"
                  >
                    {t("DISABLE")}
                  </Button>
                ) : (
                  <Button
                    disabled={!mailActionAvailable(service, "recover")}
                    onClick={() => setDialog({ kind: "recover", service })}
                    title={
                      mailActionAvailable(service, "recover") ? undefined : t("ACTION_UNAVAILABLE")
                    }
                  >
                    {t("RECOVER")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </MessagesState>
      <MessagesState empty={() => false} retry={providers.retry} state={providers.state}>
        {(items: MailProviderInfo[]) => (
          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((provider) => (
              <Card key={provider.providerId}>
                <CardHeader>
                  <CardTitle>{provider.label}</CardTitle>
                  <CardDescription>{provider.providerId}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Badge variant={provider.active && provider.available ? "secondary" : "outline"}>
                    {provider.active && provider.available ? t("READY") : t("NOT_READY")}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {!provider.available
                      ? t("PROVIDER_UNAVAILABLE")
                      : provider.configured
                        ? t("PROVIDER_CONFIGURED")
                        : t("PROVIDER_NOT_CONFIGURED")}
                  </p>
                  <Button
                    disabled={!service || !provider.available || provider.active}
                    onClick={() => service && setDialog({ kind: "switch", provider, service })}
                    title={!service || !provider.available ? t("ACTION_UNAVAILABLE") : undefined}
                    variant="outline"
                  >
                    {t("ACTIVATE_PROVIDER")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </MessagesState>
      {notice ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {dialog?.kind === "profile" ? (
        <MailServiceProfileDialog
          key={dialog.service.revision}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          service={dialog.service}
        />
      ) : null}
      {dialog?.kind === "credentials" || dialog?.kind === "rotate" ? (
        <MailCredentialDialog
          key={`${dialog.kind}:${dialog.service.revision}`}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          rotate={dialog.kind === "rotate"}
          service={dialog.service}
        />
      ) : null}
      {dialog?.kind === "test" ? (
        <MailServiceTestDialog
          key={dialog.service.revision}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          service={dialog.service}
        />
      ) : null}
      {dialog?.kind === "disable" || dialog?.kind === "recover" ? (
        <MailServiceActionDialog
          key={`${dialog.kind}:${dialog.service.revision}`}
          kind={dialog.kind}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          service={dialog.service}
        />
      ) : null}
      {dialog?.kind === "switch" ? (
        <MailServiceActionDialog
          key={`${dialog.provider.providerId}:${dialog.service.revision}`}
          kind="switch"
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          provider={dialog.provider}
          service={dialog.service}
        />
      ) : null}
    </MessagesPage>
  );
}
