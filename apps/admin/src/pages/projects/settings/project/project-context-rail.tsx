import {
  CircleCheck,
  CircleDashed,
  Eye,
  PanelsTopLeft,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Project, ProjectRuntime } from "@arclayer/openapi/admin-types";
import { cn } from "@arclayer/lib/utils";

export type ProjectAccessState = "loading" | "manage" | "read-only" | "error";

type ContextStepState = "ready" | "attention" | "muted";

function ProjectContextStep(props: {
  icon: LucideIcon;
  title: string;
  description: string;
  state: ContextStepState;
  last?: boolean;
}) {
  const Icon = props.icon;
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!props.last ? (
        <span aria-hidden="true" className="absolute bottom-0 left-[15px] top-8 w-px bg-border" />
      ) : null}
      <span
        className={cn(
          "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-card",
          props.state === "ready" && "border-positive/35 text-positive",
          props.state === "attention" && "border-warning/50 text-label-primary",
          props.state === "muted" && "border-border text-label-tertiary",
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 pt-0.5">
        <div className="text-headline font-medium text-label-primary">{props.title}</div>
        <p className="mt-0.5 text-footnote text-label-secondary">{props.description}</p>
      </div>
    </li>
  );
}

function resolveAuthoringCopy(project: Project, t: (key: string) => string) {
  if (project.authoringState === "migration_required") {
    return {
      title: t("account:SETTINGS_PROJECT_AUTHORING_MIGRATION"),
      description: t("account:SETTINGS_PROJECT_AUTHORING_MIGRATION_DESC"),
      state: "attention" as const,
    };
  }
  if (project.authoringMode === "source_managed") {
    return {
      title: t("account:SETTINGS_PROJECT_AUTHORING_SOURCE"),
      description: t("account:SETTINGS_PROJECT_AUTHORING_SOURCE_DESC"),
      state: "ready" as const,
    };
  }
  return {
    title: t("account:SETTINGS_PROJECT_AUTHORING_BUILDER"),
    description: t("account:SETTINGS_PROJECT_AUTHORING_BUILDER_DESC"),
    state: "ready" as const,
  };
}

function resolveAccessCopy(accessState: ProjectAccessState, t: (key: string) => string) {
  switch (accessState) {
    case "manage":
      return {
        icon: ShieldCheck,
        title: t("account:SETTINGS_PROJECT_ACCESS_MANAGE"),
        description: t("account:SETTINGS_PROJECT_ACCESS_MANAGE_DESC"),
        state: "ready" as const,
      };
    case "read-only":
      return {
        icon: Eye,
        title: t("account:SETTINGS_PROJECT_ACCESS_READ_ONLY"),
        description: t("account:SETTINGS_PROJECT_ACCESS_READ_ONLY_DESC"),
        state: "muted" as const,
      };
    case "error":
      return {
        icon: TriangleAlert,
        title: t("account:SETTINGS_PROJECT_ACCESS_ERROR"),
        description: t("account:SETTINGS_PROJECT_ACCESS_ERROR_DESC"),
        state: "attention" as const,
      };
    case "loading":
    default:
      return {
        icon: CircleDashed,
        title: t("account:SETTINGS_PROJECT_ACCESS_CHECKING"),
        description: t("account:SETTINGS_PROJECT_ACCESS_CHECKING_DESC"),
        state: "muted" as const,
      };
  }
}

function resolveRuntimeCopy(
  runtime: ProjectRuntime | null,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (!runtime) {
    return {
      icon: CircleDashed,
      title: t("account:SETTINGS_PROJECT_RUNTIME_UNASSIGNED"),
      description: t("account:SETTINGS_PROJECT_RUNTIME_UNASSIGNED_DESC"),
      state: "muted" as const,
    };
  }
  if (!runtime.isActive) {
    return {
      icon: TriangleAlert,
      title: runtime.name,
      description: t("account:SETTINGS_PROJECT_RUNTIME_INACTIVE_DESC", {
        kind: runtime.kind,
      }),
      state: "attention" as const,
    };
  }
  return {
    icon: CircleCheck,
    title: runtime.name,
    description: t("account:SETTINGS_PROJECT_RUNTIME_ATTACHED_DESC", {
      kind: runtime.kind,
    }),
    state: "ready" as const,
  };
}

export function ProjectContextRail(props: {
  project: Project;
  primaryRuntime: ProjectRuntime | null;
  accessState: ProjectAccessState;
}) {
  const { t } = useTranslation(["account"]);
  const authoring = resolveAuthoringCopy(props.project, t);
  const access = resolveAccessCopy(props.accessState, t);
  const runtime = resolveRuntimeCopy(props.primaryRuntime, t);

  return (
    <aside
      aria-label={t("account:SETTINGS_PROJECT_CONTEXT_TITLE")}
      className="self-start xl:sticky xl:top-[var(--page-sticky-header-height,6rem)]"
    >
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <header>
          <h2 className="text-title3 font-semibold text-label-primary">
            {t("account:SETTINGS_PROJECT_CONTEXT_TITLE")}
          </h2>
          <p className="mt-1 text-footnote text-label-secondary">
            {t("account:SETTINGS_PROJECT_CONTEXT_DESC")}
          </p>
        </header>

        <ol className="mt-5">
          <ProjectContextStep
            icon={props.project.isActive ? CircleCheck : TriangleAlert}
            title={t(
              props.project.isActive
                ? "account:SETTINGS_PROJECT_STATUS_ACTIVE"
                : "account:SETTINGS_PROJECT_STATUS_ARCHIVED",
            )}
            description={t(
              props.project.isActive
                ? "account:SETTINGS_PROJECT_STATUS_ACTIVE_DESC"
                : "account:SETTINGS_PROJECT_STATUS_ARCHIVED_DESC",
            )}
            state={props.project.isActive ? "ready" : "attention"}
          />
          <ProjectContextStep
            icon={authoring.state === "attention" ? TriangleAlert : PanelsTopLeft}
            title={authoring.title}
            description={authoring.description}
            state={authoring.state}
          />
          <ProjectContextStep
            icon={runtime.icon}
            title={runtime.title}
            description={runtime.description}
            state={runtime.state}
          />
          <ProjectContextStep
            icon={access.icon}
            title={access.title}
            description={access.description}
            state={access.state}
            last
          />
        </ol>

        <dl className="mt-5 grid gap-3 border-t border-border pt-4">
          {[
            [t("account:SETTINGS_PROJECT_INTERNAL_SLUG"), props.project.slug],
            [t("account:SETTINGS_PROJECT_INTERNAL_PROJECT_ID"), props.project.id],
            [t("account:SETTINGS_PROJECT_INTERNAL_WORKSPACE_ID"), props.project.workspaceId],
            [
              t("account:SETTINGS_PROJECT_INTERNAL_REVISION"),
              `#${props.project.authoringRevision}`,
            ],
          ].map(([label, value]) => (
            <div key={label} className="grid gap-0.5">
              <dt className="text-caption text-label-tertiary">{label}</dt>
              <dd className="break-all font-mono text-caption tabular-nums text-label-primary">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
