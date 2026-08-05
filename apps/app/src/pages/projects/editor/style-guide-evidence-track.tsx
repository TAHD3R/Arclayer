import type { ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  GitBranch,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { BuilderRevisionOut, DesignSystemValidationFinding } from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import { shortStyleGuideHash } from "@/pages/projects/editor/style-guide-format";
import type { ProjectStyleGuideController } from "@/pages/projects/editor/use-project-style-guide-controller";
import { StyleGuideVersionHistory } from "@/pages/projects/editor/style-guide-version-history";

export function StyleGuideEvidenceTrack({
  revision,
  controller,
}: {
  revision: BuilderRevisionOut;
  controller: ProjectStyleGuideController;
}) {
  const { t } = useTranslation("account");
  const candidateAssigned = Boolean(
    controller.candidateVersion &&
    controller.assignment?.versionId === controller.candidateVersion.id,
  );
  const valid = controller.candidateValidation?.status === "valid";
  return (
    <aside
      className="max-h-[45%] w-full shrink-0 overflow-y-auto border-t border-border bg-card px-5 py-5 xl:max-h-none xl:w-[22rem] xl:border-l xl:border-t-0 xl:py-6"
      aria-label={t("CREATION_EDITOR_STYLE_EVIDENCE_LABEL")}
    >
      <h2 className="text-headline font-semibold text-label-primary">
        {t("CREATION_EDITOR_STYLE_EVIDENCE_TITLE")}
      </h2>
      <p className="mt-1 text-footnote text-label-secondary">
        {t("CREATION_EDITOR_STYLE_EVIDENCE_DESC")}
      </p>
      <div className="mt-6 border-l border-border pl-5">
        <EvidenceStep
          icon={CheckCircle2}
          title={t("CREATION_EDITOR_STYLE_STEP_CANVAS")}
          detail={`v${revision.siteRevision.revisionNumber} · ${shortStyleGuideHash(revision.siteRevision.designSystemManifestChecksum)}`}
          complete
        />
        <EvidenceStep
          icon={controller.assignment?.ownerKind === "project" ? CheckCircle2 : GitBranch}
          title={t("CREATION_EDITOR_STYLE_STEP_PROJECT_FORK")}
          detail={
            controller.assignment?.ownerKind === "project"
              ? t("CREATION_EDITOR_STYLE_STEP_PROJECT_FORK_READY")
              : t("CREATION_EDITOR_STYLE_STEP_PROJECT_FORK_REQUIRED")
          }
          complete={controller.assignment?.ownerKind === "project"}
        />
        <EvidenceStep
          icon={controller.candidateVersion ? CheckCircle2 : CircleDashed}
          title={t("CREATION_EDITOR_STYLE_STEP_CANDIDATE")}
          detail={
            controller.candidateVersion
              ? `v${controller.candidateVersion.versionNumber} · ${shortStyleGuideHash(controller.candidateVersion.manifestChecksum)}`
              : t("CREATION_EDITOR_STYLE_STEP_CANDIDATE_PENDING")
          }
          complete={Boolean(controller.candidateVersion)}
        >
          {controller.candidateVersion && !controller.candidateValidation ? (
            <Button
              className="mt-3 min-h-11 w-full xl:min-h-8"
              size="sm"
              variant="outline"
              loading={controller.validateMutation.isPending}
              disabled={!controller.canWrite || !controller.online}
              onClick={() => controller.validateMutation.mutate()}
            >
              {t("CREATION_EDITOR_STYLE_VALIDATE")}
            </Button>
          ) : null}
        </EvidenceStep>
        <EvidenceStep
          icon={valid ? CheckCircle2 : ShieldCheck}
          title={t("CREATION_EDITOR_STYLE_STEP_VALIDATION")}
          detail={validationDetail(controller, t)}
          complete={valid}
        >
          {controller.candidateValidation?.status === "invalid" ? (
            <ValidationFindings findings={controller.candidateValidation.findings} />
          ) : null}
          {valid && !candidateAssigned ? (
            <Button
              className="mt-3 min-h-11 w-full xl:min-h-8"
              size="sm"
              loading={controller.assignMutation.isPending}
              disabled={!controller.canWrite || !controller.online}
              onClick={() => controller.assignMutation.mutate()}
            >
              {t("CREATION_EDITOR_STYLE_ASSIGN")}
            </Button>
          ) : null}
        </EvidenceStep>
        <EvidenceStep
          icon={controller.assignmentMatchesRevision ? CircleDashed : RefreshCw}
          title={t("CREATION_EDITOR_STYLE_STEP_REFRESH")}
          detail={
            controller.assignmentMatchesRevision
              ? t("CREATION_EDITOR_STYLE_STEP_REFRESH_CURRENT")
              : t("CREATION_EDITOR_STYLE_STEP_REFRESH_REQUIRED")
          }
          complete={controller.assignmentMatchesRevision}
        >
          {!controller.assignmentMatchesRevision && !controller.refreshPreview ? (
            <Button
              className="mt-3 min-h-11 w-full xl:min-h-8"
              size="sm"
              loading={controller.previewRefreshMutation.isPending}
              disabled={!controller.canWrite || !controller.online}
              onClick={() => controller.previewRefreshMutation.mutate()}
            >
              {t("CREATION_EDITOR_STYLE_PREVIEW_REFRESH")}
            </Button>
          ) : null}
          {controller.refreshPreview ? <RefreshReview controller={controller} /> : null}
        </EvidenceStep>
      </div>
      <StyleGuideVersionHistory revision={revision} controller={controller} />
    </aside>
  );
}

function ValidationFindings({ findings }: { findings: DesignSystemValidationFinding[] }) {
  return (
    <ul className="mt-3 divide-y divide-destructive/15 rounded-md border border-destructive/25 bg-destructive/5">
      {findings.map((finding) => (
        <li key={`${finding.code}:${finding.path ?? "root"}`} className="flex gap-2.5 px-3 py-2.5">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-caption leading-5 text-label-primary">{finding.message}</p>
            {finding.path ? (
              <p className="mt-1 break-all font-mono text-caption text-label-secondary">
                {finding.path}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function EvidenceStep(props: {
  icon: typeof Check;
  title: string;
  detail: string;
  complete: boolean;
  children?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <section className="relative pb-7 last:pb-0">
      <span className="absolute -left-[1.83rem] top-0 flex size-5 items-center justify-center rounded-full bg-card ring-4 ring-card">
        <Icon
          className={props.complete ? "size-4 text-positive" : "size-4 text-label-tertiary"}
          aria-hidden="true"
        />
      </span>
      <h3 className="text-footnote font-semibold text-label-primary">{props.title}</h3>
      <p className="mt-1 text-caption leading-5 text-label-secondary tabular-nums">
        {props.detail}
      </p>
      {props.children}
    </section>
  );
}

function RefreshReview({ controller }: { controller: ProjectStyleGuideController }) {
  const { t } = useTranslation("account");
  return (
    <div
      className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3"
      role="region"
      aria-label={t("CREATION_EDITOR_STYLE_REVIEW_LABEL")}
    >
      <p className="text-caption leading-5 text-label-secondary">
        {t("CREATION_EDITOR_STYLE_REVIEW_DESC")}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <Button
          className="min-h-11 xl:min-h-8"
          size="sm"
          loading={controller.applyRefreshMutation.isPending}
          onClick={() => controller.applyRefreshMutation.mutate()}
        >
          {t("CREATION_EDITOR_STYLE_APPLY_REFRESH")}
        </Button>
        <Button
          className="min-h-11 xl:min-h-8"
          size="sm"
          variant="ghost"
          onClick={controller.discardRefreshPreview}
        >
          {t("CREATION_EDITOR_STYLE_DISCARD_REFRESH")}
        </Button>
      </div>
    </div>
  );
}

function validationDetail(
  controller: ProjectStyleGuideController,
  translate: (key: string, values?: Record<string, string | number>) => string,
) {
  const validation = controller.candidateValidation;
  if (!validation) return translate("CREATION_EDITOR_STYLE_STEP_VALIDATION_PENDING");
  return validation.status === "valid"
    ? translate("CREATION_EDITOR_STYLE_STEP_VALIDATION_VALID", {
        hash: shortStyleGuideHash(validation.findingHash),
      })
    : translate("CREATION_EDITOR_STYLE_STEP_VALIDATION_INVALID", {
        count: validation.findings.length,
      });
}
