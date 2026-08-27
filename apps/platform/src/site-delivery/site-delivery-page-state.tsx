import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformDeliveryOperationOut,
  PlatformDeliveryPolicyApplyOut,
} from "@arclayer/platform-openapi";

import {
  type DeliveryOperationRequest,
  PlatformSiteDeliveryApiError,
} from "@/site-delivery/site-delivery-api";
import { PlatformPage } from "@/components/platform-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

export type QueryState<T> = { status: string; data?: T };
export type ActionFailure = Readonly<{ code: string; status?: number }>;
export type ActionFeedback =
  | Readonly<{ kind: "issue"; result: PlatformDeliveryOperationOut }>
  | Readonly<{ kind: "domain"; hostname: string; result: PlatformDeliveryOperationOut }>
  | Readonly<{ kind: "storage"; result: PlatformDeliveryOperationOut }>
  | Readonly<{ kind: "policy"; result: PlatformDeliveryPolicyApplyOut }>
  | Readonly<{ kind: "error"; failure: ActionFailure }>
  | Readonly<{ kind: "validation"; messageKey: string }>;

const DELIVERY_STATE_KEYS: Readonly<Record<string, string>> = {
  continuity_required: "RULE_STATE_CONTINUITY_REQUIRED",
  failed: "RULE_STATE_FAILED",
  partial: "RULE_STATE_PARTIAL",
  restoration_required: "RULE_STATE_RESTORATION_REQUIRED",
  restored: "RULE_STATE_RESTORED",
  serving: "RULE_STATE_SERVING",
  suspended: "RULE_STATE_SUSPENDED",
};

export function SiteDeliveryPage(
  props: Readonly<{ title: string; description: string; children: ReactNode }>,
) {
  return (
    <PlatformPage description={props.description} title={props.title}>
      {props.children}
    </PlatformPage>
  );
}

export function SiteDeliveryState<T>(
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

export function actionFailure(error: unknown): ActionFailure {
  if (error instanceof PlatformSiteDeliveryApiError) {
    return { code: error.message, status: error.status };
  }
  if (error instanceof Error && error.message) return { code: error.message };
  return { code: "PLATFORM_SITE_DELIVERY_REQUEST_FAILED" };
}

export function deliveryOperationRequest(
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

export function discardStaleOperationRequest(
  requests: Map<string, DeliveryOperationRequest>,
  operationKey: string,
  error: unknown,
): void {
  if (error instanceof PlatformSiteDeliveryApiError && error.status === 409) {
    requests.delete(operationKey);
  }
}

export function ActionFeedbackNotice(props: Readonly<{ feedback: ActionFeedback | null }>) {
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

export function deliveryStateLabel(t: (key: string) => string, state: string): string {
  return t(DELIVERY_STATE_KEYS[state] ?? "RULE_STATE_UNKNOWN");
}
