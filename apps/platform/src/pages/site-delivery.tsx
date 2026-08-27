import { type ReactNode, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PageDataPlatformDeliveryIssueOut,
  PlatformDeliveryIssueOut,
  PlatformDeliveryOperationOut,
} from "@arclayer/platform-openapi";

import {
  type DeliveryIssueAction,
  type DeliveryOperationRequest,
  executeDeliveryIssueAction,
  getDeliveryIssueDossier,
  listDeliveryIssues,
  PlatformSiteDeliveryApiError,
} from "@/site-delivery/site-delivery-api";
import { PlatformPage } from "@/components/platform-page";
import {
  SiteDeliveryOperationsSheet,
  type OperationScope,
} from "@/site-delivery/site-delivery-operations-sheet";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type QueryState<T> = { status: string; data?: T };
type ActionFailure = Readonly<{ code: string; status?: number }>;
type ActionFeedback =
  | Readonly<{ kind: "issue"; result: PlatformDeliveryOperationOut }>
  | Readonly<{ kind: "error"; failure: ActionFailure }>
  | Readonly<{ kind: "validation"; messageKey: string }>;

const ISSUE_ACTIONS: readonly DeliveryIssueAction[] = ["retry", "reconcile", "restore"];
const VISITOR_EFFECT_KEYS: Readonly<Record<string, string>> = {
  delivery_recovery_pending: "VISITOR_EFFECT_DELIVERY_RECOVERY_PENDING",
  site_unavailable: "VISITOR_EFFECT_SITE_UNAVAILABLE",
};

function SiteDeliveryPage(
  props: Readonly<{ title: string; description: string; children: ReactNode }>,
) {
  return (
    <PlatformPage description={props.description} title={props.title}>
      {props.children}
    </PlatformPage>
  );
}

