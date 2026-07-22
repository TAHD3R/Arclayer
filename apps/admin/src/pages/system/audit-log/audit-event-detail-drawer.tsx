import { Copy, ExternalLink, Fingerprint, Link2, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import type { ActivityEvent } from "@arclayer/openapi/admin-types";
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

import {
  auditEventName,
  auditScopeLabel,
  auditSourceLabel,
  auditTargetLabel,
} from "./audit-event-presenters";
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

function readablePropertyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function AuditEventDetailDrawer(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: ActivityEvent | null;
  workspaceLabelById: Readonly<Record<string, string>>;
  projectLabelById: Readonly<Record<string, string>>;
}) {
  const { t } = useTranslation(["common", "platform"]);
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const event = props.event;
  const metadata = useMemo(
    () =>
      Object.entries(event?.properties ?? {}).filter(
        ([, value]) => value !== null && value !== undefined,
      ),
    [event?.properties],
  );
  const copy = async (value: string, successKey: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notifySuccessText(t(successKey));
    } catch (error) {
      notifyError(error);
    }
  };

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange} direction="right">
      <DrawerContent className="w-full sm:max-w-2xl">
        <DrawerHeader className="max-w-none gap-1 px-5 py-4 pr-12">
          <DrawerTitle>
            {event ? auditEventName(t, event.eventName) : t("platform:AUDIT_EVENT_DETAIL_TITLE")}
          </DrawerTitle>
          <DrawerDescription>
            {event
              ? t("platform:AUDIT_EVENT_DETAIL_DESCRIPTION", {
                  time: dateTime.formatDateTime(event.occurredAt),
                })
              : null}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="max-w-none space-y-5 overflow-y-auto px-5 py-5">
          {event ? (
            <>
              <section className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <BaseTag>{auditSourceLabel(t, event.source)}</BaseTag>
                  <span className="text-footnote text-label-secondary">
                    {auditTargetLabel(t, event)}
                  </span>
                </div>
                <p className="mt-3 text-callout leading-relaxed text-label-primary">
                  {t("platform:AUDIT_EVENT_NARRATIVE", {
                    actor:
                      event.actor?.displayName ||
                      event.actor?.username ||
                      t("platform:AUDIT_SYSTEM_ACTOR"),
                    action: auditEventName(t, event.eventName),
                    scope: auditScopeLabel(
                      t,
                      event,
                      props.workspaceLabelById,
                      props.projectLabelById,
                    ),
                    target: auditTargetLabel(t, event),
                  })}
                </p>
              </section>

              <section>
                <h3 className="text-footnote font-semibold text-label-primary">
                  {t("platform:AUDIT_EVENT_CONTEXT_TITLE")}
                </h3>
                <dl className="mt-3 grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
                  <DetailFact label={t("platform:AUDIT_EVENT_ACTOR")}>
                    <AuditUserIdentity user={event.actor} userId={event.actorUserId} />
                  </DetailFact>
                  <DetailFact label={t("platform:AUDIT_EVENT_SCOPE")}>
                    {auditScopeLabel(t, event, props.workspaceLabelById, props.projectLabelById)}
                  </DetailFact>
                  <DetailFact label={t("platform:AUDIT_EVENT_TARGET")}>
                    {auditTargetLabel(t, event)}
                  </DetailFact>
                  <DetailFact label={t("platform:AUDIT_EVENT_TIME")}>
                    <time dateTime={event.occurredAt}>
                      {dateTime.formatDateTime(event.occurredAt)}
                    </time>
                  </DetailFact>
                </dl>
              </section>

              {metadata.length ? (
                <section>
                  <h3 className="text-footnote font-semibold text-label-primary">
                    {t("platform:AUDIT_EVENT_METADATA_TITLE")}
                  </h3>
                  <dl className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {metadata.map(([key, value]) => (
                      <div
                        key={key}
                        className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4"
                      >
                        <dt className="font-mono text-caption text-label-tertiary">{key}</dt>
                        <dd className="min-w-0 break-words text-footnote text-label-primary">
                          {readablePropertyValue(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : (
                <section className="rounded-lg border border-dashed border-border px-4 py-3 text-footnote text-label-secondary">
                  {t("platform:AUDIT_EVENT_METADATA_EMPTY")}
                </section>
              )}

              <section>
                <div className="flex items-center gap-2">
                  <Fingerprint className="size-4 text-label-tertiary" />
                  <h3 className="text-footnote font-semibold text-label-primary">
                    {t("platform:AUDIT_DIAGNOSTICS_TITLE")}
                  </h3>
                </div>
                <p className="mt-1 text-footnote text-label-secondary">
                  {t("platform:AUDIT_CORRELATION_EXPLANATION")}
                </p>
                <dl className="mt-3 grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
                  <DetailFact label={t("platform:AUDIT_EVENT_CODE")} mono>
                    {event.eventName}
                  </DetailFact>
                  <DetailFact label={t("platform:AUDIT_EVENT_ID")} mono>
                    {event.id}
                  </DetailFact>
                  {event.traceId ? (
                    <DetailFact label={t("platform:AUDIT_EVENT_TRACE")} mono>
                      {event.traceId}
                    </DetailFact>
                  ) : null}
                  {event.entityId ? (
                    <DetailFact label={t("platform:AUDIT_TARGET_ID")} mono>
                      {event.entityId}
                    </DetailFact>
                  ) : null}
                </dl>
              </section>
            </>
          ) : null}
        </DrawerBody>
        {event ? (
          <DrawerFooter className="max-w-none flex-row items-center justify-between px-5">
            <div className="flex items-center gap-1">
              <ShieldCheck className="size-4 text-label-tertiary" />
              <span className="text-caption text-label-secondary">
                {t("platform:AUDIT_SANITIZED_CONTEXT")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {event.traceId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copy(event.traceId!, "platform:AUDIT_TRACE_COPIED")}
                >
                  <Link2 className="size-4" />
                  {t("platform:AUDIT_COPY_CORRELATION")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => void copy(event.id, "platform:AUDIT_EVENT_ID_COPIED")}
              >
                <Copy className="size-4" />
                {t("platform:AUDIT_COPY_EVENT_ID")}
              </Button>
              <Button asChild type="button" variant="ghost">
                <a href="/system/tenants/users">
                  <ExternalLink className="size-4" />
                  {t("platform:AUDIT_OPEN_DIRECTORY")}
                </a>
              </Button>
            </div>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
