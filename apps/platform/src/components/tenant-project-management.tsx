import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ban, CheckCircle2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  AccessRestrictionAdminOut,
  DirectoryProjectDetailOut,
  DirectoryProjectOperationsOut,
} from "@arclayer/platform-openapi";

import {
  disableTenantProject,
  enableTenantProject,
  getTenantProjectOperations,
} from "@/api/tenant-directory";
import { useCapabilityAccess } from "@/capabilities/capability-access";
import { TenantAccessRestrictionDialog } from "@/components/tenant-directory-mutation-dialogs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Dialog = "disable" | "enable" | null;
type OperationsState =
  | Readonly<{ type: "loading" }>
  | Readonly<{ type: "ready"; operations: DirectoryProjectOperationsOut }>
  | Readonly<{ type: "error" }>;

export function TenantProjectDossier(props: {
  item: DirectoryProjectDetailOut;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation("tenants");
  const capability = useCapabilityAccess("tenant-governance");
  const [project, setProject] = useState(props.item);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [resultKey, setResultKey] = useState<string | null>(null);
  const [operationsRevision, setOperationsRevision] = useState(0);
  const restriction = activeRestriction(project);
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value),
    );
  const saved = (next: DirectoryProjectDetailOut, messageKey: string) => {
    setProject(next);
    setResultKey(messageKey);
    setOperationsRevision((current) => current + 1);
    props.onChanged();
  };

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-semibold">{project.name}</h2>
          <p className="mt-1 truncate text-base text-muted-foreground">{project.slug}</p>
        </div>
        <ProjectState active={project.isActive !== false} />
      </div>

      {project.description ? (
        <p className="text-base text-muted-foreground">{project.description}</p>
      ) : null}
      {resultKey ? (
        <Alert>
          <CheckCircle2 aria-hidden="true" />
          <AlertDescription>{t(resultKey)}</AlertDescription>
        </Alert>
      ) : null}

      <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        <Detail label={t("WORKSPACE")} value={project.workspaceName} />
        <Detail
          label={t("OWNER")}
          value={project.owner?.displayName ?? project.owner?.username ?? t("UNAVAILABLE")}
        />
        <Detail label={t("MEMBERS")} value={String(project.memberCount ?? 0)} />
        <Detail
          label={t("RUNTIME")}
          value={t(`RUNTIME_${project.operations.health.toUpperCase()}`)}
        />
        <Detail label={t("LAST_ACTIVITY")} value={formatDate(project.lastActivityAt)} />
        <Detail label={t("LAST_UPDATED")} value={formatDate(project.updatedAt)} />
      </dl>

      <Separator />
      <ProjectOperationsPanel projectId={project.projectId} revision={operationsRevision} />

      <Separator />
      <section className="grid gap-3" aria-labelledby="project-access-heading">
        <div>
          <h3 className="text-base" id="project-access-heading">
            {t("PROJECT_ACCESS_STATE")}
          </h3>
          <p className="text-base text-muted-foreground">{t("PROJECT_ACCESS_STATE_DESCRIPTION")}</p>
        </div>
        {restriction ? (
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{t("RESTRICTION_PROJECT_SUSPENDED")}</p>
              <Badge variant="destructive">{t("IN_EFFECT")}</Badge>
            </div>
            <p className="mt-2 text-base">{restriction.operatorNote}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("EFFECTIVE_SINCE", { date: formatDate(restriction.effectiveAt) })}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border bg-card p-3 text-base">
            <ShieldCheck
              aria-hidden="true"
              className="size-4 text-emerald-600 dark:text-emerald-400"
            />
            {t("PROJECT_NO_ACTIVE_RESTRICTIONS")}
          </div>
        )}
      </section>

      {capability.canManage ? (
        restriction ? (
          <Button onClick={() => setDialog("enable")} variant="outline">
            <ShieldCheck aria-hidden="true" /> {t("ENABLE_ACTION")}
          </Button>
        ) : (
          <Button onClick={() => setDialog("disable")} variant="outline">
            <Ban aria-hidden="true" /> {t("DISABLE_ACTION")}
          </Button>
        )
      ) : null}

      <Link
        className="text-primary underline underline-offset-4"
        search={{ projectId: project.projectId }}
        to="/monitoring/audit"
      >
        {t("VIEW_RELATED_ACTIVITY")}
      </Link>

      {dialog === "disable" || dialog === "enable" ? (
        <TenantAccessRestrictionDialog
          action={dialog}
          activeRestriction={restriction}
          key={`${dialog}-${project.updatedAt}`}
          onEnforce={(body, idempotencyKey) =>
            disableTenantProject(project.projectId, body, idempotencyKey)
          }
          onLift={(body, idempotencyKey) =>
            enableTenantProject(project.projectId, body, idempotencyKey)
          }
          onOpenChange={(open) => !open && setDialog(null)}
          onSaved={(next) =>
            saved(next, dialog === "disable" ? "PROJECT_DISABLED" : "PROJECT_ENABLED")
          }
          open
          subject="PROJECT"
          subjectName={project.name}
        />
      ) : null}
    </div>
  );
}

