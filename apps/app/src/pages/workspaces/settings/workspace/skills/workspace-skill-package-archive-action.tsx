import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CircleAlert, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SkillPackageImpactOut } from "@arclayer/openapi";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Separator } from "@arclayer/ui/separator";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import {
  WORKSPACE_SKILLS_QUERY_KEY,
  archiveWorkspaceSkillPackage,
  getWorkspaceSkillPackageImpact,
} from "@/api/workspace-skills";
import { getErrorMessage, notifySuccessText } from "@/lib/notifications";

export function WorkspaceSkillPackageArchiveAction(props: {
  workspaceId: string;
  packageId: string;
  metadataRevision: number;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const archiveKey = useRef("");
  const impactQuery = useQuery({
    queryKey: [
      ...WORKSPACE_SKILLS_QUERY_KEY,
      props.workspaceId,
      "package-impact",
      props.packageId,
      props.metadataRevision,
    ],
    queryFn: ({ signal }) =>
      getWorkspaceSkillPackageImpact(props.workspaceId, props.packageId, signal),
    enabled: open,
  });
  const archiveMutation = useMutation({
    mutationFn: () =>
      archiveWorkspaceSkillPackage(
        props.workspaceId,
        props.packageId,
        impactQuery.data!.metadataRevision,
        archiveKey.current,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACE_SKILLS_QUERY_KEY });
      notifySuccessText(t("settings:SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_SUCCESS"));
      setOpen(false);
    },
  });
  const impact = impactQuery.data;

  return (
    <>
      <Button
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => {
          archiveKey.current = crypto.randomUUID();
          archiveMutation.reset();
          setOpen(true);
        }}
      >
        <Archive data-icon="inline-start" />
        {t("settings:SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_REVIEW_ACTION")}
      </Button>
      <SettingDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!archiveMutation.isPending) setOpen(nextOpen);
        }}
        title={t("settings:SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_TITLE")}
        description={t("settings:SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_DESC")}
        contentClassName="sm:max-w-3xl"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={archiveMutation.isPending}
              onClick={() => setOpen(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              variant="destructive"
              loading={archiveMutation.isPending}
              disabled={!impact?.canArchive}
              onClick={() => archiveMutation.mutate()}
            >
              <Archive data-icon="inline-start" />
              {t("settings:SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_CONFIRM_ACTION")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          {impactQuery.isPending ? (
            <div className="grid gap-3" aria-live="polite">
              <div className="h-32 animate-pulse rounded-lg bg-muted" />
              <p className="text-footnote text-label-secondary">
                {t("settings:SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_LOADING")}
              </p>
            </div>
          ) : null}
          {impactQuery.isError ? (
            <ArchiveError
              message={getErrorMessage(impactQuery.error)}
              retrying={impactQuery.isFetching}
              onRetry={() => void impactQuery.refetch()}
            />
          ) : null}
          {impact ? <PackageImpactReview impact={impact} /> : null}
          {archiveMutation.isError ? (
            <ArchiveError
              message={getErrorMessage(archiveMutation.error)}
              retrying={archiveMutation.isPending}
              onRetry={() => archiveMutation.mutate()}
            />
          ) : null}
        </div>
      </SettingDialog>
    </>
  );
}

function PackageImpactReview({ impact }: { impact: SkillPackageImpactOut }) {
  const { t } = useTranslation("settings");
  const contentMetrics = [
    ["PACKAGE_ARCHIVE_VERSIONS", impact.versionCount],
    ["PACKAGE_ARCHIVE_RESOURCES", impact.resourceCount],
    ["PACKAGE_ARCHIVE_VALIDATIONS", impact.validationCount],
  ] as const;
  const referenceMetrics = [
    ["PACKAGE_ARCHIVE_INSTALLATIONS", impact.installationCount],
    ["PACKAGE_ARCHIVE_AGENT_VERSIONS", impact.agentVersionCount],
    ["PACKAGE_ARCHIVE_ASSIGNMENTS", impact.assignmentCount],
    ["PACKAGE_ARCHIVE_RETAINED_RUNS", impact.retainedRunCount],
    ["PACKAGE_ARCHIVE_GITHUB_OPERATIONS", impact.activeGithubOperationCount],
  ] as const;
  return (
    <>
      <section aria-labelledby="skill-package-content-impact-title">
        <h3 id="skill-package-content-impact-title" className="text-headline text-label-primary">
          {t("SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_CONTENT_TITLE")}
        </h3>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {contentMetrics.map(([key, value]) => (
            <ImpactMetric key={key} label={t(`SETTINGS_WORKSPACE_SKILLS_${key}`)} value={value} />
          ))}
        </div>
      </section>
      <Separator />
      <section aria-labelledby="skill-package-reference-impact-title">
        <h3 id="skill-package-reference-impact-title" className="text-headline text-label-primary">
          {t("SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_REFERENCES_TITLE")}
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {referenceMetrics.map(([key, value]) => (
            <ImpactMetric key={key} label={t(`SETTINGS_WORKSPACE_SKILLS_${key}`)} value={value} />
          ))}
        </div>
      </section>
      <Alert variant={impact.canArchive ? "default" : "destructive"}>
        {impact.canArchive ? (
          <ShieldAlert aria-hidden="true" />
        ) : (
          <CircleAlert aria-hidden="true" />
        )}
        <AlertTitle>
          {t(
            impact.canArchive
              ? "SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_READY_TITLE"
              : "SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_BLOCKED_TITLE",
          )}
        </AlertTitle>
        <AlertDescription>
          {t(
            impact.canArchive
              ? "SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_READY_DESC"
              : "SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_BLOCKED_DESC",
          )}
        </AlertDescription>
      </Alert>
    </>
  );
}

function ImpactMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 p-3">
      <p className="truncate text-caption font-semibold text-label-secondary" title={label}>
        {label}
      </p>
      <p className="mt-2 font-mono text-title2 tabular-nums text-label-primary">{value}</p>
    </div>
  );
}

function ArchiveError(props: { message: string; retrying: boolean; onRetry: () => void }) {
  const { t } = useTranslation(["settings", "common"]);
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{t("settings:SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_ERROR_TITLE")}</AlertTitle>
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
