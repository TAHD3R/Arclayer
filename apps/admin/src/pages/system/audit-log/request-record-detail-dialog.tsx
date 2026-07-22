import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { HTTPRequestRecord } from "@/api/platform-observability";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { ActivityUserPill } from "@/pages/workspaces/shared/activity/components/activity-user-pill";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

function DetailField(props: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border bg-muted/30 p-3">
      <div className="text-caption text-label-secondary">{props.label}</div>
      <div className={props.mono ? "mt-1 break-all font-mono text-caption" : "mt-1 text-footnote"}>
        {props.children}
      </div>
    </div>
  );
}

export function RequestRecordDetailDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: HTTPRequestRecord | null;
  workspaceLabelById: Readonly<Record<string, string>>;
  projectLabelById: Readonly<Record<string, string>>;
}) {
  const { t, i18n } = useTranslation("platform");
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const number = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );
  const record = props.record;
  const scopeLabel = record?.projectId
    ? (props.projectLabelById[record.projectId] ?? record.projectId)
    : record?.workspaceId
      ? (props.workspaceLabelById[record.workspaceId] ?? record.workspaceId)
      : t("AUDIT_GLOBAL_SCOPE");

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("AUDIT_RECORD_DETAIL_TITLE")}
      description={record ? `${record.method} ${record.routeTemplate}` : undefined}
      contentClassName="max-w-180"
    >
      {record ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label={t("AUDIT_REQUEST_STATUS_CODE")}>
              <BaseTag
                color={record.statusCode >= 500 || record.statusCode === 0 ? "red" : "default"}
              >
                {record.statusCode || t("AUDIT_REQUEST_INTERRUPTED")}
              </BaseTag>
            </DetailField>
            <DetailField label={t("AUDIT_REQUEST_DURATION")} mono>
              {number.format(record.durationMs)} ms
            </DetailField>
          </div>
          <DetailField label={t("AUDIT_REQUEST_ROUTE")} mono>
            {record.routeTemplate}
          </DetailField>
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label={t("AUDIT_EVENT_TIME")}>
              {dateTime.formatDateTime(record.occurredAt)}
            </DetailField>
            <DetailField label={t("AUDIT_EVENT_SCOPE")}>{scopeLabel}</DetailField>
          </div>
          <DetailField label={t("AUDIT_EVENT_ACTOR")}>
            <ActivityUserPill user={record.actor} secondary={record.actorUserId ?? undefined} />
          </DetailField>
          <DetailField label={t("AUDIT_EVENT_TRACE")} mono>
            {record.traceId ?? t("AUDIT_EVENT_TRACE_MISSING")}
          </DetailField>
          <DetailField label={t("AUDIT_RECORD_ID")} mono>
            {record.id}
          </DetailField>
        </div>
      ) : null}
    </SettingDialog>
  );
}
