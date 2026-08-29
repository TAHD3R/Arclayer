import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, ShieldAlert, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SkillInstallationImpactOut, SkillInstallationOut } from "@arclayer/openapi";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import {
  WORKSPACE_SKILLS_QUERY_KEY,
  getWorkspaceSkillInstallationImpact,
  removeWorkspaceSkillInstallation,
} from "@/api/workspace-skills";
import { getErrorMessage, notifySuccessText } from "@/lib/notifications";

export function WorkspaceSkillRemovalAction(props: {
  workspaceId: string;
  installation: SkillInstallationOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const removalKey = useRef("");
  const impactQuery = useQuery({
    queryKey: [
      ...WORKSPACE_SKILLS_QUERY_KEY,
      props.workspaceId,
      "installation-impact",
      props.installation.id,
      props.installation.metadataRevision,
    ],
    queryFn: ({ signal }) =>
      getWorkspaceSkillInstallationImpact(props.workspaceId, props.installation.id, signal),
    enabled: props.open,
  });
  const removeMutation = useMutation({
    mutationFn: () =>
      removeWorkspaceSkillInstallation(
        props.workspaceId,
        props.installation.id,
        impactQuery.data!.metadataRevision,
        removalKey.current,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACE_SKILLS_QUERY_KEY });
      notifySuccessText(t("settings:SETTINGS_WORKSPACE_SKILLS_REMOVE_SUCCESS"));
      props.onOpenChange(false);
    },
  });

  // Each opening of the review dialog targets a distinct installation state, so
  // the idempotency key must be fresh per session.
  useEffect(() => {
    if (!props.open) return;
    removalKey.current = crypto.randomUUID();
    removeMutation.reset();
  }, [removeMutation, props.open]);
  const impact = impactQuery.data;

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(nextOpen) => {
        if (!removeMutation.isPending) props.onOpenChange(nextOpen);
      }}
      title={t("settings:SETTINGS_WORKSPACE_SKILLS_REMOVE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_SKILLS_REMOVE_DESC")}
      footer={
        <>
          <Button
            variant="ghost"
            disabled={removeMutation.isPending}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            variant="destructive"
            loading={removeMutation.isPending}
            disabled={!impact?.canRemove}
            onClick={() => removeMutation.mutate()}
          >
            <Trash2 data-icon="inline-start" />
            {t("settings:SETTINGS_WORKSPACE_SKILLS_REMOVE_CONFIRM_ACTION")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {impactQuery.isPending ? (
          <div className="grid gap-3" aria-live="polite">
            <div className="h-28 animate-pulse rounded-lg bg-muted" />
            <p className="text-footnote text-label-secondary">
              {t("settings:SETTINGS_WORKSPACE_SKILLS_REMOVE_LOADING")}
            </p>
          </div>
        ) : null}
        {impactQuery.isError ? (
          <ImpactError
            message={getErrorMessage(impactQuery.error)}
            retrying={impactQuery.isFetching}
            onRetry={() => void impactQuery.refetch()}
          />
        ) : null}
        {impact ? <ImpactReview impact={impact} /> : null}
        {removeMutation.isError ? (
          <ImpactError
            message={getErrorMessage(removeMutation.error)}
            retrying={removeMutation.isPending}
            onRetry={() => removeMutation.mutate()}
          />
        ) : null}
      </div>
    </SettingDialog>
  );
}

function ImpactReview({ impact }: { impact: SkillInstallationImpactOut }) {
  const { t } = useTranslation("settings");
  const metrics = [
    {
      label: t("SETTINGS_WORKSPACE_SKILLS_REMOVE_AGENT_VERSIONS"),
      value: impact.agentVersionCount,
      detail: t("SETTINGS_WORKSPACE_SKILLS_REMOVE_AGENT_VERSIONS_DETAIL", {
        count: impact.publishedAgentVersionCount,
      }),
    },
    {
      label: t("SETTINGS_WORKSPACE_SKILLS_REMOVE_ASSIGNMENTS"),
      value: impact.assignmentCount,
      detail: t("SETTINGS_WORKSPACE_SKILLS_REMOVE_ASSIGNMENTS_DETAIL", {
        count: impact.enabledAssignmentCount,
      }),
    },
    {
      label: t("SETTINGS_WORKSPACE_SKILLS_REMOVE_RETAINED_RUNS"),
      value: impact.retainedRunCount,
      detail: t("SETTINGS_WORKSPACE_SKILLS_REMOVE_RETAINED_RUNS_DETAIL"),
    },
  ];
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border bg-muted/20 p-4">
            <p className="text-caption font-semibold text-label-secondary">{metric.label}</p>
            <p className="mt-2 font-mono text-title2 tabular-nums text-label-primary">
              {metric.value}
            </p>
            <p className="mt-2 text-caption text-label-tertiary">{metric.detail}</p>
          </div>
        ))}
      </div>
      <Alert variant={impact.canRemove ? "default" : "destructive"}>
        {impact.canRemove ? <ShieldAlert aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
        <AlertTitle>
          {t(
            impact.canRemove
              ? "SETTINGS_WORKSPACE_SKILLS_REMOVE_READY_TITLE"
              : "SETTINGS_WORKSPACE_SKILLS_REMOVE_BLOCKED_TITLE",
          )}
        </AlertTitle>
        <AlertDescription>
          {t(
            impact.canRemove
              ? "SETTINGS_WORKSPACE_SKILLS_REMOVE_READY_DESC"
              : "SETTINGS_WORKSPACE_SKILLS_REMOVE_BLOCKED_DESC",
          )}
        </AlertDescription>
      </Alert>
    </>
  );
}

function ImpactError(props: { message: string; retrying: boolean; onRetry: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{t("settings:SETTINGS_WORKSPACE_SKILLS_REMOVE_ERROR_TITLE")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{props.message}</span>
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          loading={props.retrying}
          onClick={props.onRetry}
        >
          {t("common:RETRY")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
