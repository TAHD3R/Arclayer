import { CheckCircle2, CircleAlert } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { getSignInReadiness } from "@/access/access-api";
import { AccessPage, AccessQueryState, useAccessQuery } from "@/access/access-ui";
import { Badge } from "@arclayer/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";

export function PlatformSignInReadinessPage() {
  const { t } = useTranslation("access");
  const load = useCallback(() => getSignInReadiness(), []);
  const { state, retry } = useAccessQuery(load, []);
  return (
    <AccessPage
      description={t("SIGN_IN_READINESS_DESCRIPTION")}
      title={t("SIGN_IN_READINESS_TITLE")}
    >
      <AccessQueryState isEmpty={() => false} retry={retry} state={state}>
        {(readiness) => (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Card>
              <CardHeader>
                <CardTitle>{t("REGISTRATION_TITLE")}</CardTitle>
                <CardDescription>{t("REGISTRATION_DESCRIPTION")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Fact
                  label={t("PUBLIC_REGISTRATION")}
                  value={readiness.registration.publicRegistrationEnabled}
                />
                <Fact label={t("REQUIRE_EMAIL")} value={readiness.registration.requireEmail} />
                <Fact
                  label={t("REQUIRE_EMAIL_VERIFICATION")}
                  value={readiness.registration.requireEmailVerification}
                />
                <div>
                  <p className="text-footnote text-label-secondary">{t("ALLOWED_DOMAINS")}</p>
                  <p>
                    {readiness.registration.emailDomainsAllowlist.length
                      ? readiness.registration.emailDomainsAllowlist.join(", ")
                      : t("NO_DOMAIN_RESTRICTION")}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("IDENTITY_PROVIDERS")}</CardTitle>
                <CardDescription>{t("IDENTITY_PROVIDERS_DESCRIPTION")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {readiness.providers.length ? (
                  readiness.providers.map((provider) => (
                    <div
                      className="flex items-center justify-between gap-3 border-t pt-3"
                      key={provider.key}
                    >
                      <span className="font-medium">{provider.label}</span>
                      <Badge
                        variant={provider.enabled && provider.configured ? "secondary" : "outline"}
                      >
                        {t(
                          provider.enabled && provider.configured
                            ? "PROVIDER_READY"
                            : "PROVIDER_NOT_READY",
                        )}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-body text-label-secondary">{t("PROVIDERS_EMPTY")}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </AccessQueryState>
    </AccessPage>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: boolean }>) {
  const { t } = useTranslation("access");
  const Icon = value ? CheckCircle2 : CircleAlert;
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="flex items-center gap-2 text-footnote text-label-secondary">
        <Icon aria-hidden="true" className="size-4" />
        {t(value ? "ENABLED" : "DISABLED")}
      </span>
    </div>
  );
}
