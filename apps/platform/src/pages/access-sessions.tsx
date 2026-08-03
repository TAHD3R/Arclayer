import { AlertTriangle, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformMfaMethodReadinessOut,
  PlatformSessionInventoryItemOut,
} from "@arclayer/platform-openapi";

import {
  getCurrentMfaReadiness,
  getCurrentSessions,
  PlatformAccessApiError,
  revokeCurrentPlatformSession,
  revokeOtherCurrentPlatformSessions,
} from "@/access/access-api";
import { AccessPage, AccessQueryState, useAccessQuery } from "@/access/access-ui";
import { clearPlatformSession } from "@/auth/platform-session";
import { formatDateTime } from "@/monitoring/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingDialog } from "@/components/setting-dialog";

type SessionRevokeTarget = PlatformSessionInventoryItemOut | "others";

export function PlatformSessionsPage() {
  const { t } = useTranslation("access");
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(
    async () => ({ mfa: await getCurrentMfaReadiness(), sessions: await getCurrentSessions() }),
    [],
  );
  const { state, retry } = useAccessQuery(load, []);
  return (
    <AccessPage description={t("SESSIONS_DESCRIPTION")} title={t("SESSIONS_TITLE")}>
      {notice ? (
        <Alert role="status">
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>{t(notice)}</AlertTitle>
          <AlertDescription>{t("SESSION_REVOKE_SUCCESS_DESCRIPTION")}</AlertDescription>
        </Alert>
      ) : null}
      <AccessQueryState
        isEmpty={(data) => data.sessions.length === 0 && data.mfa.methods.length === 0}
        retry={retry}
        state={state}
      >
        {({ mfa, sessions }) => (
          <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <MfaCard methods={mfa.methods} />
            <SessionCard
              onChanged={(messageKey) => {
                setNotice(messageKey);
                retry();
              }}
              sessions={sessions}
            />
          </div>
        )}
      </AccessQueryState>
    </AccessPage>
  );
}

