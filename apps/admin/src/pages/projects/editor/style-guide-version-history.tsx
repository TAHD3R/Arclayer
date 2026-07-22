import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  GitCompareArrows,
  GitPullRequestClosed,
  History,
  MonitorDot,
  Pin,
  Replace,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { BuilderRevisionOut, DesignSystemVersionSummaryOut } from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { getErrorMessage } from "@/lib/notifications";
import { shortStyleGuideHash } from "@/pages/projects/editor/style-guide-format";
import { StyleGuideVersionComparison } from "@/pages/projects/editor/style-guide-version-comparison";
import { StyleGuideVersionSupersessionDialog } from "@/pages/projects/editor/style-guide-version-supersession-dialog";
import type { ProjectStyleGuideController } from "@/pages/projects/editor/use-project-style-guide-controller";

export function StyleGuideVersionHistory({
  revision,
  controller,
}: {
  revision: BuilderRevisionOut;
  controller: ProjectStyleGuideController;
}) {
  const { t } = useTranslation("account");

  return (
    <section
      className="mt-7 border-t border-border pt-6"
      aria-labelledby="style-guide-history-title"
    >
      <div className="flex items-start gap-3">
        <History className="mt-0.5 size-4 shrink-0 text-label-secondary" aria-hidden="true" />
        <div className="min-w-0">
          <h2
            id="style-guide-history-title"
            className="text-footnote font-semibold text-label-primary"
          >
            {t("CREATION_EDITOR_STYLE_HISTORY_TITLE")}
          </h2>
          <p className="mt-1 text-caption leading-5 text-label-secondary">
            {t("CREATION_EDITOR_STYLE_HISTORY_DESC")}
          </p>
        </div>
      </div>

      {controller.assignment?.ownerKind !== "project" ? (
        <p className="mt-4 border-l border-border pl-4 text-caption leading-5 text-label-secondary">
          {t("CREATION_EDITOR_STYLE_HISTORY_PROJECT_COPY_REQUIRED")}
        </p>
      ) : (
        <ProjectVersionLineage revision={revision} controller={controller} />
      )}
    </section>
  );
}

function ProjectVersionLineage({
  revision,
  controller,
}: {
  revision: BuilderRevisionOut;
  controller: ProjectStyleGuideController;
}) {
  const { t } = useTranslation("account");
  const history = controller.history;

  if (history.historyQuery.isPending) {
    return (
      <p
        className="mt-4 flex min-h-11 items-center gap-2 text-caption text-label-secondary"
        role="status"
      >
        <CircleDashed className="size-4" aria-hidden="true" />
        {t("CREATION_EDITOR_STYLE_HISTORY_LOADING")}
      </p>
    );
  }
  if (history.historyQuery.error) {
    return (
      <div className="mt-4 border-l border-destructive/40 pl-4" role="alert">
        <p className="text-caption leading-5 text-label-primary">
          {getErrorMessage(history.historyQuery.error)}
        </p>
        <Button
          className="mt-3 min-h-11 xl:min-h-8"
          size="sm"
          variant="outline"
          onClick={() => void history.historyQuery.refetch()}
        >
          {t("CREATION_EDITOR_STYLE_HISTORY_RETRY")}
        </Button>
      </div>
    );
  }
  if (history.versions.length === 0) {
    return (
      <p className="mt-4 border-l border-border pl-4 text-caption leading-5 text-label-secondary">
        {t("CREATION_EDITOR_STYLE_HISTORY_EMPTY")}
      </p>
    );
  }

  return (
    <>
      <ol className="mt-4 border-l border-border pl-4">
        {history.versions.map((version) => {
          const isAssigned = controller.assignment?.versionId === version.id;
          const isCanvas =
            revision.siteRevision.designSystemId === version.designSystemId &&
            revision.siteRevision.designSystemVersionId === version.id;
          const replacement = history.versions.find(
            (candidate) => candidate.id === history.targetVersionId,
          );
          const supersededBy = history.versions.find(
            (candidate) => candidate.id === version.supersededByVersionId,
          );
          return (
            <VersionLineageItem
              key={version.id}
              version={version}
              isAssigned={isAssigned}
              isCanvas={isCanvas}
              isTarget={history.targetVersionId === version.id}
              canSupersede={canSupersedeVersion({
                version,
                replacement,
                isAssigned,
                isCanvas,
                canWrite: controller.canWrite,
                online: controller.online,
                systemMetadataRevision: history.systemMetadataRevision,
              })}
              supersededByVersionNumber={supersededBy?.versionNumber ?? null}
              onCompare={() => history.selectComparisonVersion(version.id)}
              onSupersede={() => controller.supersession.open(version)}
            />
          );
        })}
      </ol>
      {history.historyQuery.hasNextPage ? (
        <Button
          className="mt-3 min-h-11 w-full xl:min-h-8"
          size="sm"
          variant="ghost"
          loading={history.historyQuery.isFetchingNextPage}
          onClick={() => void history.historyQuery.fetchNextPage()}
        >
          {t("CREATION_EDITOR_STYLE_HISTORY_LOAD_MORE")}
        </Button>
      ) : null}
      <StyleGuideVersionComparison controller={controller} />
      <StyleGuideVersionSupersessionDialog controller={controller} />
    </>
  );
}

