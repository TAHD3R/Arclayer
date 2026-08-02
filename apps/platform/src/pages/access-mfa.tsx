import { ShieldCheck } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { getCurrentMfaReadiness } from "@/access/access-api";
import { AccessPage, AccessQueryState, useAccessQuery } from "@/access/access-ui";
import { formatDateTime } from "@/monitoring/format";
import { Badge } from "@arclayer/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";

export function PlatformMfaPage() {
  const { t } = useTranslation("access");
  const load = useCallback(() => getCurrentMfaReadiness(), []);
  const { state, retry } = useAccessQuery(load, []);
  return (
    <AccessPage description={t("MFA_PAGE_DESCRIPTION")} title={t("MFA_PAGE_TITLE")}>
      <AccessQueryState isEmpty={() => false} retry={retry} state={state}>
        {(readiness) => (
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
                  <article className="border-t pt-3" key={method.methodId}>
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
                  </article>
                ))
              ) : (
                <p className="text-body text-label-secondary">{t("MFA_EMPTY")}</p>
              )}
              {readiness.availableRecoveryCodeCount !== null && (
                <p className="text-footnote text-label-secondary">
                  {t("RECOVERY_CODES_REMAINING", { count: readiness.availableRecoveryCodeCount })}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </AccessQueryState>
    </AccessPage>
  );
}
