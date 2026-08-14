import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type {
  SkillInstallationCreateRequest,
  SkillGitHubImportAcceptedOut,
  SkillGitHubImportCreateRequest,
  SkillPackageCreateRequest,
  SkillValidationResultOut,
  SkillVersionCreateRequest,
} from "@arclayer/openapi";
import {
  WORKSPACE_SKILLS_QUERY_KEY,
  createWorkspaceSkillGitHubImport,
  createWorkspaceSkillGitHubRefresh,
  createWorkspaceSkillInstallation,
  createWorkspaceSkillPackage,
  createWorkspaceSkillZipImport,
  createWorkspaceSkillVersion,
  getWorkspaceSkillPackage,
  getWorkspaceSkillGitHubImport,
  getWorkspaceSkillVersion,
  getWorkspaceSkillsCapabilities,
  listWorkspaceSkillInstallations,
  listWorkspaceSkillPackages,
  listWorkspaceSkillValidationResults,
  listWorkspaceSkillVersions,
  updateWorkspaceSkillInstallation,
  validateWorkspaceSkillVersion,
} from "@/api/workspace-skills";
import {
  notifyError,
  notifyErrorText,
  notifyInfoText,
  notifySuccessText,
} from "@/lib/notifications";

export type WorkspaceSkillDialog = "manual" | "import" | "version" | "install" | null;

function latestValidation(results: readonly SkillValidationResultOut[]) {
  return [...results].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )[0];
}

