import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import type {
  BuilderChangeSetPreviewOut,
  BuilderRevisionOut,
  DesignSystemValidationResultOut,
  DesignSystemVersionCreateRequest,
  DesignSystemVersionDetailOut,
  ProjectDesignSystemForkRequest,
} from "@arclayer/openapi";
import {
  PROJECT_DESIGN_SYSTEM_QUERY_KEY,
  createProjectDesignSystemVersion,
  forkProjectDesignSystem,
  getProjectDesignSystemAssignment,
  getProjectDesignSystemVersion,
  setProjectDesignSystemAssignment,
  validateProjectDesignSystemVersion,
} from "@/api/project-design-systems";
import {
  applyProjectBuilderChangeSet,
  buildProjectBuilderQueryKey,
  previewProjectBuilderChangeSet,
} from "@/api/project-builder";
import { getWorkspaceDesignSystemVersion } from "@/api/workspace-design-systems";
import {
  projectStyleGuideHistoryQueryKey,
  useProjectStyleGuideHistory,
} from "@/pages/projects/editor/use-project-style-guide-history";
import { useProjectStyleGuideSupersession } from "@/pages/projects/editor/use-project-style-guide-supersession";
import { useProjectStyleGuideGeneration } from "@/pages/projects/editor/use-project-style-guide-generation";

export type StyleGuideForkInput = Pick<ProjectDesignSystemForkRequest, "name" | "description">;

interface ProjectStyleGuideControllerInput {
  projectId: string;
  workspaceId: string | null;
  revision: BuilderRevisionOut | null;
  enabled: boolean;
  canWrite: boolean;
}

function assignmentQueryKey(projectId: string) {
  return [...PROJECT_DESIGN_SYSTEM_QUERY_KEY, projectId, "assignment"] as const;
}

function requireOnline(online: boolean) {
  if (!online) throw new Error("CREATION_EDITOR_STYLE_OFFLINE");
}