function SiteDeliveryState<T>(
  props: Readonly<{
    state: QueryState<T>;
    retry: () => void;
    empty: (data: T) => boolean;
    children: (data: T) => ReactNode;
  }>,
) {
  const { t } = useTranslation("siteDelivery");
  if (props.state.status === "loading") {
    return (
      <div aria-busy="true" className="space-y-3" role="status">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (props.state.status === "error") {
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("ERROR_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("ERROR_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={props.retry} variant="outline">
            {t("RETRY")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  if (!props.state.data || props.empty(props.state.data)) {
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyTitle>{t("EMPTY_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("EMPTY_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return props.children(props.state.data);
}

function actionFailure(error: unknown): ActionFailure {
  if (error instanceof PlatformSiteDeliveryApiError) {
    return { code: error.message, status: error.status };
  }
  if (error instanceof Error && error.message) return { code: error.message };
  return { code: "PLATFORM_SITE_DELIVERY_REQUEST_FAILED" };
}

function deliveryOperationRequest(
  requests: Map<string, DeliveryOperationRequest>,
  operationKey: string,
  expectedRevision: string,
): DeliveryOperationRequest {
  const existing = requests.get(operationKey);
  if (existing) return existing;
  const request = { expectedRevision, idempotencyKey: crypto.randomUUID() };
  requests.set(operationKey, request);
  return request;
}

function discardStaleOperationRequest(
  requests: Map<string, DeliveryOperationRequest>,
  operationKey: string,
  error: unknown,
): void {
  if (error instanceof PlatformSiteDeliveryApiError && error.status === 409) {
    requests.delete(operationKey);
  }
}

function ActionFeedbackNotice(props: Readonly<{ feedback: ActionFeedback | null }>) {
  const { t } = useTranslation("siteDelivery");
  if (!props.feedback) return null;

  if (props.feedback.kind === "validation") {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("VALIDATION_TITLE")}</AlertTitle>
        <AlertDescription>{t(props.feedback.messageKey)}</AlertDescription>
      </Alert>
    );
  }

  if (props.feedback.kind === "error") {
    const conflict = props.feedback.failure.status === 409;
    const permissionDenied =
      props.feedback.failure.status === 401 || props.feedback.failure.status === 403;
    return (
      <Alert
        className={conflict ? "border-amber-500/40 bg-amber-500/10" : undefined}
        variant={conflict ? undefined : "destructive"}
      >
        <AlertTitle>
          {t(
            permissionDenied
              ? "ACTION_PERMISSION_TITLE"
              : conflict
                ? "ACTION_CONFLICT_TITLE"
                : "ACTION_FAILED_TITLE",
          )}
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            {t(
              permissionDenied
                ? "ACTION_PERMISSION_DESCRIPTION"
                : conflict
                  ? "ACTION_CONFLICT_DESCRIPTION"
                  : "ACTION_FAILED_DESCRIPTION",
            )}
          </p>
          <p className="font-mono text-xs" data-testid="site-delivery-action-error-code">
            {props.feedback.failure.code}
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (props.feedback.kind === "issue") {
    const { result } = props.feedback;
    const partialFailure = result.state === "partial";
    return (
      <Alert className={partialFailure ? "border-amber-500/40 bg-amber-500/10" : undefined}>
        <AlertTitle>
          {t(partialFailure ? "ISSUE_ACTION_PARTIAL_TITLE" : "ISSUE_ACTION_COMPLETED_TITLE")}
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            {t(
              partialFailure
                ? "ISSUE_ACTION_PARTIAL_DESCRIPTION"
                : "ISSUE_ACTION_COMPLETED_DESCRIPTION",
              { count: result.failedTargetCount },
            )}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {t("ACTION_DIAGNOSTIC", { action: result.action, state: result.resultingState })}
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

function visitorEffectLabel(t: (key: string) => string, visitorEffect: string): string {
  return t(VISITOR_EFFECT_KEYS[visitorEffect] ?? "VISITOR_EFFECT_UNKNOWN");
}

function issueActionAvailable(
  issue: PlatformDeliveryIssueOut,
  action: DeliveryIssueAction,
): boolean {
  if (action === "retry") return issue.retryable;
  if (issue.kind !== "hosting_continuity") return false;
  return action !== "restore" || issue.state === "restoration_required";
}

function issueActionUnavailableReason(
  t: (key: string) => string,
  issue: PlatformDeliveryIssueOut,
  action: DeliveryIssueAction,
): string {
  if (action === "retry") return t("ISSUE_RETRY_NOT_ELIGIBLE");
  if (issue.kind !== "hosting_continuity") return t("ISSUE_HOSTING_ACTION_REQUIRED");
  return t("ISSUE_RESTORE_NOT_ELIGIBLE");
}

export function SiteDeliveryIssuesPage() {
  const { t } = useTranslation("siteDelivery");
  const load = useCallback(() => listDeliveryIssues({ page: 1, size: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [operationsScope, setOperationsScope] = useState<OperationScope | null>(null);
  const operationRequests = useRef<Map<string, DeliveryOperationRequest>>(new Map());
  const execute = async (issue: PlatformDeliveryIssueOut, action: DeliveryIssueAction) => {
    const operationKey = `${issue.id}:${action}`;
    setPending(operationKey);
    setFeedback(null);
    try {
      const request =
        operationRequests.current.get(operationKey) ??
        deliveryOperationRequest(
          operationRequests.current,
          operationKey,
          (await getDeliveryIssueDossier(issue.id)).revision,
        );
      const result = await executeDeliveryIssueAction(issue.id, action, request);
      operationRequests.current.delete(operationKey);
      setFeedback({ kind: "issue", result });
      retry();
    } catch (error) {
      discardStaleOperationRequest(operationRequests.current, operationKey, error);
      setFeedback({ kind: "error", failure: actionFailure(error) });
    } finally {
      setPending(null);
    }
  };

  return (
    <SiteDeliveryPage description={t("ISSUES_DESCRIPTION")} title={t("ISSUES_TITLE")}>
      <ActionFeedbackNotice feedback={feedback} />
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
                    <TableHead>{t("AFFECTED_SCOPE")}</TableHead>
                    <TableHead>{t("STATE")}</TableHead>
                    <TableHead>{t("VISITOR_EFFECT")}</TableHead>
                    <TableHead>{t("ACTIONS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-mono text-xs">{item.workspaceId}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.projectId ? `${t("PROJECT")}: ${item.projectId}` : t("NO_PROJECT")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.siteId ? `${t("SITE")}: ${item.siteId}` : t("NO_SITE")}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">{t("ISSUE_REQUIRES_ACTION")}</Badge>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {t("SOURCE_STATE")}: {item.state}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p>{visitorEffectLabel(t, item.visitorEffect)}</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {item.visitorEffect}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {ISSUE_ACTIONS.map((action) => {
                            const available = issueActionAvailable(item, action);
                            const actionKey = `${item.id}:${action}`;
                            return (
                              <Button
                                disabled={!available || pending === actionKey}
                                key={action}
                                onClick={() => void execute(item, action)}
                                size="sm"
                                title={
                                  available
                                    ? undefined
                                    : issueActionUnavailableReason(t, item, action)
                                }
                                variant={action === "restore" ? "outline" : "secondary"}
                              >
                                {pending === actionKey
                                  ? t("WORKING")
                                  : t(`ISSUE_ACTION_${action.toUpperCase()}`)}
                              </Button>
                            );
                          })}
                          <Button
                            onClick={() =>
                              setOperationsScope({
                                kind: "issue",
                                id: item.id,
                                name: item.workspaceId,
                              })
                            }
                            size="sm"
                            variant="ghost"
                          >
                            {t("OPERATIONS_LINK")}
                          </Button>
                        </div>
                        {!item.retryable ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("ISSUE_RETRY_NOT_ELIGIBLE")}
                          </p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
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
