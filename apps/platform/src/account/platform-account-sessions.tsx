import { AlertTriangle, MonitorSmartphone } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformSessionInventoryItemOut } from "@arclayer/platform-openapi";

import {
  PlatformAccessApiError,
  revokeCurrentPlatformSession,
  revokeOtherCurrentPlatformSessions,
} from "@/access/access-api";
import {
  isPlatformSessionExpired,
  platformSessionExpiresAt,
  sortPlatformSessionsNewestFirst,
} from "@/access/platform-session-status";
import { formatDateTime } from "@/monitoring/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingDialog } from "@/components/setting-dialog";
import { cn } from "@/lib/utils";

type SessionRevokeTarget = PlatformSessionInventoryItemOut | "others";

export function PlatformAccountSessions({
  onChanged,
  onCurrentSessionRevoked,
  sessions,
}: Readonly<{
  onChanged: (messageKey: string) => void;
  onCurrentSessionRevoked: () => void;
  sessions: PlatformSessionInventoryItemOut[];
}>) {
  const { t } = useTranslation("access");
  const [target, setTarget] = useState<SessionRevokeTarget | null>(null);
  const orderedSessions = sortPlatformSessionsNewestFirst(sessions);
  const otherCount = orderedSessions.filter(
    (session) => !session.isCurrent && !isPlatformSessionExpired(session),
  ).length;

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphone aria-hidden="true" className="size-5 text-primary" />
            {t("ACCOUNT_SESSIONS_TITLE")}
          </CardTitle>
          <CardDescription>{t("ACCOUNT_SESSIONS_DESCRIPTION")}</CardDescription>
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
        {orderedSessions.length ? (
          orderedSessions.map((session) => (
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
        onCurrentSessionRevoked={onCurrentSessionRevoked}
        onOpenChange={(open) => !open && setTarget(null)}
        target={target}
      />
    </Card>
  );
}

function SessionRow({
  onRevoke,
  session,
}: Readonly<{ onRevoke: () => void; session: PlatformSessionInventoryItemOut }>) {
  const { t } = useTranslation("access");
  const expired = isPlatformSessionExpired(session);
  return (
    <article
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-t pt-3",
        expired && "opacity-55 grayscale",
      )}
    >
      <div>
        <p className="font-medium">{session.deviceLabel ?? t("UNRECOGNIZED_DEVICE")}</p>
        <p className="text-sm text-muted-foreground">
          {t("SESSION_CREATED", { date: formatDateTime(session.createdAt) })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("LAST_ACTIVE", { date: formatDateTime(session.recentActivityAt) })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("EXPIRES", { date: formatDateTime(platformSessionExpiresAt(session)) })}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {expired ? <Badge variant="outline">{t("SESSION_EXPIRED")}</Badge> : null}
        {session.isCurrent ? <Badge variant="secondary">{t("CURRENT_DEVICE")}</Badge> : null}
        {!expired ? (
          <Button onClick={onRevoke} size="sm" variant="outline">
            {t(session.isCurrent ? "SIGN_OUT_THIS_DEVICE" : "REVOKE_SESSION")}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function SessionRevokeDialog({
  onCompleted,
  onCurrentSessionRevoked,
  onOpenChange,
  target,
}: Readonly<{
  onCompleted: (messageKey: string) => void;
  onCurrentSessionRevoked: () => void;
  onOpenChange: (open: boolean) => void;
  target: SessionRevokeTarget | null;
}>) {
  const { t } = useTranslation("access");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requestRef = useRef<{
    targetKey: string;
    request: { correlationId: string; idempotencyKey: string };
  } | null>(null);
  const isCurrent = target !== null && target !== "others" && target.isCurrent;
  const titleKey =
    target === "others"
      ? "REVOKE_OTHER_SESSIONS_TITLE"
      : isCurrent
        ? "REVOKE_CURRENT_SESSION_TITLE"
        : "REVOKE_SESSION_TITLE";
  const descriptionKey =
    target === "others"
      ? "REVOKE_OTHER_SESSIONS_DESCRIPTION"
      : isCurrent
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
    try {
      if (target === "others") {
        await revokeOtherCurrentPlatformSessions(requestRef.current.request);
        onOpenChange(false);
        onCompleted("OTHER_SESSIONS_REVOKED");
      } else {
        await revokeCurrentPlatformSession(target.sessionId, requestRef.current.request);
        if (target.isCurrent) onCurrentSessionRevoked();
        else {
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
  return (
    <Alert className="mt-4" variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>
        {t(denied ? "SESSION_REVOKE_PERMISSION_ERROR" : "SESSION_REVOKE_ERROR")}
      </AlertTitle>
      <AlertDescription>{t("SESSION_REVOKE_UNCHANGED")}</AlertDescription>
    </Alert>
  );
}