function VersionLineageItem(props: {
  version: DesignSystemVersionSummaryOut;
  isAssigned: boolean;
  isCanvas: boolean;
  isTarget: boolean;
  canSupersede: boolean;
  supersededByVersionNumber: number | null;
  onCompare: () => void;
  onSupersede: () => void;
}) {
  const { t } = useTranslation("account");
  const dateTime = useAdminDateTimeFormatter();
  const content = (
    <>
      <span className="absolute -left-[1.3rem] top-4 size-2 rounded-full bg-border ring-4 ring-card" />
      <span className="flex items-center justify-between gap-3">
        <span className="font-mono text-footnote font-semibold text-label-primary tabular-nums">
          v{props.version.versionNumber}
        </span>
        <VersionLifecycleStatus status={props.version.lifecycleStatus} />
      </span>
      <span className="mt-1 block text-caption leading-5 text-label-secondary">
        {props.version.source === "fork"
          ? t("CREATION_EDITOR_STYLE_HISTORY_WORKSPACE_BASELINE")
          : t("CREATION_EDITOR_STYLE_HISTORY_PROJECT_VERSION")}
      </span>
      {props.version.lifecycleStatus === "superseded" ? (
        <span className="mt-1 block text-caption leading-5 text-label-secondary">
          {props.supersededByVersionNumber === null
            ? t("CREATION_EDITOR_STYLE_HISTORY_SUPERSEDED_REPLACEMENT")
            : t("CREATION_EDITOR_STYLE_HISTORY_SUPERSEDED_BY", {
                version: props.supersededByVersionNumber,
              })}
        </span>
      ) : null}
      <span className="mt-1 block font-mono text-caption text-label-tertiary tabular-nums">
        {shortStyleGuideHash(props.version.manifestChecksum)} ·{" "}
        {dateTime.formatDateTime(props.version.createdAt)}
      </span>
      <VersionMarkers {...props} />
    </>
  );

  return (
    <li className="relative pb-3 last:pb-0">
      {props.isTarget ? (
        <div className="rounded-lg bg-muted/55 px-3 py-3">{content}</div>
      ) : (
        <div className="group rounded-lg px-3 py-3 transition-[background-color,color] hover:bg-muted/45 motion-reduce:transition-none">
          {content}
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              className="flex min-h-11 items-center gap-1 text-caption font-medium text-label-secondary transition-colors hover:text-label-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 xl:min-h-8 motion-reduce:transition-none"
              aria-label={t("CREATION_EDITOR_STYLE_HISTORY_COMPARE_ACTION", {
                version: props.version.versionNumber,
              })}
              onClick={props.onCompare}
            >
              {t("CREATION_EDITOR_STYLE_HISTORY_COMPARE")}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>
            {props.canSupersede ? (
              <button
                type="button"
                className="flex min-h-11 items-center gap-1 text-caption font-medium text-label-secondary transition-colors hover:text-label-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 xl:min-h-8 motion-reduce:transition-none"
                aria-label={t("CREATION_EDITOR_STYLE_HISTORY_SUPERSEDE_ACTION", {
                  version: props.version.versionNumber,
                })}
                onClick={props.onSupersede}
              >
                <Replace className="size-3.5" aria-hidden="true" />
                {t("CREATION_EDITOR_STYLE_HISTORY_SUPERSEDE")}
              </button>
            ) : null}
          </span>
        </div>
      )}
    </li>
  );
}

