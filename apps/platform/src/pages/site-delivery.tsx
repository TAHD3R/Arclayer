import { Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PageDataPlatformDeliveryDomainOut,
  PageDataPlatformDeliveryIssueOut,
  PageDataPlatformDeliveryRuleOut,
  PageDataPlatformDeliveryStorageOut,
  PlatformDeliveryContinuityPolicyOut,
  PlatformDeliveryDomainOut,
  PlatformDeliveryIssueOut,
  PlatformDeliveryOperationOut,
  PlatformDeliveryPolicyApplyOut,
  PlatformDeliveryPolicyPreviewOut,
  StorageProfileOut,
} from "@arclayer/platform-openapi";

import {
  applyDeliveryPolicy,
  type DeliveryIssueAction,
  type DeliveryOperationRequest,
  executeDeliveryIssueAction,
  getDeliveryContinuityPolicy,
  getDeliveryDomainDossier,
  getDeliveryIssueDossier,
  getDeliveryStorageDossier,
  listDeliveryDomains,
  listDeliveryIssues,
  listDeliveryRules,
  listDeliveryStorage,
  listStorageProfiles,
  PlatformSiteDeliveryApiError,
  previewDeliveryPolicy,
  recoverDeliveryDomain,
  testDeliveryStorage,
} from "@/site-delivery/site-delivery-api";
import {
  DeleteStorageProfileDialog,
  StorageProfileEditorDialog,
} from "@/site-delivery/storage-profile-dialogs";
import { PlatformPage } from "@/components/platform-page";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type QueryState<T> = { status: string; data?: T };
type DeliveryRulesData = Readonly<{
  policy: PlatformDeliveryContinuityPolicyOut;
  rules: PageDataPlatformDeliveryRuleOut;
}>;
type StoragePageData = Readonly<{
  delivery: PageDataPlatformDeliveryStorageOut;
  profiles: readonly StorageProfileOut[];
}>;
type ActionFailure = Readonly<{ code: string; status?: number }>;
type ActionFeedback =
  | Readonly<{ kind: "issue"; result: PlatformDeliveryOperationOut }>
  | Readonly<{ kind: "domain"; hostname: string; result: PlatformDeliveryOperationOut }>
  | Readonly<{ kind: "storage"; result: PlatformDeliveryOperationOut }>
  | Readonly<{ kind: "policy"; result: PlatformDeliveryPolicyApplyOut }>
  | Readonly<{ kind: "error"; failure: ActionFailure }>
  | Readonly<{ kind: "validation"; messageKey: string }>;