function ProjectOperationsPanel(props: { projectId: string; revision: number }) {
  const { t } = useTranslation("tenants");
  const [state, setState] = useState<OperationsState>({ type: "loading" });
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    let current = true;
    setState({ type: "loading" });
    void getTenantProjectOperations(props.projectId).then(
      (operations) => current && setState({ type: "ready", operations }),
      () => current && setState({ type: "error" }),
    );
    return () => {
      current = false;
    };
  }, [props.projectId, props.revision, retryRevision]);

  return (
    <section className="grid gap-3" aria-labelledby="project-operations-heading">
      <div>
        <h3 className="text-base" id="project-operations-heading">
          {t("PROJECT_OPERATIONS")}
        </h3>
        <p className="text-base text-muted-foreground">{t("PROJECT_OPERATIONS_DESCRIPTION")}</p>
      </div>
      {state.type === "loading" ? (
        <p className="rounded-lg border bg-card p-3 text-base text-muted-foreground" role="status">
          {t("PROJECT_OPERATIONS_LOADING")}
        </p>
      ) : null}
      {state.type === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>{t("PROJECT_OPERATIONS_ERROR_TITLE")}</AlertTitle>
          <AlertDescription className="grid gap-3">
            <span>{t("PROJECT_OPERATIONS_ERROR_DESCRIPTION")}</span>
            <span>
              <Button
                onClick={() => setRetryRevision((current) => current + 1)}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("REFRESH")}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}
      {state.type === "ready" ? <ProjectOperationsSummary operations={state.operations} /> : null}
    </section>
  );
}

function ProjectOperationsSummary(props: { operations: DirectoryProjectOperationsOut }) {
  const { t, i18n } = useTranslation("tenants");
  const primaryDomain =
    props.operations.domains.find((domain) => domain.isPrimary) ?? props.operations.domains[0];
  const activeRelease =
    props.operations.releases.find((release) => release.isActive) ?? props.operations.releases[0];
  const collectedAt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(props.operations.collectedAt));
  return (
    <dl className="grid gap-x-5 gap-y-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
      <Detail
        label={t("RUNTIME")}
        value={props.operations.runtime?.name ?? t("RUNTIME_UNAVAILABLE")}
      />
      <Detail
        label={t("RUNTIME_STATE")}
        value={t(`RUNTIME_STATE_${props.operations.runtimeState.toUpperCase()}`)}
      />
      <Detail label={t("ENVIRONMENTS")} value={String(props.operations.environments.length)} />
      <Detail label={t("DEPLOYMENTS")} value={String(props.operations.deployments.length)} />
      <Detail label={t("DOMAINS")} value={primaryDomain?.hostname ?? t("UNAVAILABLE")} />
      <Detail
        label={t("DOMAIN_STATE")}
        value={
          primaryDomain
            ? t(primaryDomain.isVerified ? "DOMAIN_VERIFIED" : "DOMAIN_UNVERIFIED")
            : t("UNAVAILABLE")
        }
      />
      <Detail
        label={t("ACTIVE_RELEASE")}
        value={
          activeRelease
            ? t("RELEASE_NUMBER", { number: activeRelease.releaseNumber })
            : t("UNAVAILABLE")
        }
      />
      <Detail label={t("MEMBERS")} value={String(props.operations.memberTotal)} />
      <Detail label={t("STATUS")} value={t(`RUNTIME_${props.operations.health.toUpperCase()}`)} />
      <Detail label={t("PROJECT_OPERATIONS_COLLECTED_AT")} value={collectedAt} />
    </dl>
  );
}

function activeRestriction(project: DirectoryProjectDetailOut): AccessRestrictionAdminOut | null {
  return (
    project.restrictions?.find(
      (restriction) =>
        restriction.restrictionType === "project_suspended" && restriction.state === "active",
    ) ?? null
  );
}

function ProjectState(props: { active: boolean }) {
  const { t } = useTranslation("tenants");
  return (
    <Badge variant={props.active ? "secondary" : "destructive"}>
      {t(props.active ? "ACTIVE" : "INACTIVE")}
    </Badge>
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
