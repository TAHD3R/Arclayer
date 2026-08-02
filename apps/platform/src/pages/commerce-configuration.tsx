import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { getCommerceProvider } from "@/commerce/commerce-api";
import { CommercePage, CommerceQueryState } from "@/commerce/commerce-ui";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@arclayer/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";

export function CommerceConfigurationPage() {
  const { t } = useTranslation("commerce");
  const load = useCallback(() => getCommerceProvider(), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <CommercePage description={t("CONFIGURATION_DESCRIPTION")} title={t("CONFIGURATION_TITLE")}>
      <CommerceQueryState isEmpty={() => false} retry={retry} state={state}>
        {(provider) => (
          <Card>
            <CardHeader>
              <CardTitle>{provider.provider}</CardTitle>
              <CardDescription>{t("PROVIDER_READINESS_DESCRIPTION")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={provider.configured ? "secondary" : "outline"}>
                  {provider.configured ? t("CONFIGURED") : t("NOT_CONFIGURED")}
                </Badge>
                <Badge variant={provider.webhookReady ? "secondary" : "outline"}>
                  {provider.webhookReady ? t("WEBHOOK_READY") : t("WEBHOOK_NOT_READY")}
                </Badge>
                <Badge variant={provider.connectorRegistered ? "secondary" : "outline"}>
                  {provider.connectorRegistered
                    ? t("CONNECTOR_REGISTERED")
                    : t("CONNECTOR_NOT_REGISTERED")}
                </Badge>
              </div>
              <div>
                <p className="text-footnote font-medium">{t("SUPPORTED_CAPABILITIES")}</p>
                <p className="text-footnote text-label-secondary">
                  {provider.supportedCapabilities.join(", ") || t("NONE")}
                </p>
              </div>
              <div>
                <p className="text-footnote font-medium">{t("MISSING_PREREQUISITES")}</p>
                <p className="text-footnote text-label-secondary">
                  {provider.missingPrerequisites.join(", ") || t("NONE")}
                </p>
              </div>
              <p className="text-footnote text-label-secondary">
                {t("CONFIGURATION_WRITE_UNAVAILABLE")}
              </p>
            </CardContent>
          </Card>
        )}
      </CommerceQueryState>
    </CommercePage>
  );
}
