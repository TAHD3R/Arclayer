import { MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { getCurrentMfaReadiness, getCurrentSessions } from "@/access/access-api";
import { AccessPage, AccessQueryState, ReadOnlyNotice, useAccessQuery } from "@/access/access-ui";
import { formatDateTime } from "@/monitoring/format";
import { Badge } from "@arclayer/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";

export function PlatformSessionsPage() {
  const { t } = useTranslation("access");
  const load = useCallback(
    async () => ({ mfa: await getCurrentMfaReadiness(), sessions: await getCurrentSessions() }),
    [],
  );
  const { state, retry } = useAccessQuery(load, []);
  return (
    <AccessPage description={t("SESSIONS_DESCRIPTION")} title={t("SESSIONS_TITLE")}>
      <ReadOnlyNotice />
      <AccessQueryState
        isEmpty={(data) => data.sessions.length === 0 && data.mfa.methods.length === 0}
        retry={retry}
        state={state}
      >
        {({ mfa, sessions }) => (
          <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
                  {t("MFA_TITLE")}
                </CardTitle>
                <CardDescription>{t("MFA_DESCRIPTION")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {mfa.methods.length ? (
                  mfa.methods.map((method) => (
                    <div className="border-t pt-3" key={method.methodId}>
                      <p className="font-medium">
                        {method.label ?? t(`MFA_KIND_${method.kind.toUpperCase()}`)}
                      </p>
                      <p className="text-footnote text-label-secondary">
                        {t("VERIFIED_AT", {
                          date: method.verifiedAt
                            ? formatDateTime(method.verifiedAt)
                            : t("UNAVAILABLE"),
                        })}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-body text-label-secondary">{t("MFA_EMPTY")}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MonitorSmartphone aria-hidden="true" className="size-5 text-primary" />
                  {t("DEVICE_SESSIONS_TITLE")}
                </CardTitle>
                <CardDescription>{t("DEVICE_SESSIONS_DESCRIPTION")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sessions.length ? (
                  sessions.map((session) => (
                    <article
                      className="flex flex-wrap items-start justify-between gap-3 border-t pt-3"
                      key={session.sessionId}
                    >
                      <div>
                        <p className="font-medium">
                          {session.deviceLabel ?? t("UNRECOGNIZED_DEVICE")}
                        </p>
                        <p className="text-footnote text-label-secondary">
                          {t("LAST_ACTIVE", { date: formatDateTime(session.recentActivityAt) })}
                        </p>
                        <p className="text-footnote text-label-secondary">
                          {t("EXPIRES", { date: formatDateTime(session.absoluteExpiresAt) })}
                        </p>
                      </div>
                      {session.isCurrent && (
                        <Badge variant="secondary">{t("CURRENT_DEVICE")}</Badge>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="text-body text-label-secondary">{t("SESSIONS_EMPTY")}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </AccessQueryState>
    </AccessPage>
  );
}