export function useProjectStyleGuideController(input: ProjectStyleGuideControllerInput) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [candidateVersion, setCandidateVersion] = useState<DesignSystemVersionDetailOut | null>(
    null,
  );
  const [candidateValidation, setCandidateValidation] =
    useState<DesignSystemValidationResultOut | null>(null);
  const [refreshPreview, setRefreshPreview] = useState<BuilderChangeSetPreviewOut | null>(null);
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);

  useEffect(() => {
    setCandidateVersion(null);
    setCandidateValidation(null);
    setRefreshPreview(null);
  }, [input.revision?.siteRevision.id]);

  const assignmentQuery = useQuery({
    queryKey: assignmentQueryKey(input.projectId),
    queryFn: ({ signal }) => getProjectDesignSystemAssignment(input.projectId, signal),
    enabled: input.enabled,
    retry: false,
  });
  const assignment = assignmentQuery.data ?? null;
  const generation = useProjectStyleGuideGeneration({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    assignment,
    revision: input.revision,
    enabled: input.enabled,
    canWrite: input.canWrite,
    online,
  });
  const sourceVersionQuery = useQuery({
    queryKey: [
      ...PROJECT_DESIGN_SYSTEM_QUERY_KEY,
      input.projectId,
      "version",
      assignment?.ownerKind,
      assignment?.designSystemId,
      assignment?.versionId,
    ],
    queryFn: ({ signal }) => {
      if (!assignment || !input.workspaceId) {
        throw new Error("CREATION_EDITOR_STYLE_ASSIGNMENT_REQUIRED");
      }
      return assignment.ownerKind === "project"
        ? getProjectDesignSystemVersion(
            input.projectId,
            assignment.designSystemId,
            assignment.versionId,
            signal,
          )
        : getWorkspaceDesignSystemVersion(
            input.workspaceId,
            assignment.designSystemId,
            assignment.versionId,
            signal,
          );
    },
    enabled: input.enabled && Boolean(assignment && input.workspaceId),
    retry: false,
  });
  const history = useProjectStyleGuideHistory({
    projectId: input.projectId,
    systemId: assignment?.ownerKind === "project" ? assignment.designSystemId : null,
    targetVersionId: candidateVersion?.id ?? sourceVersionQuery.data?.id ?? null,
    enabled: input.enabled && assignment?.ownerKind === "project",
  });
  const historyTargetVersion =
    history.versions.find((version) => version.id === history.targetVersionId) ?? null;
  const supersession = useProjectStyleGuideSupersession({
    projectId: input.projectId,
    systemId: assignment?.ownerKind === "project" ? assignment.designSystemId : null,
    systemMetadataRevision: history.systemMetadataRevision,
    replacementVersion: historyTargetVersion,
    enabled: input.enabled && input.canWrite && online && assignment?.ownerKind === "project",
  });

  const forkMutation = useMutation({
    mutationFn: async (values: StyleGuideForkInput) => {
      requireOnline(online);
      if (!assignment || !sourceVersionQuery.data || assignment.ownerKind === "project") {
        throw new Error("CREATION_EDITOR_STYLE_FORK_NOT_AVAILABLE");
      }
      const fork = await forkProjectDesignSystem(
        input.projectId,
        {
          sourceDesignSystemId: assignment.designSystemId,
          sourceVersionId: assignment.versionId,
          expectedSourceChecksum: assignment.manifestChecksum,
          validationFindingHash: assignment.validationFindingHash,
          name: values.name,
          description: values.description,
        },
        `style-guide-fork:${assignment.versionId}`,
      );
      return setProjectDesignSystemAssignment(
        input.projectId,
        {
          designSystemId: fork.designSystemId,
          versionId: fork.versionId,
          expectedManifestChecksum: fork.manifestChecksum,
          validationFindingHash: fork.validationFindingHash,
          expectedRevision: assignment.metadataRevision,
        },
        `style-guide-assign:${fork.versionId}`,
      );
    },
    onSuccess: (result) => {
      queryClient.setQueryData(assignmentQueryKey(input.projectId), result.current);
      setForkDialogOpen(false);
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: (payload: DesignSystemVersionCreateRequest) => {
      requireOnline(online);
      if (!assignment || assignment.ownerKind !== "project" || !sourceVersionQuery.data) {
        throw new Error("CREATION_EDITOR_STYLE_PROJECT_FORK_REQUIRED");
      }
      return createProjectDesignSystemVersion(
        input.projectId,
        assignment.designSystemId,
        payload,
        `style-guide-version:${sourceVersionQuery.data.id}`,
      );
    },
    onSuccess: (version) => {
      setCandidateVersion(version);
      setCandidateValidation(null);
      setRefreshPreview(null);
      setVersionDialogOpen(false);
      void queryClient.invalidateQueries({
        queryKey: projectStyleGuideHistoryQueryKey(input.projectId, version.designSystemId),
      });
    },
  });

  const validateMutation = useMutation({
    mutationFn: () => {
      requireOnline(online);
      if (!candidateVersion) throw new Error("CREATION_EDITOR_STYLE_CANDIDATE_REQUIRED");
      return validateProjectDesignSystemVersion(
        input.projectId,
        candidateVersion.designSystemId,
        candidateVersion.id,
        `style-guide-validate:${candidateVersion.id}`,
      );
    },
    onSuccess: (validation) => {
      setCandidateValidation(validation);
      setCandidateVersion((version) =>
        version
          ? {
              ...version,
              validationStatus: validation.status,
              validationFindingHash: validation.findingHash,
            }
          : version,
      );
      if (candidateVersion) {
        void queryClient.invalidateQueries({
          queryKey: projectStyleGuideHistoryQueryKey(
            input.projectId,
            candidateVersion.designSystemId,
          ),
        });
      }
    },
  });

  const assignMutation = useMutation({
    mutationFn: () => {
      requireOnline(online);
      if (!assignment || !candidateVersion || candidateValidation?.status !== "valid") {
        throw new Error("CREATION_EDITOR_STYLE_VALIDATION_REQUIRED");
      }
      return setProjectDesignSystemAssignment(
        input.projectId,
        {
          designSystemId: candidateVersion.designSystemId,
          versionId: candidateVersion.id,
          expectedManifestChecksum: candidateVersion.manifestChecksum,
          validationFindingHash: candidateValidation.findingHash,
          expectedRevision: assignment.metadataRevision,
        },
        `style-guide-assign:${candidateVersion.id}`,
      );
    },
    onSuccess: (result) => {
      queryClient.setQueryData(assignmentQueryKey(input.projectId), result.current);
      setRefreshPreview(null);
    },
  });

  const previewRefreshMutation = useMutation({
    mutationFn: () => {
      requireOnline(online);
      const revision = input.revision;
      if (!assignment || !revision) throw new Error("CREATION_EDITOR_STYLE_REVISION_REQUIRED");
      return previewProjectBuilderChangeSet(
        input.projectId,
        {
          baseRevisionId: revision.siteRevision.id,
          baseEtag: revision.siteRevision.manifestHash,
          provenanceSource: "human",
          operations: [
            {
              type: "design-system.refresh",
              operationId: "refresh-design-system",
              expectedAssignmentRevision: assignment.metadataRevision,
              designSystemId: assignment.designSystemId,
              versionId: assignment.versionId,
              expectedManifestChecksum: assignment.manifestChecksum,
              validationFindingHash: assignment.validationFindingHash,
            },
          ],
        },
        `style-guide-refresh-preview:${assignment.metadataRevision}`,
      );
    },
    onSuccess: setRefreshPreview,
  });

  const applyRefreshMutation = useMutation({
    mutationFn: () => {
      requireOnline(online);
      if (!refreshPreview) throw new Error("CREATION_EDITOR_STYLE_PREVIEW_REQUIRED");
      return applyProjectBuilderChangeSet(
        input.projectId,
        refreshPreview.changeSetId,
        {
          previewToken: refreshPreview.previewToken,
          approval: refreshPreview.approval
            ? {
                approvalId: refreshPreview.approval.approvalId,
                decision: "approve",
                expectedApprovalClass: refreshPreview.approval.approvalClass,
              }
            : undefined,
        },
        `style-guide-refresh-apply:${refreshPreview.changeSetId}`,
      );
    },
    onSuccess: async () => {
      setCandidateVersion(null);
      setCandidateValidation(null);
      setRefreshPreview(null);
      await queryClient.invalidateQueries({
        queryKey: buildProjectBuilderQueryKey(input.projectId),
      });
    },
  });

  const revisionPin = input.revision?.siteRevision;
  const assignmentMatchesRevision = Boolean(
    assignment &&
    revisionPin &&
    assignment.designSystemId === revisionPin.designSystemId &&
    assignment.versionId === revisionPin.designSystemVersionId &&
    assignment.manifestChecksum === revisionPin.designSystemManifestChecksum,
  );

  useEffect(() => {
    const conceptGeneration = generation.generation;
    if (
      !conceptGeneration ||
      !["partial", "succeeded", "failed", "cancelled"].includes(conceptGeneration.status)
    ) {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: projectStyleGuideHistoryQueryKey(input.projectId, conceptGeneration.designSystemId),
    });
  }, [generation.generation, input.projectId, queryClient]);

  return {
    online,
    assignment,
    assignmentMatchesRevision,
    sourceVersion: sourceVersionQuery.data ?? null,
    candidateVersion,
    candidateValidation,
    refreshPreview,
    history,
    supersession,
    generation,
    forkDialogOpen,
    setForkDialogOpen,
    versionDialogOpen,
    setVersionDialogOpen,
    assignmentQuery,
    sourceVersionQuery,
    forkMutation,
    createVersionMutation,
    validateMutation,
    assignMutation,
    previewRefreshMutation,
    applyRefreshMutation,
    canWrite: input.canWrite,
    reviewGeneratedCandidate: (candidateIndex: number) => {
      const candidate = generation.generation?.candidates.find(
        (item) => item.candidateIndex === candidateIndex,
      );
      if (!candidate) throw new Error("CREATION_EDITOR_STYLE_AI_CANDIDATE_REQUIRED");
      generation.setSelectedCandidateIndex(candidateIndex);
      setCandidateVersion(candidate.version);
      setCandidateValidation(candidate.validation);
      setRefreshPreview(null);
    },
    discardCandidate: () => {
      setCandidateVersion(null);
      setCandidateValidation(null);
      setRefreshPreview(null);
    },
    discardRefreshPreview: () => setRefreshPreview(null),
  };
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function useOnlineStatus() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export type ProjectStyleGuideController = ReturnType<typeof useProjectStyleGuideController>;
