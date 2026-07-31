import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformCommercePlanCatalogOut } from "@arclayer/platform-openapi";

import { listCommercePlans } from "@/commerce/commerce-api";
import { CommercePage, CommerceQueryState } from "@/commerce/commerce-ui";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@arclayer/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";

export function CommercePlansPage() {
  const { t } = useTranslation("commerce");
  const load = useCallback(() => listCommercePlans({ includeInactive: true }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <CommercePage description={t("PLANS_DESCRIPTION")} title={t("PLANS_TITLE")}>
      <CommerceQueryState isEmpty={(data) => data.items.length === 0} retry={retry} state={state}>
        {(data) => <PlanCards data={data} />}
      </CommerceQueryState>
    </CommercePage>
  );
}

function PlanCards(props: Readonly<{ data: PlatformCommercePlanCatalogOut }>) {
  const { t } = useTranslation("commerce");
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {props.data.items.map((plan) => (
        <Card key={plan.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{plan.code}</CardTitle>
                <CardDescription>{plan.isActive ? t("ACTIVE") : t("INACTIVE")}</CardDescription>
              </div>
              <Badge variant={plan.isActive ? "secondary" : "outline"}>
                {plan.isActive ? t("ACTIVE") : t("INACTIVE")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {plan.revisions.length === 0 ? (
              <p className="text-body text-label-secondary">{t("NO_REVISIONS")}</p>
            ) : (
              plan.revisions.map((revision) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
                  key={revision.id}
                >
                  <div>
                    <p className="font-medium">{t("SEQUENCE", { sequence: revision.sequence })}</p>
                    <p className="text-footnote text-label-secondary">
                      {revision.status === "draft" ? t("DRAFT") : t("PUBLISHED")}
                      {revision.isSelling ? ` · ${t("SELLING")}` : ""}
                    </p>
                  </div>
                  {revision.publishedAt && (
                    <time className="text-footnote text-label-secondary">
                      {new Date(revision.publishedAt).toLocaleDateString()}
                    </time>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
