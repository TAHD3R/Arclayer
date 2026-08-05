import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  SkillInstallationOut,
  SkillInstallationRepinRequest,
  SkillManifestV1,
  SkillUpdatePreviewOut,
} from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import {
  WORKSPACE_SKILLS_QUERY_KEY,
  createWorkspaceSkillUpdatePreview,
  repinWorkspaceSkillInstallation,
} from "@/api/workspace-skills";
import { getErrorMessage, notifySuccessText } from "@/lib/notifications";

import {
  DeclarationAcceptance,
  ExactVersionComparison,
  UpdateDiffReview,
  UpdatePreviewLoading,
  UpdateReviewError,
  UpdateRiskSummary,
  type WorkspaceSkillDeclarationReview,
} from "./workspace-skill-update-review";

export type WorkspaceSkillUpdateCandidate = Readonly<{
  id: string;
  versionNumber: number;
  semanticVersion?: string | null;
  packageChecksum: string;
  validationFindingHash: string;
  manifest: SkillManifestV1;
}>;

type ReviewSession = Readonly<{ previewKey: string; repinKey: string }>;

function candidateDeclarations(
  candidate: WorkspaceSkillUpdateCandidate,
): WorkspaceSkillDeclarationReview[] {
  return [
    ...(candidate.manifest.requiredTools ?? []).map((item) => ({
      kind: "tool" as const,
      identity: item.toolId,
      purpose: item.intendedUse,
      detail: item.versionRange,
    })),
    ...(candidate.manifest.permissions ?? []).map((item) => ({
      kind: "permission" as const,
      identity: item.action,
      purpose: item.purpose,
    })),
    ...(candidate.manifest.dataEgress ?? []).map((item) => ({
      kind: "egress" as const,
      identity: item.destination,
      purpose: item.purpose,
      detail: item.dataClasses.join(", "),
    })),
  ];
}

function declarationKey(item: WorkspaceSkillDeclarationReview): string {
  return `${item.kind}:${item.identity}`;
}

export function WorkspaceSkillUpdateAction(props: {
  workspaceId: string;
  installation: SkillInstallationOut;
  candidate: WorkspaceSkillUpdateCandidate;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const declarations = useMemo(() => candidateDeclarations(props.candidate), [props.candidate]);

  const previewMutation = useMutation({
    mutationFn: (review: ReviewSession) =>
      createWorkspaceSkillUpdatePreview(
        props.workspaceId,
        props.installation.id,
        {
          expectedRevision: props.installation.metadataRevision,
          currentVersionId: props.installation.versionId,
          currentPackageChecksum: props.installation.packageChecksum,
          currentValidationFindingHash: props.installation.validationFindingHash,
          candidateVersionId: props.candidate.id,
        },
        review.previewKey,
      ),
  });
  const repinMutation = useMutation({
    mutationFn: ({ preview, key }: { preview: SkillUpdatePreviewOut; key: string }) =>
      repinWorkspaceSkillInstallation(
        props.workspaceId,
        props.installation.id,
        buildRepinRequest(props.installation, props.candidate, preview),
        key,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACE_SKILLS_QUERY_KEY });
      notifySuccessText(t("settings:SETTINGS_WORKSPACE_SKILLS_UPDATE_SUCCESS"));
      setOpen(false);
    },
  });

  const startReview = () => {
    const next = { previewKey: crypto.randomUUID(), repinKey: crypto.randomUUID() };
    setAccepted(new Set());
    setSession(next);
    previewMutation.reset();
    repinMutation.reset();
    setOpen(true);
    previewMutation.mutate(next);
  };
  const retryRepin = () => {
    if (previewMutation.data && session) {
      repinMutation.mutate({ preview: previewMutation.data, key: session.repinKey });
    }
  };
  const allAccepted = declarations.every((item) => accepted.has(declarationKey(item)));
  const preview = previewMutation.data;

  return (
    <>
      <Button variant="outline" onClick={startReview}>
        <RefreshCw data-icon="inline-start" />
        {t("settings:SETTINGS_WORKSPACE_SKILLS_UPDATE_REVIEW_ACTION")}
      </Button>
      <SettingDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!previewMutation.isPending && !repinMutation.isPending) setOpen(nextOpen);
        }}
        title={t("settings:SETTINGS_WORKSPACE_SKILLS_UPDATE_REVIEW_TITLE")}
        description={t("settings:SETTINGS_WORKSPACE_SKILLS_UPDATE_REVIEW_DESC")}
        contentClassName="sm:max-w-3xl"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={previewMutation.isPending || repinMutation.isPending}
              onClick={() => setOpen(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              loading={repinMutation.isPending}
              disabled={!preview || !allAccepted || preview.risk === "incompatible"}
              onClick={retryRepin}
            >
              <ShieldCheck data-icon="inline-start" />
              {t("settings:SETTINGS_WORKSPACE_SKILLS_UPDATE_CONFIRM_ACTION")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          {previewMutation.isPending ? <UpdatePreviewLoading /> : null}
          {previewMutation.isError && session ? (
            <UpdateReviewError
              message={getErrorMessage(previewMutation.error)}
              retrying={previewMutation.isPending}
              onRetry={() => previewMutation.mutate(session)}
            />
          ) : null}
          {preview ? (
            <>
              <ExactVersionComparison preview={preview} />
              <UpdateRiskSummary preview={preview} />
              <UpdateDiffReview preview={preview} />
              <DeclarationAcceptance
                declarations={declarations}
                accepted={accepted}
                keyFor={declarationKey}
                onToggle={(item, checked) => {
                  setAccepted((current) => {
                    const next = new Set(current);
                    const key = declarationKey(item);
                    if (checked) next.add(key);
                    else next.delete(key);
                    return next;
                  });
                }}
              />
            </>
          ) : null}
          {repinMutation.isError ? (
            <UpdateReviewError
              message={getErrorMessage(repinMutation.error)}
              retrying={repinMutation.isPending}
              onRetry={retryRepin}
            />
          ) : null}
        </div>
      </SettingDialog>
    </>
  );
}

function buildRepinRequest(
  installation: SkillInstallationOut,
  candidate: WorkspaceSkillUpdateCandidate,
  preview: SkillUpdatePreviewOut,
): SkillInstallationRepinRequest {
  return {
    previewId: preview.id,
    previewHash: preview.previewHash,
    expectedRevision: preview.expectedRevision,
    currentVersionId: installation.versionId,
    currentPackageChecksum: installation.packageChecksum,
    currentValidationFindingHash: installation.validationFindingHash,
    candidateVersionId: candidate.id,
    candidatePackageChecksum: candidate.packageChecksum,
    candidateValidationFindingHash: candidate.validationFindingHash,
    acceptedRequiredTools: (candidate.manifest.requiredTools ?? []).map((item) => item.toolId),
    acceptedPermissions: (candidate.manifest.permissions ?? []).map((item) => item.action),
    acceptedDataEgress: (candidate.manifest.dataEgress ?? []).map((item) => item.destination),
  };
}
