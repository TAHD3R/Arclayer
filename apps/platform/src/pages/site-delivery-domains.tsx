import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PageDataPlatformDeliveryDomainOut,
  PlatformDeliveryDomainOut,
} from "@arclayer/platform-openapi";

import {
  type DeliveryOperationRequest,
  getDeliveryDomainDossier,
  listDeliveryDomains,
  recoverDeliveryDomain,
} from "@/site-delivery/site-delivery-api";
import { SiteDeliveryOperationsSheet } from "@/site-delivery/site-delivery-operations-sheet";
import {
  ActionFeedbackNotice,
  actionFailure,
  type ActionFeedback,
  deliveryOperationRequest,
  discardStaleOperationRequest,
  SiteDeliveryPage,
  SiteDeliveryState,
} from "@/site-delivery/site-delivery-page-state";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function SiteDeliveryDomainsPage() {
  const { t } = useTranslation("siteDelivery");
  const load = useCallback(() => listDeliveryDomains(), []);
  const { state, retry } = useMonitoringQuery(load, []);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [operationsScope, setOperationsScope] = useState<{
    kind: "domain";
    id: string;
    name: string;
  } | null>(null);
  const operationRequests = useRef<Map<string, DeliveryOperationRequest>>(new Map());
  const recover = async (domain: PlatformDeliveryDomainOut) => {
    const operationKey = `${domain.id}:recover`;
    setPending(domain.id);
    setFeedback(null);
    try {
      const request =
        operationRequests.current.get(operationKey) ??
        deliveryOperationRequest(
          operationRequests.current,
          operationKey,
          (await getDeliveryDomainDossier(domain.id)).revision,
        );
      const result = await recoverDeliveryDomain(domain.id, request);
      operationRequests.current.delete(operationKey);
      setFeedback({ kind: "domain", hostname: domain.hostname, result });
      retry();
    } catch (error) {
      discardStaleOperationRequest(operationRequests.current, operationKey, error);
      setFeedback({ kind: "error", failure: actionFailure(error) });
    } finally {
      setPending(null);
    }
  };

  return (
    <SiteDeliveryPage description={t("DOMAINS_DESCRIPTION")} title={t("DOMAINS_TITLE")}>
      <ActionFeedbackNotice feedback={feedback} />
      <SiteDeliveryState
        empty={(data: PageDataPlatformDeliveryDomainOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("HOSTNAME")}</TableHead>
                    <TableHead>{t("READINESS")}</TableHead>
                    <TableHead>{t("CERTIFICATE")}</TableHead>
                    <TableHead>{t("ACTIONS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => {
                    const canRecover = item.source === "custom" && !item.isVerified;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p>{item.hostname}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {item.workspaceId}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p>
                            {t(
                              item.readiness === "verification_required"
                                ? "DOMAIN_VERIFICATION_REQUIRED"
                                : item.readiness === "certificate_error"
                                  ? "DOMAIN_CERTIFICATE_ERROR"
                                  : "DOMAIN_READINESS_UNKNOWN",
                            )}
                          </p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {t("SOURCE_STATE")}: {item.readiness}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p>{t("CERTIFICATE_NEEDS_ATTENTION")}</p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {item.certificateStatus}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              disabled={!canRecover || pending === item.id}
                              onClick={() => void recover(item)}
                              size="sm"
                              title={canRecover ? undefined : t("DOMAIN_RECOVERY_NOT_ELIGIBLE")}
                              variant="secondary"
                            >
                              {pending === item.id ? t("WORKING") : t("RECOVER_DOMAIN")}
                            </Button>
                            <Button
                              onClick={() =>
                                setOperationsScope({
                                  kind: "domain",
                                  id: item.id,
                                  name: item.hostname,
                                })
                              }
                              size="sm"
                              variant="ghost"
                            >
                              {t("OPERATIONS_LINK")}
                            </Button>
                          </div>
                          {!canRecover ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t("DOMAIN_RECOVERY_NOT_ELIGIBLE")}
                            </p>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </SiteDeliveryState>
      {operationsScope ? (
        <SiteDeliveryOperationsSheet
          onClose={() => setOperationsScope(null)}
          scope={operationsScope}
        />
      ) : null}
    </SiteDeliveryPage>
  );
}
