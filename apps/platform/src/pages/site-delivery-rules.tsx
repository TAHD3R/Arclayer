import { type FormEvent, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PageDataPlatformDeliveryRuleOut,
  PlatformDeliveryContinuityPolicyOut,
  PlatformDeliveryPolicyPreviewOut,
} from "@arclayer/platform-openapi";

import {
  applyDeliveryPolicy,
  getDeliveryContinuityPolicy,
  listDeliveryRules,
  previewDeliveryPolicy,
} from "@/site-delivery/site-delivery-api";
import {
  ActionFeedbackNotice,
  actionFailure,
  type ActionFeedback,
  deliveryStateLabel,
  SiteDeliveryPage,
  SiteDeliveryState,
} from "@/site-delivery/site-delivery-page-state";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type DeliveryRulesData = Readonly<{
  policy: PlatformDeliveryContinuityPolicyOut;
  rules: PageDataPlatformDeliveryRuleOut;
}>;

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
