import { type ReactNode, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type {
  MailProviderInfo,
  PageDataFeedbackTicketListItemOut,
  PageDataMailTemplateGroupOut,
  PageDataNotificationCampaignSummaryOut,
} from "@arclayer/platform-openapi";

import {
  listCampaigns,
  listFeedback,
  listMailProviders,
  listTemplates,
} from "@/communications/communications-api";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@arclayer/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@arclayer/ui/empty";
import { Skeleton } from "@arclayer/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

function CommunicationsPage({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-7 px-5 py-8 md:px-8 md:py-10">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-largetitle">{title}</h1>
        <p className="text-body text-label-secondary">{description}</p>
      </header>
      {children}
    </section>
  );
}

function CommunicationsState<T>({
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
  const { t } = useTranslation("communications");
  if (state.status === "loading")
    return (
      <div className="space-y-3">
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

export function CommunicationsFeedbackPage() {
  const { t } = useTranslation("communications");
  const load = useCallback(() => listFeedback({ page: 1, size: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <CommunicationsPage title={t("FEEDBACK_TITLE")} description={t("FEEDBACK_DESCRIPTION")}>
      <CommunicationsState
        empty={(data: PageDataFeedbackTicketListItemOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardHeader>
              <CardTitle>{t("FEEDBACK_QUEUE")}</CardTitle>
              <CardDescription>{t("FEEDBACK_QUEUE_DESCRIPTION")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("STATUS")}</TableHead>
                    <TableHead>{t("PRIORITY")}</TableHead>
                    <TableHead>{t("REPORTER")}</TableHead>
                    <TableHead>{t("LAST_ACTIVITY")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge variant={item.status === "new" ? "destructive" : "outline"}>
                          {t(`FEEDBACK_STATUS_${item.status.toUpperCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>{t(`PRIORITY_${item.priority.toUpperCase()}`)}</TableCell>
                      <TableCell>{item.reporter.displayName ?? item.reporter.username}</TableCell>
                      <TableCell>{new Date(item.lastActivityAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </CommunicationsState>
    </CommunicationsPage>
  );
}

export function CommunicationsCampaignsPage() {
  const { t } = useTranslation("communications");
  const load = useCallback(() => listCampaigns({ page: 1, size: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <CommunicationsPage title={t("CAMPAIGNS_TITLE")} description={t("CAMPAIGNS_DESCRIPTION")}>
      <CommunicationsState
        empty={(data: PageDataNotificationCampaignSummaryOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("NAME")}</TableHead>
                    <TableHead>{t("STATE")}</TableHead>
                    <TableHead>{t("AUDIENCE")}</TableHead>
                    <TableHead>{t("UPDATED")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={item.state === "partially_failed" ? "destructive" : "outline"}
                        >
                          {t(`CAMPAIGN_STATE_${item.state.toUpperCase()}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.audienceEstimate ?? t("NOT_ESTIMATED")}</TableCell>
                      <TableCell>{new Date(item.updatedAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </CommunicationsState>
    </CommunicationsPage>
  );
}

export function CommunicationsTemplatesPage() {
  const { t } = useTranslation("communications");
  const load = useCallback(() => listTemplates({ page: 1, size: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <CommunicationsPage title={t("TEMPLATES_TITLE")} description={t("TEMPLATES_DESCRIPTION")}>
      <CommunicationsState
        empty={(data: PageDataMailTemplateGroupOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("NAME")}</TableHead>
                    <TableHead>{t("CATEGORY")}</TableHead>
                    <TableHead>{t("HEALTH")}</TableHead>
                    <TableHead>{t("LOCALES")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{t(`CATEGORY_${item.category.toUpperCase()}`)}</TableCell>
                      <TableCell>{t(`TEMPLATE_HEALTH_${item.health.toUpperCase()}`)}</TableCell>
                      <TableCell>
                        {item.locales.map((locale) => locale.locale).join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </CommunicationsState>
    </CommunicationsPage>
  );
}

export function CommunicationsEmailPage() {
  const { t } = useTranslation("communications");
  const load = useCallback(() => listMailProviders(), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <CommunicationsPage title={t("EMAIL_TITLE")} description={t("EMAIL_DESCRIPTION")}>
      <CommunicationsState empty={() => false} retry={retry} state={state}>
        {(providers: MailProviderInfo[]) => (
          <div className="grid gap-5 lg:grid-cols-2">
            {providers.map((provider) => (
              <Card key={provider.providerId}>
                <CardHeader>
                  <CardTitle>{provider.label}</CardTitle>
                  <CardDescription>{provider.providerId}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant={provider.active && provider.available ? "secondary" : "outline"}>
                    {provider.active && provider.available ? t("READY") : t("NOT_READY")}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CommunicationsState>
    </CommunicationsPage>
  );
}
