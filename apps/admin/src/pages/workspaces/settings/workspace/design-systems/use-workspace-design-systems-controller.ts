import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type {
  DesignSystemCreateRequest,
  DesignSystemVersionCreateRequest,
} from "@arclayer/openapi";
import {
  WORKSPACE_DESIGN_SYSTEMS_QUERY_KEY,
  createWorkspaceDesignSystem,
  createWorkspaceDesignSystemVersion,
  getWorkspaceDesignSystem,
  getWorkspaceDesignSystemDefault,
  getWorkspaceDesignSystemVersion,
  getWorkspaceDesignSystemsCapabilities,
  listWorkspaceDesignSystemValidationResults,
  listWorkspaceDesignSystemComponentCatalogs,
  listWorkspaceDesignSystemVersions,
  listWorkspaceDesignSystems,
  setWorkspaceDesignSystemDefault,
  validateWorkspaceDesignSystemVersion,
} from "@/api/workspace-design-systems";
import { notifySuccessText } from "@/lib/notifications";

export function useWorkspaceDesignSystemsController(workspaceId: string) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"system" | "version" | null>(null);
  const commandKeys = useRef(new Map<string, string>());

  const capabilitiesQuery = useQuery({
    queryKey: [...WORKSPACE_DESIGN_SYSTEMS_QUERY_KEY, workspaceId, "capabilities"],
    queryFn: ({ signal }) => getWorkspaceDesignSystemsCapabilities(workspaceId, signal),
  });
  const systemsQuery = useQuery({
    queryKey: [...WORKSPACE_DESIGN_SYSTEMS_QUERY_KEY, workspaceId, "systems", deferredSearch],
    queryFn: ({ signal }) =>
      listWorkspaceDesignSystems(workspaceId, {
        q: deferredSearch || undefined,
        limit: 100,
        signal,
      }),
  });
  const defaultQuery = useQuery({
    queryKey: [...WORKSPACE_DESIGN_SYSTEMS_QUERY_KEY, workspaceId, "default"],
    queryFn: ({ signal }) => getWorkspaceDesignSystemDefault(workspaceId, signal),
  });
  const componentCatalogsQuery = useQuery({
    queryKey: [...WORKSPACE_DESIGN_SYSTEMS_QUERY_KEY, workspaceId, "component-catalogs"],
    queryFn: ({ signal }) => listWorkspaceDesignSystemComponentCatalogs(workspaceId, signal),
  });
  const systems = systemsQuery.data?.items ?? [];
  const selectedSystem = systems.find((system) => system.id === selectedSystemId) ?? systems[0];

  useEffect(() => {
    if (!selectedSystem) {
      setSelectedSystemId(null);
      setSelectedVersionId(null);
    } else if (selectedSystem.id !== selectedSystemId) {
      setSelectedSystemId(selectedSystem.id);
      setSelectedVersionId(null);
    }
  }, [selectedSystem, selectedSystemId]);

  const systemQuery = useQuery({
    queryKey: [...WORKSPACE_DESIGN_SYSTEMS_QUERY_KEY, workspaceId, "system", selectedSystem?.id],
    queryFn: ({ signal }) => getWorkspaceDesignSystem(workspaceId, selectedSystem!.id, signal),
    enabled: Boolean(selectedSystem),
  });
  const versionsQuery = useQuery({
    queryKey: [...WORKSPACE_DESIGN_SYSTEMS_QUERY_KEY, workspaceId, "versions", selectedSystem?.id],
    queryFn: ({ signal }) =>
      listWorkspaceDesignSystemVersions(workspaceId, selectedSystem!.id, { limit: 100, signal }),
    enabled: Boolean(selectedSystem),
  });
  const versions = versionsQuery.data?.items ?? [];
  const selectedVersion =
    versions.find((version) => version.id === selectedVersionId) ?? versions[0];

  useEffect(() => {
    if (!selectedVersion) setSelectedVersionId(null);
    else if (selectedVersion.id !== selectedVersionId) setSelectedVersionId(selectedVersion.id);
  }, [selectedVersion, selectedVersionId]);

  const versionQuery = useQuery({
    queryKey: [
      ...WORKSPACE_DESIGN_SYSTEMS_QUERY_KEY,
      workspaceId,
      "version",
      selectedSystem?.id,
      selectedVersion?.id,
    ],
    queryFn: ({ signal }) =>
      getWorkspaceDesignSystemVersion(workspaceId, selectedSystem!.id, selectedVersion!.id, signal),
    enabled: Boolean(selectedSystem && selectedVersion),
  });
  const validationsQuery = useQuery({
    queryKey: [
      ...WORKSPACE_DESIGN_SYSTEMS_QUERY_KEY,
      workspaceId,
      "validations",
      selectedSystem?.id,
      selectedVersion?.id,
    ],
    queryFn: ({ signal }) =>
      listWorkspaceDesignSystemValidationResults(
        workspaceId,
        selectedSystem!.id,
        selectedVersion!.id,
        signal,
      ),
    enabled: Boolean(selectedSystem && selectedVersion),
  });
  const latestValidation = validationsQuery.data?.[0];
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: WORKSPACE_DESIGN_SYSTEMS_QUERY_KEY });

  const createSystemMutation = useMutation({
    mutationFn: ({ payload, key }: { payload: DesignSystemCreateRequest; key: string }) =>
      createWorkspaceDesignSystem(workspaceId, payload, key),
    onSuccess: async (system) => {
      setSelectedSystemId(system.id);
      await invalidate();
      notifySuccessText(t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CREATED"));
    },
  });
  const createVersionMutation = useMutation({
    mutationFn: ({ payload, key }: { payload: DesignSystemVersionCreateRequest; key: string }) =>
      createWorkspaceDesignSystemVersion(workspaceId, selectedSystem!.id, payload, key),
    onSuccess: async (version) => {
      setSelectedVersionId(version.id);
      await invalidate();
      notifySuccessText(t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_CREATED"));
    },
  });
  const validateMutation = useMutation({
    mutationFn: ({ versionId, key }: { versionId: string; key: string }) =>
      validateWorkspaceDesignSystemVersion(workspaceId, selectedSystem!.id, versionId, key),
    onSuccess: async (_, input) => {
      commandKeys.current.delete(`validate:${input.versionId}`);
      await invalidate();
      notifySuccessText(t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VALIDATED"));
    },
  });
  const defaultMutation = useMutation({
    mutationFn: ({ versionId, key }: { versionId: string; key: string }) => {
      const version = versions.find((candidate) => candidate.id === versionId);
      if (!selectedSystem || !version?.validationFindingHash) {
        throw new Error("DESIGN_SYSTEM_VALIDATION_REQUIRED");
      }
      return setWorkspaceDesignSystemDefault(
        workspaceId,
        {
          designSystemId: selectedSystem.id,
          versionId,
          expectedManifestChecksum: version.manifestChecksum,
          validationFindingHash: version.validationFindingHash,
          expectedRevision: defaultQuery.data?.metadataRevision ?? 0,
        },
        key,
      );
    },
    onSuccess: async (_, input) => {
      commandKeys.current.delete(`default:${input.versionId}`);
      await invalidate();
      notifySuccessText(t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_DEFAULT_UPDATED"));
    },
  });

  const runVersionCommand = (kind: "validate" | "default", versionId: string) => {
    setSelectedVersionId(versionId);
    const identity = `${kind}:${versionId}`;
    const key = commandKeys.current.get(identity) ?? crypto.randomUUID();
    commandKeys.current.set(identity, key);
    if (kind === "validate") validateMutation.mutate({ versionId, key });
    else defaultMutation.mutate({ versionId, key });
  };

  return useMemo(
    () => ({
      search,
      setSearch,
      selectedSystemId,
      setSelectedSystemId,
      selectedVersionId,
      setSelectedVersionId,
      dialog,
      setDialog,
      systems,
      selectedSystem,
      versions,
      selectedVersion,
      latestValidation,
      capabilitiesQuery,
      systemsQuery,
      defaultQuery,
      componentCatalogsQuery,
      systemQuery,
      versionsQuery,
      versionQuery,
      validationsQuery,
      createSystemMutation,
      createVersionMutation,
      validateMutation,
      defaultMutation,
      runVersionCommand,
      openVersionDialog: () => {
        setSelectedVersionId(versions[0]?.id ?? null);
        setDialog("version");
      },
    }),
    [
      capabilitiesQuery,
      createSystemMutation,
      createVersionMutation,
      defaultMutation,
      defaultQuery,
      componentCatalogsQuery,
      dialog,
      latestValidation,
      search,
      selectedSystem,
      selectedSystemId,
      selectedVersion,
      selectedVersionId,
      systemQuery,
      systems,
      systemsQuery,
      validateMutation,
      validationsQuery,
      versionQuery,
      versions,
      versionsQuery,
    ],
  );
}

export type WorkspaceDesignSystemsController = ReturnType<
  typeof useWorkspaceDesignSystemsController
>;