const ISSUE_ACTIONS: readonly DeliveryIssueAction[] = ["retry", "reconcile", "restore"];
const DELIVERY_STATE_KEYS: Readonly<Record<string, string>> = {
  continuity_required: "RULE_STATE_CONTINUITY_REQUIRED",
  failed: "RULE_STATE_FAILED",
  partial: "RULE_STATE_PARTIAL",
  restoration_required: "RULE_STATE_RESTORATION_REQUIRED",
  restored: "RULE_STATE_RESTORED",
  serving: "RULE_STATE_SERVING",
  suspended: "RULE_STATE_SUSPENDED",
};
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

  if (props.feedback.kind === "domain") {
    const { hostname, result } = props.feedback;
    const verified = result.verificationState === "confirmed";
    return (
      <Alert>
        <AlertTitle>
          {t(verified ? "DOMAIN_RECOVERY_COMPLETED_TITLE" : "DOMAIN_RECOVERY_PENDING_TITLE")}
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{t("DOMAIN_RECOVERY_DESCRIPTION", { hostname })}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {t("DOMAIN_ACTION_DIAGNOSTIC", { certificate: result.resultingState })}
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (props.feedback.kind === "storage") {
    const { result } = props.feedback;
    const passed = result.verificationState === "confirmed";
    return (
      <Alert variant={passed ? undefined : "destructive"}>
        <AlertTitle>
          {t(passed ? "STORAGE_TEST_PASSED_TITLE" : "STORAGE_TEST_FAILED_TITLE")}
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{t(passed ? "STORAGE_TEST_PASSED_DESCRIPTION" : "STORAGE_TEST_FAILED_DESCRIPTION")}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {t("STORAGE_TEST_DIAGNOSTIC", { status: result.resultingState })}
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  const { result } = props.feedback;
  return (
    <Alert className={result.partialFailure ? "border-amber-500/40 bg-amber-500/10" : undefined}>
      <AlertTitle>
        {t(result.replayed ? "POLICY_APPLY_REPLAYED_TITLE" : "POLICY_APPLIED_TITLE")}
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          {t("POLICY_APPLIED_DESCRIPTION", {
            count: result.affectedActiveTransitionCount,
            revision: result.policyRevision,
            seconds: result.continuityWindowSeconds,
          })}
        </p>
        {result.partialFailure ? <p>{t("POLICY_APPLY_PARTIAL_DESCRIPTION")}</p> : null}
      </AlertDescription>
    </Alert>
  );
}

function deliveryStateLabel(t: (key: string) => string, state: string): string {
  return t(DELIVERY_STATE_KEYS[state] ?? "RULE_STATE_UNKNOWN");
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
    </SiteDeliveryPage>
  );
}

export function SiteDeliveryDomainsPage() {
  const { t } = useTranslation("siteDelivery");
  const load = useCallback(() => listDeliveryDomains(), []);
  const { state, retry } = useMonitoringQuery(load, []);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
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
                          <Button
                            disabled={!canRecover || pending === item.id}
                            onClick={() => void recover(item)}
                            size="sm"
                            title={canRecover ? undefined : t("DOMAIN_RECOVERY_NOT_ELIGIBLE")}
                            variant="secondary"
                          >
                            {pending === item.id ? t("WORKING") : t("RECOVER_DOMAIN")}
                          </Button>
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
    </SiteDeliveryPage>
  );
}

export function SiteDeliveryStoragePage() {
  const { t } = useTranslation("siteDelivery");
  const load = useCallback(async (): Promise<StoragePageData> => {
    const [delivery, profiles] = await Promise.all([listDeliveryStorage(), listStorageProfiles()]);
    return { delivery, profiles: profiles.items ?? [] };
  }, []);
  const { state, retry } = useMonitoringQuery(load, []);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [profileAction, setProfileAction] = useState<
    "create" | Readonly<{ kind: "edit" | "delete"; profile: StorageProfileOut }> | null
  >(null);
  const operationRequests = useRef<Map<string, DeliveryOperationRequest>>(new Map());
  const testStorage = async (profileId: string) => {
    const operationKey = `${profileId}:test`;
    setPending(profileId);
    setFeedback(null);
    try {
      const request =
        operationRequests.current.get(operationKey) ??
        deliveryOperationRequest(
          operationRequests.current,
          operationKey,
          (await getDeliveryStorageDossier(profileId)).revision,
        );
      const result = await testDeliveryStorage(profileId, request);
      operationRequests.current.delete(operationKey);
      setFeedback({ kind: "storage", result });
      retry();
    } catch (error) {
      discardStaleOperationRequest(operationRequests.current, operationKey, error);
      setFeedback({ kind: "error", failure: actionFailure(error) });
    } finally {
      setPending(null);
    }
  };

  return (
    <SiteDeliveryPage description={t("STORAGE_DESCRIPTION")} title={t("STORAGE_TITLE")}>
      <div className="flex justify-end">
        <Button onClick={() => setProfileAction("create")}>
          <Plus aria-hidden="true" />
          {t("CREATE_STORAGE_PROFILE")}
        </Button>
      </div>
      {successKey ? (
        <Alert>
          <AlertDescription>{t(successKey)}</AlertDescription>
        </Alert>
      ) : null}
      <ActionFeedbackNotice feedback={feedback} />
      <SiteDeliveryState
        empty={(data: StoragePageData) => !data.profiles.length}
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
                    <TableHead>{t("ACTIONS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.profiles.map((profile) => {
                    const delivery = data.delivery.items?.find((item) => item.id === profile.id);
                    const editable = profile.configSource === "database";
                    return (
                      <TableRow key={profile.id}>
                        <TableCell>
                          <p>{profile.displayName}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {profile.profileKey}
                          </p>
                        </TableCell>
                        <TableCell>
                          {t(`STORAGE_PROVIDER_${profile.provider.toUpperCase()}`)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              (delivery?.lastTestStatus ?? profile.lastTestStatus) === "failed"
                                ? "destructive"
                                : "outline"
                            }
                          >
                            {t(
                              (delivery?.lastTestStatus ?? profile.lastTestStatus) === "passed"
                                ? "STORAGE_STATUS_PASSED"
                                : (delivery?.lastTestStatus ?? profile.lastTestStatus) === "failed"
                                  ? "STORAGE_STATUS_FAILED"
                                  : "NOT_TESTED",
                            )}
                          </Badge>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {profile.isDefault ? t("DEFAULT_STORAGE") : t("NON_DEFAULT_STORAGE")}
                          </p>
                          {!editable ? (
                            <p className="text-xs text-muted-foreground">
                              {t("STORAGE_ENVIRONMENT_MANAGED")}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              disabled={pending === profile.id}
                              onClick={() => void testStorage(profile.id)}
                              size="sm"
                              variant="secondary"
                            >
                              {pending === profile.id ? t("WORKING") : t("TEST_STORAGE")}
                            </Button>
                            <Button
                              disabled={!editable}
                              size="sm"
                              variant="outline"
                              onClick={() => setProfileAction({ kind: "edit", profile })}
                            >
                              <Pencil aria-hidden="true" />
                              {t("EDIT")}
                            </Button>
                            <Button
                              disabled={!editable || profile.isDefault}
                              size="sm"
                              variant="ghost"
                              onClick={() => setProfileAction({ kind: "delete", profile })}
                            >
                              <Trash2 aria-hidden="true" />
                              {t("DELETE")}
                            </Button>
                          </div>
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
      {profileAction === "create" ? (
        <StorageProfileEditorDialog
          open
          onCompleted={(messageKey) => {
            setSuccessKey(messageKey);
            retry();
          }}
          onOpenChange={(open) => !open && setProfileAction(null)}
        />
      ) : null}
      {profileAction && typeof profileAction === "object" && profileAction.kind === "edit" ? (
        <StorageProfileEditorDialog
          open
          onCompleted={(messageKey) => {
            setSuccessKey(messageKey);
            retry();
          }}
          onOpenChange={(open) => !open && setProfileAction(null)}
          profile={profileAction.profile}
        />
      ) : null}
      {profileAction && typeof profileAction === "object" && profileAction.kind === "delete" ? (
        <DeleteStorageProfileDialog
          open
          onCompleted={(messageKey) => {
            setSuccessKey(messageKey);
            retry();
          }}
          onOpenChange={(open) => !open && setProfileAction(null)}
          profile={profileAction.profile}
        />
      ) : null}
    </SiteDeliveryPage>
  );
}

function PolicyConsole(
  props: Readonly<{
    data: DeliveryRulesData;
    onFeedback: (feedback: ActionFeedback | null) => void;
    onRefresh: () => void;
  }>,
) {
  const { t } = useTranslation("siteDelivery");
  const [continuityWindowSeconds, setContinuityWindowSeconds] = useState(
    String(props.data.policy.continuityWindowSeconds ?? ""),
  );
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<PlatformDeliveryPolicyPreviewOut | null>(null);
  const [pending, setPending] = useState<"preview" | "apply" | null>(null);
  const applyRequest = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  const createPreview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const proposedWindow = Number(continuityWindowSeconds);
    if (!Number.isInteger(proposedWindow) || proposedWindow < 1) {
      props.onFeedback({ kind: "validation", messageKey: "POLICY_WINDOW_REQUIRED" });
      return;
    }
    setPending("preview");
    props.onFeedback(null);
    try {
      setPreview(await previewDeliveryPolicy(props.data.policy.revision, proposedWindow));
    } catch (error) {
      props.onFeedback({ kind: "error", failure: actionFailure(error) });
    } finally {
      setPending(null);
    }
  };

  const applyPreview = async () => {
    if (!preview) return;
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      props.onFeedback({ kind: "validation", messageKey: "POLICY_REASON_REQUIRED" });
      return;
    }
    const fingerprint = JSON.stringify({
      continuityWindowSeconds: preview.continuityWindowSeconds,
      expectedRevision: preview.expectedRevision,
      previewId: preview.id,
      proposedRevision: preview.proposedRevision,
      provider: "hosting_continuity",
      reason: normalizedReason,
    });
    if (applyRequest.current?.fingerprint !== fingerprint) {
      applyRequest.current = { fingerprint, idempotencyKey: crypto.randomUUID() };
    }
    setPending("apply");
    try {
      props.onFeedback({
        kind: "policy",
        result: await applyDeliveryPolicy(
          preview.id,
          normalizedReason,
          applyRequest.current.idempotencyKey,
        ),
      });
      applyRequest.current = null;
      setPreview(null);
      props.onRefresh();
    } catch (error) {
      props.onFeedback({ kind: "error", failure: actionFailure(error) });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t("POLICY_CURRENT_TITLE")}</CardTitle>
          <CardDescription>{t("POLICY_CURRENT_DESCRIPTION")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge variant={props.data.policy.isActive ? "secondary" : "outline"}>
              {t(props.data.policy.isActive ? "POLICY_ACTIVE" : "POLICY_INACTIVE")}
            </Badge>
            <Badge variant="outline">
              {t("POLICY_REVISION", { revision: props.data.policy.revision })}
            </Badge>
            <Badge variant="outline">
              {t("POLICY_AFFECTED_TRANSITIONS", {
                count: props.data.policy.affectedActiveTransitionCount,
              })}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {props.data.policy.continuityWindowSeconds == null
              ? t("POLICY_WINDOW_NOT_CONFIGURED")
              : t("POLICY_WINDOW_VALUE", { seconds: props.data.policy.continuityWindowSeconds })}
          </p>
          <form className="grid gap-3 md:grid-cols-[minmax(0,18rem)_auto]" onSubmit={createPreview}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="continuity-window-seconds">
                {t("POLICY_WINDOW_LABEL")}
              </label>
              <Input
                id="continuity-window-seconds"
                min="1"
                onChange={(event) => setContinuityWindowSeconds(event.target.value)}
                required
                type="number"
                value={continuityWindowSeconds}
              />
              <p className="text-xs text-muted-foreground">{t("POLICY_WINDOW_HELP")}</p>
            </div>
            <div className="self-end">
              <Button disabled={pending !== null} type="submit">
                {pending === "preview" ? t("WORKING") : t("PREVIEW_POLICY")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("POLICY_PREVIEW_TITLE")}</CardTitle>
            <CardDescription>{t("POLICY_PREVIEW_DESCRIPTION")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {t("POLICY_REVISION", { revision: preview.expectedRevision })}
              </Badge>
              <Badge variant="secondary">
                {t("POLICY_PROPOSED_REVISION", { revision: preview.proposedRevision })}
              </Badge>
              <Badge variant="outline">
                {t("POLICY_AFFECTED_TRANSITIONS", {
                  count: preview.affectedActiveTransitionCount,
                })}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("POLICY_WINDOW_VALUE", { seconds: preview.continuityWindowSeconds })}
            </p>
            {preview.partialFailure ? (
              <Alert className="border-amber-500/40 bg-amber-500/10">
                <AlertTitle>{t("POLICY_PREVIEW_PARTIAL_TITLE")}</AlertTitle>
                <AlertDescription>{t("POLICY_PREVIEW_PARTIAL_DESCRIPTION")}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="policy-apply-reason">
                {t("POLICY_REASON_LABEL")}
              </label>
              <Textarea
                id="policy-apply-reason"
                onChange={(event) => setReason(event.target.value)}
                required
                rows={3}
                value={reason}
              />
              <p className="text-xs text-muted-foreground">{t("POLICY_REASON_HELP")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending !== null || !reason.trim()}
                onClick={() => void applyPreview()}
              >
                {pending === "apply" ? t("WORKING") : t("APPLY_POLICY")}
              </Button>
              <Button
                disabled={pending !== null}
                onClick={() => setPreview(null)}
                variant="outline"
              >
                {t("CANCEL")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("RULES_READINESS_TITLE")}</CardTitle>
          <CardDescription>{t("RULES_READINESS_DESCRIPTION")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {props.data.rules.items?.length ? (
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
                {props.data.rules.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.workspaceId}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          item.state === "serving" || item.state === "restored"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {deliveryStateLabel(t, item.state)}
                      </Badge>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{item.state}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.preservedReleaseId ?? t("NO_PRESERVED_RELEASE")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.sourceIdentity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">{t("RULES_EMPTY")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function SiteDeliveryRulesPage() {
  const { t } = useTranslation("siteDelivery");
  const load = useCallback(async (): Promise<DeliveryRulesData> => {
    const [policy, rules] = await Promise.all([getDeliveryContinuityPolicy(), listDeliveryRules()]);
    return { policy, rules };
  }, []);
  const { state, retry } = useMonitoringQuery(load, []);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  return (
    <SiteDeliveryPage description={t("RULES_DESCRIPTION")} title={t("RULES_TITLE")}>
      <ActionFeedbackNotice feedback={feedback} />
      <SiteDeliveryState empty={() => false} retry={retry} state={state}>
        {(data) => (
          <PolicyConsole
            data={data}
            key={data.policy.revision}
            onFeedback={setFeedback}
            onRefresh={retry}
          />
        )}
      </SiteDeliveryState>
    </SiteDeliveryPage>
  );
}
