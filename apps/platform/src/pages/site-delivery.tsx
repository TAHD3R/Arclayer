import { type ReactNode, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type {
  PageDataPlatformDeliveryDomainOut,
  PageDataPlatformDeliveryIssueOut,
  PageDataPlatformDeliveryRuleOut,
  PageDataPlatformDeliveryStorageOut,
} from "@arclayer/platform-openapi";

import {
  listDeliveryDomains,
  listDeliveryIssues,
  listDeliveryRules,
  listDeliveryStorage,
} from "@/site-delivery/site-delivery-api";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@arclayer/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@arclayer/ui/empty";
import { Skeleton } from "@arclayer/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

function SiteDeliveryPage({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-7 px-5 py-8 md:px-8 md:py-10">
      <header className="max-w-3xl space-y-2">
        <p className="text-caption font-semibold tracking-[0.16em] text-label-secondary uppercase">
          Site delivery
        </p>
        <h1 className="text-largetitle">{title}</h1>
        <p className="text-body text-label-secondary">{description}</p>
      </header>
      {children}
    </section>
  );
}

function SiteDeliveryState<T>({
  state,
  retry,
  empty,
  children,
}: Readonly<{
  state: { status: string; data?: T };
  retry: () => void;
  empty: (data: T) => boolean;
  children: (data: T) => ReactNode;
}>) {
  const { t } = useTranslation("siteDelivery");
  if (state.status === "loading")
    return (
      <div
        aria-busy="true"
        aria-label={t("LOADING")}
        aria-live="polite"
        className="space-y-3"
        role="status"
      >
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  if (state.status === "error")
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("ERROR_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("ERROR_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
        <button className="rounded border px-3 py-2" onClick={retry} type="button">
          {t("RETRY")}
        </button>
      </Empty>
    );
  if (!state.data || empty(state.data))
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("EMPTY_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("EMPTY_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return children(state.data);
}

export function SiteDeliveryIssuesPage() {
  const { t } = useTranslation("siteDelivery");
  const load = useCallback(() => listDeliveryIssues({ page: 1, size: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <SiteDeliveryPage title={t("ISSUES_TITLE")} description={t("ISSUES_DESCRIPTION")}>
      <SiteDeliveryState
        empty={(data: PageDataPlatformDeliveryIssueOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardHeader>
              <CardTitle>{t("ISSUE_QUEUE")}</CardTitle>
              <CardDescription>{t("ISSUE_QUEUE_DESCRIPTION")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("WORKSPACE")}</TableHead>
                    <TableHead>{t("STATE")}</TableHead>
                    <TableHead>{t("VISITOR_EFFECT")}</TableHead>
                    <TableHead>{t("RETRYABLE")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-caption">{item.workspaceId}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{t("FAILED")}</Badge>
                      </TableCell>
                      <TableCell>{t("SITE_UNAVAILABLE")}</TableCell>
                      <TableCell>{item.retryable ? t("YES") : t("NO")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </SiteDeliveryState>
    </SiteDeliveryPage>
  );
}

export function SiteDeliveryDomainsPage() {
  const { t } = useTranslation("siteDelivery");
  const load = useCallback(() => listDeliveryDomains(), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <SiteDeliveryPage title={t("DOMAINS_TITLE")} description={t("DOMAINS_DESCRIPTION")}>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.hostname}</TableCell>
                      <TableCell>{item.readiness}</TableCell>
                      <TableCell>{item.certificateStatus}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </SiteDeliveryState>
    </SiteDeliveryPage>
  );
}

export function SiteDeliveryStoragePage() {
  const { t } = useTranslation("siteDelivery");
  const load = useCallback(() => listDeliveryStorage(), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <SiteDeliveryPage title={t("STORAGE_TITLE")} description={t("STORAGE_DESCRIPTION")}>
      <SiteDeliveryState
        empty={(data: PageDataPlatformDeliveryStorageOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("PROFILE")}</TableHead>
                    <TableHead>{t("PROVIDER")}</TableHead>
                    <TableHead>{t("STATUS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.displayName}</TableCell>
                      <TableCell>{item.provider}</TableCell>
                      <TableCell>{item.lastTestStatus ?? t("NOT_TESTED")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </SiteDeliveryState>
    </SiteDeliveryPage>
  );
}

export function SiteDeliveryRulesPage() {
  const { t } = useTranslation("siteDelivery");
  const load = useCallback(() => listDeliveryRules(), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <SiteDeliveryPage title={t("RULES_TITLE")} description={t("RULES_DESCRIPTION")}>
      <SiteDeliveryState
        empty={(data: PageDataPlatformDeliveryRuleOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardHeader>
              <CardTitle>{t("RULES_READINESS_TITLE")}</CardTitle>
              <CardDescription>{t("RULES_READINESS_DESCRIPTION")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("WORKSPACE")}</TableHead>
                    <TableHead>{t("DELIVERY_STATE")}</TableHead>
                    <TableHead>{t("PRESERVED_RELEASE")}</TableHead>
                    <TableHead>{t("SOURCE")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-caption">{item.workspaceId}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.state === "serving" || item.state === "restored"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {t(`RULE_STATE_${item.state.toUpperCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-caption">
                        {item.preservedReleaseId ?? t("NO_PRESERVED_RELEASE")}
                      </TableCell>
                      <TableCell className="font-mono text-caption">
                        {item.sourceIdentity}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </SiteDeliveryState>
    </SiteDeliveryPage>
  );
}