function MfaCard({ methods }: Readonly<{ methods: PlatformMfaMethodReadinessOut[] }>) {
  const { t } = useTranslation("access");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
          {t("MFA_TITLE")}
        </CardTitle>
        <CardDescription>{t("MFA_DESCRIPTION")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {methods.length ? (
          methods.map((method) => (
            <div className="border-t pt-3" key={method.methodId}>
              <p className="font-medium">
                {method.label ?? t(`MFA_KIND_${method.kind.toUpperCase()}`)}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("VERIFIED_AT", {
                  date: method.verifiedAt ? formatDateTime(method.verifiedAt) : t("UNAVAILABLE"),
                })}
              </p>
            </div>
          ))
        ) : (
          <p className="text-base text-muted-foreground">{t("MFA_EMPTY")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SessionCard({
  sessions,
  onChanged,
}: Readonly<{
  sessions: PlatformSessionInventoryItemOut[];
  onChanged: (messageKey: string) => void;
}>) {
  const { t } = useTranslation("access");
  const [target, setTarget] = useState<SessionRevokeTarget | null>(null);
  const otherCount = sessions.filter((session) => !session.isCurrent).length;
  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphone aria-hidden="true" className="size-5 text-primary" />
            {t("DEVICE_SESSIONS_TITLE")}
          </CardTitle>
          <CardDescription>{t("DEVICE_SESSIONS_DESCRIPTION")}</CardDescription>
        </div>
        <Button
          disabled={otherCount === 0}
          onClick={() => setTarget("others")}
          size="sm"
          variant="outline"
        >
          {t("REVOKE_OTHER_SESSIONS")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {sessions.length ? (
          sessions.map((session) => (
            <SessionRow
              key={session.sessionId}
              onRevoke={() => setTarget(session)}
              session={session}
            />
          ))
        ) : (
          <p className="text-base text-muted-foreground">{t("SESSIONS_EMPTY")}</p>
        )}
      </CardContent>
      <SessionRevokeDialog
        key={target === null ? "closed" : target === "others" ? target : target.sessionId}
        onCompleted={onChanged}
        onOpenChange={(open) => !open && setTarget(null)}
        target={target}
      />
    </Card>
  );
}

function SessionRow({
  session,
  onRevoke,
}: Readonly<{ session: PlatformSessionInventoryItemOut; onRevoke: () => void }>) {
  const { t } = useTranslation("access");
  return (
    <article className="flex flex-wrap items-start justify-between gap-3 border-t pt-3">
      <div>
        <p className="font-medium">{session.deviceLabel ?? t("UNRECOGNIZED_DEVICE")}</p>
        <p className="text-sm text-muted-foreground">
          {t("LAST_ACTIVE", { date: formatDateTime(session.recentActivityAt) })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("EXPIRES", { date: formatDateTime(session.absoluteExpiresAt) })}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {session.isCurrent ? <Badge variant="secondary">{t("CURRENT_DEVICE")}</Badge> : null}
        <Button onClick={onRevoke} size="sm" variant="outline">
          {t(session.isCurrent ? "SIGN_OUT_THIS_DEVICE" : "REVOKE_SESSION")}
        </Button>
      </div>
    </article>
  );
}

function SessionRevokeDialog({
  target,
  onOpenChange,
  onCompleted,
}: Readonly<{
  target: SessionRevokeTarget | null;
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string) => void;
}>) {
  const { t } = useTranslation("access");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requestRef = useRef<{
    targetKey: string;
    request: { correlationId: string; idempotencyKey: string };
  } | null>(null);
  const titleKey =
    target === "others"
      ? "REVOKE_OTHER_SESSIONS_TITLE"
      : target?.isCurrent
        ? "REVOKE_CURRENT_SESSION_TITLE"
        : "REVOKE_SESSION_TITLE";
  const descriptionKey =
    target === "others"
      ? "REVOKE_OTHER_SESSIONS_DESCRIPTION"
      : target?.isCurrent
        ? "REVOKE_CURRENT_SESSION_DESCRIPTION"
        : "REVOKE_SESSION_DESCRIPTION";

  const revoke = async () => {
    if (target === null) return;
    setPending(true);
    setError(null);
    const targetKey = target === "others" ? target : target.sessionId;
    if (requestRef.current?.targetKey !== targetKey) {
      requestRef.current = {
        targetKey,
        request: { correlationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() },
      };
    }
    const { request } = requestRef.current;
    try {
      if (target === "others") {
        await revokeOtherCurrentPlatformSessions(request);
        onOpenChange(false);
        onCompleted("OTHER_SESSIONS_REVOKED");
      } else {
        await revokeCurrentPlatformSession(target.sessionId, request);
        if (target.isCurrent) {
          clearPlatformSession("revoked");
        } else {
          onOpenChange(false);
          onCompleted("SESSION_REVOKED");
        }
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      description={
        target
          ? t(descriptionKey, {
              device: target === "others" ? "" : (target.deviceLabel ?? t("UNRECOGNIZED_DEVICE")),
            })
          : undefined
      }
      footer={
        <>
          <Button disabled={pending} onClick={() => onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button loading={pending} onClick={() => void revoke()} variant="destructive">
            {t("CONFIRM_SESSION_REVOKE")}
          </Button>
        </>
      }
      onOpenChange={(open) => !pending && onOpenChange(open)}
      open={target !== null}
      title={t(titleKey)}
    >
      <p className="text-base text-muted-foreground">{t("SESSION_REVOKE_CONSEQUENCE")}</p>
      {error ? <SessionMutationError error={error} /> : null}
    </SettingDialog>
  );
}

function SessionMutationError({ error }: Readonly<{ error: unknown }>) {
  const { t } = useTranslation("access");
  const denied = error instanceof PlatformAccessApiError && error.status === 403;
  const code =
    error instanceof PlatformAccessApiError ? error.message : "PLATFORM_SESSION_REVOKE_FAILED";
  return (
    <Alert className="mt-4" variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>
        {t(denied ? "SESSION_REVOKE_PERMISSION_ERROR" : "SESSION_REVOKE_ERROR")}
      </AlertTitle>
      <AlertDescription>
        <p>{t("SESSION_REVOKE_UNCHANGED")}</p>
        <p className="font-mono text-xs">{code}</p>
      </AlertDescription>
    </Alert>
  );
}
