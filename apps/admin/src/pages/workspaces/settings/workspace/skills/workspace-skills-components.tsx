import { useMemo } from "react";
import { Blocks, Check, FileCheck2, PackageCheck, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  SkillInstallationOut,
  SkillPackageSummaryOut,
  SkillValidationResultOut,
  SkillVersionDetailOut,
  SkillVersionSummaryOut,
} from "@arclayer/openapi";
import { Badge } from "@arclayer/ui/badge";
import { cn } from "@arclayer/lib/utils";

type LifecycleState = "complete" | "current" | "pending" | "blocked";

function statusVariant(status: string) {
  if (["valid", "enabled", "active"].includes(status)) return "default" as const;
  if (["warning", "candidate", "disabled"].includes(status)) return "secondary" as const;
  if (["invalid", "quarantined", "failed", "incompatible"].includes(status)) {
    return "destructive" as const;
  }
  return "outline" as const;
}

export function SkillStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("settings");
  return (
    <Badge variant={statusVariant(status)}>
      {t(`SETTINGS_WORKSPACE_SKILLS_STATUS_${status.toUpperCase()}`)}
    </Badge>
  );
}

export function WorkspaceSkillPackageList(props: {
  packages: readonly SkillPackageSummaryOut[];
  installations: readonly SkillInstallationOut[];
  selectedId?: string;
  onSelect: (packageId: string) => void;
}) {
  const { t } = useTranslation("settings");
  const installationIds = useMemo(
    () => new Set(props.installations.map((installation) => installation.packageId)),
    [props.installations],
  );
  return (
    <div className="divide-y">
      {props.packages.map((skillPackage) => {
        const selected = skillPackage.id === props.selectedId;
        return (
          <button
            key={skillPackage.id}
            type="button"
            className={cn(
              "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-100",
              selected ? "bg-primary/6" : "hover:bg-accent/60",
            )}
            aria-current={selected ? "true" : undefined}
            onClick={() => props.onSelect(skillPackage.id)}
          >
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-label-secondary">
              <Blocks className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-footnote font-semibold text-label-primary">
                  {skillPackage.displayName}
                </span>
                {installationIds.has(skillPackage.id) ? (
                  <Badge variant="outline">{t("SETTINGS_WORKSPACE_SKILLS_INSTALLED_BADGE")}</Badge>
                ) : null}
              </span>
              <span className="mt-1 line-clamp-2 text-caption leading-5 text-label-secondary">
                {skillPackage.description}
              </span>
              <span className="mt-2 flex items-center gap-2 text-caption text-label-tertiary">
                <span className="font-mono">{skillPackage.slug}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {t("SETTINGS_WORKSPACE_SKILLS_VERSION_COUNT", {
                    count: skillPackage.versionCount,
                  })}
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function WorkspaceSkillVersionList(props: {
  versions: readonly SkillVersionSummaryOut[];
  selectedId?: string;
  onSelect: (versionId: string) => void;
}) {
  const { t, i18n } = useTranslation("settings");
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    [i18n.language, i18n.resolvedLanguage],
  );
  return (
    <div className="divide-y rounded-lg border">
      {props.versions.map((version) => {
        const selected = version.id === props.selectedId;
        return (
          <button
            key={version.id}
            type="button"
            className={cn(
              "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-100",
              selected ? "bg-primary/6" : "hover:bg-accent/60",
            )}
            aria-current={selected ? "true" : undefined}
            onClick={() => props.onSelect(version.id)}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent font-mono text-caption font-semibold tabular-nums text-label-primary">
              v{version.versionNumber}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-footnote font-semibold text-label-primary">
                  {version.semanticVersion ?? t("SETTINGS_WORKSPACE_SKILLS_SEMANTIC_VERSION_UNSET")}
                </span>
                <SkillStatusBadge status={version.status} />
              </span>
              <span className="mt-1 block text-caption text-label-secondary">
                {formatter.format(new Date(version.createdAt))}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function LifecycleStage(props: {
  icon: typeof FileCheck2;
  label: string;
  value: string;
  state: LifecycleState;
}) {
  const Icon = props.icon;
  return (
    <div className="relative flex min-w-0 flex-1 items-start gap-3 px-4 py-4">
      <span
        className={cn(
          "relative flex size-8 shrink-0 items-center justify-center rounded-full border transition-[background-color,color,border-color] duration-150 motion-reduce:transition-none",
          props.state === "complete" && "border-primary bg-primary text-primary-foreground",
          props.state === "current" && "border-primary bg-primary/10 text-primary",
          props.state === "blocked" && "border-destructive/40 bg-destructive/8 text-destructive",
          props.state === "pending" && "bg-card text-label-tertiary",
        )}
      >
        {props.state === "complete" ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Icon className="size-4" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-caption text-label-secondary">{props.label}</span>
        <span className="mt-1 block truncate text-footnote font-semibold text-label-primary">
          {props.value}
        </span>
      </span>
    </div>
  );
}

export function WorkspaceSkillLifecycleRail(props: {
  version: SkillVersionDetailOut;
  validation?: SkillValidationResultOut;
  installation?: SkillInstallationOut;
}) {
  const { t } = useTranslation("settings");
  const installMatchesVersion = props.installation?.versionId === props.version.id;
  const validationStatus = props.validation?.status;
  const validationBlocked = ["invalid", "quarantined"].includes(validationStatus ?? "");
  const stages = [
    {
      icon: FileCheck2,
      label: t("SETTINGS_WORKSPACE_SKILLS_LIFECYCLE_AUTHORED"),
      value: t("SETTINGS_WORKSPACE_SKILLS_VERSION_NUMBER", {
        version: props.version.versionNumber,
      }),
      state: "complete" as const,
    },
    {
      icon: ShieldCheck,
      label: t("SETTINGS_WORKSPACE_SKILLS_LIFECYCLE_VALIDATED"),
      value: validationStatus
        ? t(`SETTINGS_WORKSPACE_SKILLS_STATUS_${validationStatus.toUpperCase()}`)
        : t("SETTINGS_WORKSPACE_SKILLS_NOT_VALIDATED"),
      state: validationBlocked
        ? ("blocked" as const)
        : validationStatus
          ? ("complete" as const)
          : ("current" as const),
    },
    {
      icon: PackageCheck,
      label: t("SETTINGS_WORKSPACE_SKILLS_LIFECYCLE_INSTALLED"),
      value: installMatchesVersion
        ? t(`SETTINGS_WORKSPACE_SKILLS_STATUS_${props.installation!.status.toUpperCase()}`)
        : props.installation
          ? t("SETTINGS_WORKSPACE_SKILLS_INSTALLED_OTHER_VERSION")
          : t("SETTINGS_WORKSPACE_SKILLS_NOT_INSTALLED"),
      state: installMatchesVersion
        ? ("complete" as const)
        : validationStatus && !validationBlocked
          ? ("current" as const)
          : ("pending" as const),
    },
  ];
  return (
    <div className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-3">
      {stages.map((stage, index) => (
        <div
          key={stage.label}
          className="relative border-b last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
        >
          <LifecycleStage {...stage} />
          {index < stages.length - 1 ? (
            <span
              className="absolute bottom-0 left-8 top-auto h-px w-[calc(100%-2rem)] bg-border sm:bottom-auto sm:left-auto sm:right-0 sm:top-8 sm:h-px sm:w-5 sm:translate-x-1/2"
              aria-hidden="true"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
