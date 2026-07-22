import {
  Clock3,
  Copy,
  Fingerprint,
  Gauge,
  MessageSquareWarning,
  Route,
  ShieldCheck,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { HTTPRequestRecord } from "@/api/platform-observability";
import { HeaderFeedbackPopover } from "@/components/feedback/feedback-dialog";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";

import { AuditUserIdentity } from "./audit-user-identity";

function DetailFact(props: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-label-tertiary">{props.label}</dt>
      <dd
        className={
          props.mono
            ? "mt-1 break-all font-mono text-caption"
            : "mt-1 text-footnote text-label-primary"
        }
      >
        {props.children}
      </dd>
    </div>
  );
}

function requestStatusColor(statusCode: number) {
  if (statusCode >= 500 || statusCode === 0) return "red" as const;
  if (statusCode >= 400) return "gold" as const;
  if (statusCode >= 200 && statusCode < 300) return "green" as const;
  return "default" as const;
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
  const workspaceLabel = record?.workspaceId ? props.workspaceLabelById[record.workspaceId] : null;
  const projectLabel = record?.projectId ? props.projectLabelById[record.projectId] : null;
  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notifySuccessText(t(key));
    } catch (error) {
      notifyError(error);
    }
  };

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange} direction="right">
      <DrawerContent className="w-full sm:max-w-2xl">
        <DrawerHeader className="max-w-none gap-1 px-5 py-4 pr-12">
          <DrawerTitle>{t("AUDIT_RECORD_DETAIL_TITLE")}</DrawerTitle>
          <DrawerDescription>
            {record ? `${record.method} ${record.routeTemplate}` : null}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="max-w-none space-y-5 overflow-y-auto px-5 py-5">
          {record ? (
            <>
              <section className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <BaseTag>{record.method}</BaseTag>
                  <BaseTag color={requestStatusColor(record.statusCode)}>
                    {record.statusCode || t("AUDIT_REQUEST_INTERRUPTED")}
                  </BaseTag>
                  <span className="font-mono text-footnote tabular-nums text-label-primary">
                    {number.format(record.durationMs)} ms
                  </span>
                </div>
                <div className="mt-3 flex min-w-0 items-start gap-2">
                  <Route className="mt-0.5 size-4 shrink-0 text-label-tertiary" />
                  <code className="break-all text-footnote text-label-primary">
                    {record.routeTemplate}
                  </code>
                </div>
              </section>

              <section>
                <h3 className="text-footnote font-semibold text-label-primary">
                  {t("AUDIT_REQUEST_SUMMARY_TITLE")}
                </h3>
                <dl className="mt-3 grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
                  <DetailFact label={t("AUDIT_EVENT_TIME")}>
                    <span className="flex items-center gap-2">
                      <Clock3 className="size-3.5 text-label-tertiary" />
                      {dateTime.formatDateTime(record.occurredAt)}
                    </span>
                  </DetailFact>
                  <DetailFact label={t("AUDIT_REQUEST_DURATION")}>
                    <span className="flex items-center gap-2 font-mono tabular-nums">
                      <Gauge className="size-3.5 text-label-tertiary" />
                      {number.format(record.durationMs)} ms
                    </span>
                  </DetailFact>
                  <DetailFact label={t("AUDIT_EVENT_ACTOR")}>
                    <AuditUserIdentity user={record.actor} userId={record.actorUserId} />
                  </DetailFact>
                  <DetailFact label={t("AUDIT_EVENT_SCOPE")}>
                    {[projectLabel, workspaceLabel].filter(Boolean).join(" · ") ||
                      t("AUDIT_GLOBAL_SCOPE")}
                  </DetailFact>
                </dl>
              </section>

              <section className="rounded-lg border border-dashed border-border px-4 py-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-label-tertiary" />
                  <div>
                    <h3 className="text-footnote font-semibold text-label-primary">
                      {t("AUDIT_REQUEST_CONTEXT_LIMITED_TITLE")}
                    </h3>
                    <p className="mt-1 text-footnote leading-relaxed text-label-secondary">
                      {t("AUDIT_REQUEST_CONTEXT_LIMITED_DESCRIPTION")}
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2">
                  <Fingerprint className="size-4 text-label-tertiary" />
                  <h3 className="text-footnote font-semibold text-label-primary">
                    {t("AUDIT_DIAGNOSTICS_TITLE")}
                  </h3>
                </div>
                <p className="mt-1 text-footnote text-label-secondary">
                  {t("AUDIT_CORRELATION_EXPLANATION")}
                </p>
                <dl className="mt-3 grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
                  <DetailFact label={t("AUDIT_RECORD_ID")} mono>
                    {record.id}
                  </DetailFact>
                  {record.traceId ? (
                    <DetailFact label={t("AUDIT_EVENT_TRACE")} mono>
                      {record.traceId}
                    </DetailFact>
                  ) : null}
                  {record.workspaceId ? (
                    <DetailFact label={t("AUDIT_WORKSPACE_ID")} mono>
                      {record.workspaceId}
                    </DetailFact>
                  ) : null}
                  {record.projectId ? (
                    <DetailFact label={t("AUDIT_PROJECT_ID")} mono>
                      {record.projectId}
                    </DetailFact>
                  ) : null}
                </dl>
              </section>
            </>
          ) : null}
        </DrawerBody>
        {record ? (
          <DrawerFooter className="max-w-none flex-row items-center justify-end gap-2 px-5">
            <HeaderFeedbackPopover
              source="content_guard"
              initialIntent="problem"
              lockIntent
              reportContext={{ requestId: record.traceId ?? record.id, status: record.statusCode }}
              trigger={
                <Button type="button" variant="outline">
                  <MessageSquareWarning className="size-4" />
                  {t("AUDIT_REPORT_ISSUE")}
                </Button>
              }
            />
            {record.traceId ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void copy(record.traceId!, "AUDIT_TRACE_COPIED")}
              >
                <Copy className="size-4" />
                {t("AUDIT_COPY_CORRELATION")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => void copy(record.id, "AUDIT_RECORD_ID_COPIED")}
            >
              <Copy className="size-4" />
              {t("AUDIT_COPY_RECORD_ID")}
            </Button>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
