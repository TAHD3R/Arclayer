import { KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformMfaMethodReadinessOut } from "@arclayer/platform-openapi";

import { getCurrentMfaReadiness, getCurrentPlatformTeamIdentity } from "@/access/access-api";
import {
  AddAuthenticatorAppDialog,
  AddSecurityKeyDialog,
  RemoveMfaMethodDialog,
} from "@/access/platform-mfa-dialogs";
import { AccessPage, AccessQueryState, useAccessQuery } from "@/access/access-ui";
import { formatDateTime } from "@/monitoring/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PlatformMfaPage() {
  const { t } = useTranslation("access");
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [action, setAction] = useState<
    "authenticator" | "security-key" | Readonly<{ method: PlatformMfaMethodReadinessOut }> | null
  >(null);
  const load = useCallback(
    async () => ({
      identity: await getCurrentPlatformTeamIdentity(),
      readiness: await getCurrentMfaReadiness(),
    }),
    [],
  );
  const { state, retry } = useAccessQuery(load, []);
  return (
    <AccessPage description={t("MFA_PAGE_DESCRIPTION")} title={t("MFA_PAGE_TITLE")}>
      <AccessQueryState isEmpty={() => false} retry={retry} state={state}>
        {({ identity, readiness }) => {
          const canManage = identity.effectivePermissions.includes("platform:access-mfa:reset");
          const completed = (messageKey: string) => {
            setSuccessKey(messageKey);
            retry();
          };
          return (
            <>
              {canManage ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => setAction("authenticator")}>
                    <Plus aria-hidden="true" />
                    {t("ADD_AUTHENTICATOR_APP")}
                  </Button>
                  <Button onClick={() => setAction("security-key")}>
                    <KeyRound aria-hidden="true" />
                    {t("ADD_SECURITY_KEY")}
                  </Button>
                </div>
              ) : null}
              {successKey ? (
                <Alert>
                  <AlertDescription>{t(successKey)}</AlertDescription>
                </Alert>
              ) : null}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
                    {t("MFA_TITLE")}
                  </CardTitle>
                  <CardDescription>{t("MFA_DESCRIPTION")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Badge variant={readiness.ready ? "secondary" : "outline"}>
                    {t(readiness.ready ? "MFA_READY" : "MFA_SETUP_REQUIRED")}
                  </Badge>
                  {readiness.methods.length ? (
                    readiness.methods.map((method) => (
                      <article
                        className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between"
                        key={method.methodId}
                      >
                        <div>
                          <p className="font-medium">
                            {method.label ?? t(`MFA_KIND_${method.kind.toUpperCase()}`)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {t("VERIFIED_AT", {
                              date: method.verifiedAt
                                ? formatDateTime(method.verifiedAt)
                                : t("UNAVAILABLE"),
                            })}
                          </p>
                        </div>
                        {canManage ? (
                          <Button size="sm" variant="ghost" onClick={() => setAction({ method })}>
                            <Trash2 aria-hidden="true" />
                            {t("REMOVE_MFA_METHOD")}
                          </Button>
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <p className="text-base text-muted-foreground">{t("MFA_EMPTY")}</p>
                  )}
                  {readiness.availableRecoveryCodeCount !== null && (
                    <p className="text-sm text-muted-foreground">
                      {t("RECOVERY_CODES_REMAINING", {
                        count: readiness.availableRecoveryCodeCount,
                      })}
                    </p>
                  )}
                </CardContent>
              </Card>
              {action === "authenticator" ? (
                <AddAuthenticatorAppDialog
                  open
                  onCompleted={completed}
                  onOpenChange={(open) => !open && setAction(null)}
                  userId={readiness.userId}
                />
              ) : null}
              {action === "security-key" ? (
                <AddSecurityKeyDialog
                  open
                  onCompleted={completed}
                  onOpenChange={(open) => !open && setAction(null)}
                  userId={readiness.userId}
                />
              ) : null}
              {action && typeof action === "object" ? (
                <RemoveMfaMethodDialog
                  method={action.method}
                  open
                  onCompleted={completed}
                  onOpenChange={(open) => !open && setAction(null)}
                  userId={readiness.userId}
                />
              ) : null}
            </>
          );
        }}
      </AccessQueryState>
    </AccessPage>
  );
}
