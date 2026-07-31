"use client";

import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

export type FeatureAccessCapacityView =
  | Readonly<{
      kind: "limited";
      assignedCount: number;
      limit: number;
      availableCount: number;
    }>
  | Readonly<{
      kind: "unlimited";
      assignedCount: number;
    }>;

export type FeatureAccessChangeAvailability = Readonly<
  | { status: "available" }
  | {
      status: "unavailable";
      reason: "capacity" | "payment-recovery" | "not-authorized" | "temporarily-unavailable";
    }
>;

export type MemberFeatureAccessView = Readonly<{
  id: string;
  name: string;
  description?: string | null;
  capacity: FeatureAccessCapacityView;
  assigned: boolean;
  change: Readonly<{
    action: "assign" | "revoke";
    availability: FeatureAccessChangeAvailability;
    pending?: boolean;
  }> | null;
}>;

function unavailableReasonKey(
  reason: Exclude<FeatureAccessChangeAvailability, { status: "available" }>["reason"],
) {
  if (reason === "capacity") return "featureAccess:NO_CAPACITY";
  if (reason === "payment-recovery") return "featureAccess:PAYMENT_RECOVERY_ASSIGN_UNAVAILABLE";
  if (reason === "not-authorized") return "featureAccess:CHANGE_NOT_ALLOWED";
  return "featureAccess:CHANGE_UNAVAILABLE";
}

function FeatureAccessItem(props: {
  item: MemberFeatureAccessView;
  paymentRecoveryLimited: boolean;
  onAssign: (item: MemberFeatureAccessView) => void;
  onRevoke: (item: MemberFeatureAccessView) => void;
}) {
  const { t } = useTranslation(["featureAccess"]);
  const { item } = props;
  const assignmentPaused = props.paymentRecoveryLimited && item.change?.action === "assign";
  const changeUnavailable = assignmentPaused || item.change?.availability.status === "unavailable";
  const unavailableReason = assignmentPaused
    ? "payment-recovery"
    : item.change?.availability.status === "unavailable"
      ? item.change.availability.reason
      : null;

  return (
    <li className="flex min-w-0 flex-col gap-4 rounded-xl border border-border/70 bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div>
          <div className="text-body font-semibold text-label-primary">{item.name}</div>
          {item.description ? (
            <p className="mt-1 text-callout text-label-secondary">{item.description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={item.assigned ? "default" : "outline"}>
            {t(item.assigned ? "featureAccess:ASSIGNED" : "featureAccess:NOT_ASSIGNED")}
          </Badge>
          <span className="text-caption tabular-nums text-label-secondary">
            {item.capacity.kind === "limited"
              ? t("featureAccess:USAGE", {
                  feature: item.name,
                  assigned: item.capacity.assignedCount,
                  limit: item.capacity.limit,
                })
              : t("featureAccess:UNLIMITED", { feature: item.name })}
          </span>
          {item.capacity.kind === "limited" ? (
            <span className="text-caption tabular-nums text-label-secondary">
              {t("featureAccess:AVAILABLE", { count: item.capacity.availableCount })}
            </span>
          ) : null}
        </div>
        {unavailableReason ? (
          <p className="text-caption text-label-secondary">
            {t(unavailableReasonKey(unavailableReason))}
          </p>
        ) : !item.assigned && !item.change ? (
          <p className="text-caption text-label-secondary">
            {t("featureAccess:NOT_ASSIGNED_DESCRIPTION")}
          </p>
        ) : null}
      </div>

      {item.change ? (
        <Button
          className="shrink-0"
          size="sm"
          variant={item.change.action === "revoke" ? "outline" : "default"}
          loading={Boolean(item.change.pending)}
          disabled={changeUnavailable || item.change.pending}
          onClick={() =>
            item.change?.action === "assign" ? props.onAssign(item) : props.onRevoke(item)
          }
        >
          {t(item.change.action === "assign" ? "featureAccess:ASSIGN" : "featureAccess:REVOKE")}
        </Button>
      ) : null}
    </li>
  );
}

export function MemberFeatureAccessDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  canManage: boolean;
  items: readonly MemberFeatureAccessView[];
  loading?: boolean;
  loadError?: boolean;
  changeError?: "conflict" | "failure" | null;
  paymentRecoveryLimited?: boolean;
  onRetry: () => void;
  onAssign: (item: MemberFeatureAccessView) => void;
  onRevoke: (item: MemberFeatureAccessView) => void;
}) {
  const { t } = useTranslation(["featureAccess", "common"]);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t(props.canManage ? "featureAccess:DIALOG_TITLE" : "featureAccess:VIEW_DIALOG_TITLE", {
        member: props.memberName,
      })}
      description={t(
        props.canManage
          ? "featureAccess:DIALOG_DESCRIPTION"
          : "featureAccess:VIEW_DIALOG_DESCRIPTION",
      )}
      footer={
        <Button variant="ghost" onClick={() => props.onOpenChange(false)}>
          {t("common:CLOSE")}
        </Button>
      }
    >
      <div className="space-y-4">
        {props.paymentRecoveryLimited ? (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertTitle>{t("featureAccess:PAYMENT_RECOVERY_TITLE")}</AlertTitle>
            <AlertDescription>{t("featureAccess:PAYMENT_RECOVERY_DESCRIPTION")}</AlertDescription>
          </Alert>
        ) : null}

        {props.changeError ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>
              {t(
                props.changeError === "conflict"
                  ? "featureAccess:CONFLICT_TITLE"
                  : "featureAccess:CHANGE_FAILED_TITLE",
              )}
            </AlertTitle>
            <AlertDescription>
              {t(
                props.changeError === "conflict"
                  ? "featureAccess:CONFLICT_DESCRIPTION"
                  : "featureAccess:CHANGE_FAILED_DESCRIPTION",
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        {props.loading ? (
          <p className="py-8 text-center text-callout text-label-secondary">
            {t("featureAccess:LOADING")}
          </p>
        ) : props.loadError ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>{t("featureAccess:LOAD_FAILED_TITLE")}</AlertTitle>
            <AlertDescription>
              <p>{t("featureAccess:LOAD_FAILED_DESCRIPTION")}</p>
              <Button size="sm" variant="outline" onClick={props.onRetry}>
                {t("featureAccess:TRY_AGAIN")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : props.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-5 py-8 text-center">
            <div className="text-body font-semibold text-label-primary">
              {t("featureAccess:EMPTY_TITLE")}
            </div>
            <p className="mt-1 text-callout text-label-secondary">
              {t("featureAccess:EMPTY_DESCRIPTION")}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {props.items.map((item) => (
              <FeatureAccessItem
                key={item.id}
                item={item}
                paymentRecoveryLimited={Boolean(props.paymentRecoveryLimited)}
                onAssign={props.onAssign}
                onRevoke={props.onRevoke}
              />
            ))}
          </ul>
        )}
      </div>
    </SettingDialog>
  );
}
