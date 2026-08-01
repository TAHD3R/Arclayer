import { CircleAlert, Github, LoaderCircle, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SkillGitHubImportAcceptedOut, SkillGitHubImportOut } from "@arclayer/openapi";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Progress } from "@arclayer/ui/progress";

import { SkillStatusBadge } from "./workspace-skills-components";

const progressByStatus: Record<SkillGitHubImportOut["status"], number> = {
  queued: 10,
  fetching: 45,
  persisting: 80,
  succeeded: 100,
  failed: 100,
  cancelled: 100,
};

export function WorkspaceSkillGitHubStatus(props: {
  accepted?: SkillGitHubImportAcceptedOut;
  operation?: SkillGitHubImportOut;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const status = props.operation?.status ?? props.accepted?.status ?? "queued";
  const failed = status === "failed" || status === "cancelled" || props.error;
  const operation = props.operation?.operation ?? props.accepted?.operation ?? "initial";
  const Icon = failed
    ? CircleAlert
    : status === "succeeded"
      ? ShieldCheck
      : props.loading
        ? LoaderCircle
        : Github;
  const importId = props.operation?.id ?? props.accepted?.importId;

  if (!importId) return null;
  return (
    <Alert variant={failed ? "destructive" : "default"} aria-live="polite">
      <Icon
        className={props.loading ? "animate-spin motion-reduce:animate-none" : undefined}
        aria-hidden="true"
      />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        {t(
          operation === "initial"
            ? "settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_IMPORT_PROGRESS_TITLE"
            : "settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REFRESH_PROGRESS_TITLE",
        )}
        <SkillStatusBadge status={status} />
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>
          {props.error
            ? t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_STATUS_ERROR")
            : props.operation?.safeErrorMessage ||
              t(`settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_STATUS_${status.toUpperCase()}`)}
        </span>
        {!failed ? <Progress value={progressByStatus[status]} /> : null}
        {props.error ? (
          <button type="button" className="self-start underline" onClick={props.onRetry}>
            {t("common:RETRY")}
          </button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
