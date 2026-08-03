import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Ban, CheckCircle2, Pencil, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DirectoryWorkspaceDetailOut } from "@arclayer/platform-openapi";

import { useCapabilityAccess } from "@/capabilities/capability-access";
import {
  EditWorkspaceDialog,
  WorkspaceAccessDialog,
  type WorkspaceAccessAction,
} from "@/components/tenant-workspace-dialogs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Dialog = "edit" | WorkspaceAccessAction | null;

export function TenantWorkspaceDetail(props: {
  item: DirectoryWorkspaceDetailOut;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation("tenants");
  const capability = useCapabilityAccess("tenant-governance");
  const [workspace, setWorkspace] = useState(props.item);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const suspended = activeRestriction(workspace, "workspace_suspended");
  const archived = activeRestriction(workspace, "workspace_archived");
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value),
    );
  const saved = (next: DirectoryWorkspaceDetailOut, messageKey: string) => {
    setWorkspace(next);
    setResultKey(messageKey);
    props.onChanged();
  };

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-2xl3 font-semibold">{workspace.name}</h2>
          {workspace.description ? (
            <p className="mt-1 text-base text-muted-foreground">{workspace.description}</p>
          ) : null}
        </div>
        <WorkspaceState
          archived={Boolean(workspace.isArchived)}
          active={workspace.isActive !== false}
        />
      </div>

      {resultKey ? (
        <Alert>
          <CheckCircle2 aria-hidden="true" />
          <AlertDescription>{t(resultKey)}</AlertDescription>
        </Alert>
      ) : null}

      <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        <Detail
          label={t("OWNER")}
          value={workspace.owner?.displayName ?? workspace.owner?.username ?? t("UNAVAILABLE")}
        />
        <Detail label={t("PLAN")} value={workspace.commerce.planCode ?? t("COMMERCE_MISSING")} />
        <Detail label={t("MEMBERS")} value={String(workspace.memberCount ?? 0)} />
        <Detail label={t("PROJECTS")} value={String(workspace.projectCount ?? 0)} />
        <Detail label={t("LAST_ACTIVITY")} value={formatDate(workspace.lastActivityAt)} />
        <Detail label={t("LAST_UPDATED")} value={formatDate(workspace.updatedAt)} />
      </dl>

      <Separator />
      <section className="grid gap-3" aria-labelledby="workspace-access-heading">
        <div>
          <h3 className="text-base" id="workspace-access-heading">
            {t("ACCESS_STATE")}
          </h3>
          <p className="text-base text-muted-foreground">{t("ACCESS_STATE_DESCRIPTION")}</p>
        </div>
        {!suspended && !archived ? (
          <div className="flex items-center gap-2 rounded-lg border bg-card p-3 text-base">
            <ShieldCheck
              aria-hidden="true"
              className="size-4 text-emerald-600 dark:text-emerald-400"
            />
            {t("NO_ACTIVE_RESTRICTIONS")}
          </div>
        ) : (
          <div className="grid gap-3">
            {[suspended, archived].filter(Boolean).map((restriction) => (
              <div className="rounded-lg border bg-card p-4" key={restriction!.restrictionId}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">
                    {t(`RESTRICTION_${restriction!.restrictionType.toUpperCase()}`)}
                  </p>
                  <Badge variant="secondary">{t("IN_EFFECT")}</Badge>
                </div>
                <p className="mt-2 text-base">{restriction!.operatorNote}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("EFFECTIVE_SINCE", { date: formatDate(restriction!.effectiveAt) })}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {capability.canManage ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={() => setDialog("edit")} variant="outline">
            <Pencil aria-hidden="true" /> {t("EDIT_WORKSPACE")}
          </Button>
          {suspended ? (
            <Button onClick={() => setDialog("enable")} variant="outline">
              <ShieldCheck aria-hidden="true" /> {t("ENABLE_ACTION")}
            </Button>
          ) : (
            <Button onClick={() => setDialog("disable")} variant="outline">
              <Ban aria-hidden="true" /> {t("DISABLE_ACTION")}
            </Button>
          )}
          {archived ? (
            <Button onClick={() => setDialog("restore")} variant="outline">
              <ArchiveRestore aria-hidden="true" /> {t("RESTORE_ACTION")}
            </Button>
          ) : (
            <Button onClick={() => setDialog("archive")} variant="outline">
              <Archive aria-hidden="true" /> {t("ARCHIVE_ACTION")}
            </Button>
          )}
        </div>
      ) : (
        <p className="rounded-lg border bg-muted p-3 text-base text-muted-foreground">
          {t("MANAGE_PERMISSION_REQUIRED")}
        </p>
      )}

      <Link className="text-primary underline underline-offset-4" to="/monitoring/requests">
        {t("VIEW_RELATED_ACTIVITY")}
      </Link>

      {dialog === "edit" ? (
        <EditWorkspaceDialog
          key={workspace.updatedAt}
          onOpenChange={(open) => !open && setDialog(null)}
          onSaved={saved}
          open
          workspace={workspace}
        />
      ) : null}
      {dialog && dialog !== "edit" ? (
        <WorkspaceAccessDialog
          action={dialog}
          key={`${dialog}-${workspace.updatedAt}`}
          onOpenChange={(open) => !open && setDialog(null)}
          onSaved={saved}
          open
          workspace={workspace}
        />
      ) : null}
    </div>
  );
}

function activeRestriction(
  workspace: DirectoryWorkspaceDetailOut,
  type: "workspace_suspended" | "workspace_archived",
) {
  return workspace.restrictions?.find(
    (restriction) => restriction.restrictionType === type && restriction.state === "active",
  );
}

function WorkspaceState(props: { archived: boolean; active: boolean }) {
  const { t } = useTranslation("tenants");
  const key = props.archived ? "ARCHIVED" : props.active ? "ACTIVE" : "DISABLED";
  return (
    <Badge variant={props.active && !props.archived ? "secondary" : "destructive"}>{t(key)}</Badge>
  );
}

function Detail(props: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{props.label}</dt>
      <dd className="mt-1 text-base">{props.value}</dd>
    </div>
  );
}