export function useWorkspaceSkillsController(workspaceId: string) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<WorkspaceSkillDialog>(null);
  const [githubOperation, setGitHubOperation] = useState<SkillGitHubImportAcceptedOut | null>(null);
  const handledGitHubOperation = useRef<string | null>(null);

  const capabilitiesQuery = useQuery({
    queryKey: [...WORKSPACE_SKILLS_QUERY_KEY, workspaceId, "capabilities"],
    queryFn: ({ signal }) => getWorkspaceSkillsCapabilities(workspaceId, signal),
  });
  const packagesQuery = useQuery({
    queryKey: [...WORKSPACE_SKILLS_QUERY_KEY, workspaceId, "packages", deferredSearch],
    queryFn: ({ signal }) =>
      listWorkspaceSkillPackages(workspaceId, {
        q: deferredSearch || undefined,
        limit: 100,
        signal,
      }),
  });
  const installationsQuery = useQuery({
    queryKey: [...WORKSPACE_SKILLS_QUERY_KEY, workspaceId, "installations"],
    queryFn: ({ signal }) => listWorkspaceSkillInstallations(workspaceId, { limit: 100, signal }),
  });
  const githubImportQuery = useQuery({
    queryKey: [
      ...WORKSPACE_SKILLS_QUERY_KEY,
      workspaceId,
      "github-import",
      githubOperation?.importId,
    ],
    queryFn: ({ signal }) =>
      getWorkspaceSkillGitHubImport(workspaceId, githubOperation!.importId, signal),
    enabled: Boolean(githubOperation?.importId),
    refetchInterval: (query) => {
      const status = query.state.data?.status ?? githubOperation?.status;
      return status && ["queued", "fetching", "persisting"].includes(status) ? 1_500 : false;
    },
  });

  const packages = packagesQuery.data?.items ?? [];
  const installations = installationsQuery.data?.items ?? [];
  const selectedPackage =
    packages.find((skillPackage) => skillPackage.id === selectedPackageId) ?? packages[0];

  useEffect(() => {
    if (!selectedPackage) {
      setSelectedPackageId(null);
      setSelectedVersionId(null);
      return;
    }
    if (selectedPackage.id !== selectedPackageId) {
      setSelectedPackageId(selectedPackage.id);
      setSelectedVersionId(null);
    }
  }, [selectedPackage, selectedPackageId]);

  const packageQuery = useQuery({
    queryKey: [...WORKSPACE_SKILLS_QUERY_KEY, workspaceId, "package", selectedPackage?.id],
    queryFn: ({ signal }) => getWorkspaceSkillPackage(workspaceId, selectedPackage!.id, signal),
    enabled: Boolean(selectedPackage),
  });
  const versionsQuery = useQuery({
    queryKey: [...WORKSPACE_SKILLS_QUERY_KEY, workspaceId, "versions", selectedPackage?.id],
    queryFn: ({ signal }) =>
      listWorkspaceSkillVersions(workspaceId, selectedPackage!.id, { limit: 100, signal }),
    enabled: Boolean(selectedPackage),
  });
  const versions = versionsQuery.data?.items ?? [];
  const selectedVersion =
    versions.find((version) => version.id === selectedVersionId) ?? versions[0];

  useEffect(() => {
    if (!selectedVersion) {
      setSelectedVersionId(null);
      return;
    }
    if (selectedVersion.id !== selectedVersionId) setSelectedVersionId(selectedVersion.id);
  }, [selectedVersion, selectedVersionId]);

  const versionQuery = useQuery({
    queryKey: [
      ...WORKSPACE_SKILLS_QUERY_KEY,
      workspaceId,
      "version",
      selectedPackage?.id,
      selectedVersion?.id,
    ],
    queryFn: ({ signal }) =>
      getWorkspaceSkillVersion(workspaceId, selectedPackage!.id, selectedVersion!.id, signal),
    enabled: Boolean(selectedPackage && selectedVersion),
  });
  const validationsQuery = useQuery({
    queryKey: [
      ...WORKSPACE_SKILLS_QUERY_KEY,
      workspaceId,
      "validations",
      selectedPackage?.id,
      selectedVersion?.id,
    ],
    queryFn: ({ signal }) =>
      listWorkspaceSkillValidationResults(
        workspaceId,
        selectedPackage!.id,
        selectedVersion!.id,
        signal,
      ),
    enabled: Boolean(selectedPackage && selectedVersion),
  });

  const validation = latestValidation(validationsQuery.data ?? []);
  const installation = installations.find(
    (candidate) => candidate.packageId === selectedPackage?.id,
  );
  const invalidate = () => queryClient.invalidateQueries({ queryKey: WORKSPACE_SKILLS_QUERY_KEY });

  useEffect(() => {
    const operation = githubImportQuery.data;
    if (!operation || handledGitHubOperation.current === operation.id) return;
    if (!["succeeded", "failed", "cancelled"].includes(operation.status)) return;
    handledGitHubOperation.current = operation.id;
    if (operation.status === "succeeded") {
      if (!operation.packageId || !operation.versionId) {
        notifyErrorText(t("SETTINGS_WORKSPACE_SKILLS_GITHUB_RESULT_INVALID"));
        return;
      }
      setSelectedPackageId(operation.packageId);
      setSelectedVersionId(operation.versionId);
      void queryClient.invalidateQueries({ queryKey: WORKSPACE_SKILLS_QUERY_KEY });
      notifySuccessText(
        t(
          operation.operation === "initial"
            ? "SETTINGS_WORKSPACE_SKILLS_GITHUB_IMPORTED"
            : "SETTINGS_WORKSPACE_SKILLS_GITHUB_REFRESHED",
        ),
      );
      return;
    }
    notifyErrorText(
      operation.safeErrorMessage ?? t("SETTINGS_WORKSPACE_SKILLS_GITHUB_STATUS_FAILED"),
    );
  }, [githubImportQuery.data, queryClient, t]);

  const createPackageMutation = useMutation({
    mutationFn: (payload: SkillPackageCreateRequest) =>
      createWorkspaceSkillPackage(workspaceId, payload, crypto.randomUUID()),
    onSuccess: async (created) => {
      setSelectedPackageId(created.package.id);
      setSelectedVersionId(created.version.id);
      await invalidate();
      notifySuccessText(t("SETTINGS_WORKSPACE_SKILLS_CREATED"));
    },
    onError: notifyError,
  });
  const createVersionMutation = useMutation({
    mutationFn: (payload: SkillVersionCreateRequest) =>
      createWorkspaceSkillVersion(workspaceId, selectedPackage!.id, payload, crypto.randomUUID()),
    onSuccess: async (created) => {
      setSelectedVersionId(created.id);
      await invalidate();
      notifySuccessText(t("SETTINGS_WORKSPACE_SKILLS_VERSION_CREATED"));
    },
    onError: notifyError,
  });
  const githubImportMutation = useMutation({
    mutationFn: (payload: SkillGitHubImportCreateRequest) =>
      createWorkspaceSkillGitHubImport(workspaceId, payload, crypto.randomUUID()),
    onSuccess: (accepted) => {
      setGitHubOperation(accepted);
      notifyInfoText(t("SETTINGS_WORKSPACE_SKILLS_GITHUB_QUEUED"));
    },
    onError: notifyError,
  });
  const zipImportMutation = useMutation({
    mutationFn: (file: File) =>
      createWorkspaceSkillZipImport(workspaceId, file, crypto.randomUUID()),
    onSuccess: async (created) => {
      setSelectedPackageId(created.package.id);
      setSelectedVersionId(created.version.id);
      await invalidate();
      notifySuccessText(t("SETTINGS_WORKSPACE_SKILLS_ZIP_IMPORTED"));
    },
    onError: notifyError,
  });
  const githubRefreshMutation = useMutation({
    mutationFn: () =>
      createWorkspaceSkillGitHubRefresh(workspaceId, selectedPackage!.id, crypto.randomUUID()),
    onSuccess: (accepted) => {
      setGitHubOperation(accepted);
      notifyInfoText(t("SETTINGS_WORKSPACE_SKILLS_GITHUB_REFRESH_QUEUED"));
    },
    onError: notifyError,
  });
  const validationMutation = useMutation({
    mutationFn: () =>
      validateWorkspaceSkillVersion(
        workspaceId,
        selectedPackage!.id,
        selectedVersion!.id,
        crypto.randomUUID(),
      ),
    onSuccess: async () => {
      await invalidate();
      notifySuccessText(t("SETTINGS_WORKSPACE_SKILLS_VALIDATED"));
    },
    onError: notifyError,
  });
  const installMutation = useMutation({
    mutationFn: (payload: SkillInstallationCreateRequest) =>
      createWorkspaceSkillInstallation(workspaceId, payload, crypto.randomUUID()),
    onSuccess: async () => {
      await invalidate();
      notifySuccessText(t("SETTINGS_WORKSPACE_SKILLS_INSTALLED"));
    },
    onError: notifyError,
  });
  const updateInstallationMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      updateWorkspaceSkillInstallation(workspaceId, installation!.id, {
        enabled,
        expectedRevision: installation!.metadataRevision,
      }),
    onSuccess: async (updated) => {
      await invalidate();
      notifySuccessText(
        t(
          updated.status === "enabled"
            ? "SETTINGS_WORKSPACE_SKILLS_ENABLED"
            : "SETTINGS_WORKSPACE_SKILLS_DISABLED",
        ),
      );
    },
    onError: notifyError,
  });

  return {
    workspaceId,
    search,
    setSearch,
    selectedPackageId,
    setSelectedPackageId,
    selectedVersionId,
    setSelectedVersionId,
    dialog,
    setDialog,
    capabilitiesQuery,
    packagesQuery,
    installationsQuery,
    githubImportQuery,
    githubOperation,
    packageQuery,
    versionsQuery,
    versionQuery,
    validationsQuery,
    packages,
    installations,
    selectedPackage,
    versions,
    selectedVersion,
    validation,
    installation,
    createPackageMutation,
    createVersionMutation,
    githubImportMutation,
    zipImportMutation,
    githubRefreshMutation,
    validationMutation,
    installMutation,
    updateInstallationMutation,
  };
}

export type WorkspaceSkillsController = ReturnType<typeof useWorkspaceSkillsController>;