function VersionLifecycleStatus({
  status,
}: {
  status: DesignSystemVersionSummaryOut["lifecycleStatus"];
}) {
  const { t } = useTranslation("account");
  if (status === "valid") {
    return (
      <span className="flex items-center gap-1 text-caption text-positive">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {t("CREATION_EDITOR_STYLE_HISTORY_VALID")}
      </span>
    );
  }
  if (status === "invalid") {
    return (
      <span className="flex items-center gap-1 text-caption text-destructive">
        <CircleAlert className="size-3.5" aria-hidden="true" />
        {t("CREATION_EDITOR_STYLE_HISTORY_INVALID")}
      </span>
    );
  }
  if (status === "superseded") {
    return (
      <span className="flex items-center gap-1 text-caption text-label-secondary">
        <GitPullRequestClosed className="size-3.5" aria-hidden="true" />
        {t("CREATION_EDITOR_STYLE_HISTORY_SUPERSEDED")}
      </span>
    );
  }
  if (status === "archived") {
    return (
      <span className="flex items-center gap-1 text-caption text-label-tertiary">
        <CircleDashed className="size-3.5" aria-hidden="true" />
        {t("CREATION_EDITOR_STYLE_HISTORY_ARCHIVED")}
      </span>
    );
  }
  if (status === "published") {
    return (
      <span className="flex items-center gap-1 text-caption text-positive">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {t("CREATION_EDITOR_STYLE_HISTORY_PUBLISHED")}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-caption text-label-tertiary">
      <CircleDashed className="size-3.5" aria-hidden="true" />
      {t("CREATION_EDITOR_STYLE_HISTORY_UNVALIDATED")}
    </span>
  );
}

function canSupersedeVersion(input: {
  version: DesignSystemVersionSummaryOut;
  replacement: DesignSystemVersionSummaryOut | undefined;
  isAssigned: boolean;
  isCanvas: boolean;
  canWrite: boolean;
  online: boolean;
  systemMetadataRevision: number | null;
}) {
  return Boolean(
    input.canWrite &&
    input.online &&
    input.systemMetadataRevision !== null &&
    !input.isAssigned &&
    !input.isCanvas &&
    input.version.lifecycleStatus === "valid" &&
    input.replacement &&
    input.replacement.id !== input.version.id &&
    input.replacement.versionNumber > input.version.versionNumber &&
    input.replacement.lifecycleStatus === "valid" &&
    input.replacement.validationStatus === "valid",
  );
}

function VersionMarkers(props: { isAssigned: boolean; isCanvas: boolean; isTarget: boolean }) {
  const { t } = useTranslation("account");
  return (
    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption text-label-secondary">
      {props.isCanvas ? (
        <span className="flex items-center gap-1">
          <MonitorDot className="size-3.5" aria-hidden="true" />
          {t("CREATION_EDITOR_STYLE_HISTORY_CANVAS")}
        </span>
      ) : null}
      {props.isAssigned ? (
        <span className="flex items-center gap-1">
          <Pin className="size-3.5" aria-hidden="true" />
          {t("CREATION_EDITOR_STYLE_HISTORY_ASSIGNED")}
        </span>
      ) : null}
      {props.isTarget ? (
        <span className="flex items-center gap-1">
          <GitCompareArrows className="size-3.5" aria-hidden="true" />
          {t("CREATION_EDITOR_STYLE_HISTORY_REVIEW_TARGET")}
        </span>
      ) : null}
    </span>
  );
}
