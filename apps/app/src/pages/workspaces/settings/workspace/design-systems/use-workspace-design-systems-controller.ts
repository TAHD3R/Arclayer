import { useDeferredValue, useEffect, useRef, useState } from "react";
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
import {
  buildDesignSystemFoundationManifest,
  designSystemFoundationDefaults,
  validateDesignSystemFoundationValues,
  type DesignSystemFoundationValues,
} from "./workspace-design-system-manifest";

export type DesignSystemDraft = Readonly<{
  isNew: boolean;
  systemId: string | null;
  name: string;
  description: string;
  values: DesignSystemFoundationValues;
  baseVersionId: string | null;
  baseChecksum: string | null;
}>;

export function useWorkspaceDesignSystemsController(workspaceId: string) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState<DesignSystemDraft | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<
    | null
    | { kind: "back" }
    | {
        kind: "version";
        versionId: string;
      }
  >(null);
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
  const selectedSystem =
    (draft?.systemId && systems.find((system) => system.id === draft.systemId)) ||
    systems.find((system) => system.id === selectedSystemId) ||
    (!draft?.isNew ? systems[0] : undefined);
  // Mutations can fire from async callbacks (create-system → create-version →
  // validate); refs keep those closures reading the latest selection.
  const selectedSystemRef = useRef(selectedSystem);
  selectedSystemRef.current = selectedSystem;

  useEffect(() => {
    if (!selectedSystem) {
      if (!draft?.isNew) {
        setSelectedSystemId(null);
        setSelectedVersionId(null);
      }
    } else if (selectedSystem.id !== selectedSystemId) {
      setSelectedSystemId(selectedSystem.id);
      setSelectedVersionId(null);
    }
  }, [draft?.isNew, draft?.systemId, selectedSystem, selectedSystemId]);

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
  const versionsRef = useRef(versions);
  versionsRef.current = versions;
  const defaultRevisionRef = useRef(defaultQuery.data?.metadataRevision ?? 0);
  defaultRevisionRef.current = defaultQuery.data?.metadataRevision ?? 0;
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

  // Initialize the editing draft from the selected version's manifest once it
  // is available. Existing drafts (dirty edits or a fresh unsaved system) are
  // never overwritten here.
  useEffect(() => {
    if (viewMode !== "detail" || draft) return;
    if (selectedSystem?.id && selectedVersion && versionQuery.data?.manifest) {
      setDraft({
        isNew: false,
        systemId: selectedSystem.id,
        name: selectedSystem.name,
        description: selectedSystem.description ?? "",
        values: designSystemFoundationDefaults(
          versionQuery.data.manifest,
          componentCatalogsQuery.data?.[0]?.catalogVersion ?? "",
        ),
        baseVersionId: selectedVersion.id,
        baseChecksum: selectedVersion.manifestChecksum,
      });
      setDraftDirty(false);
      return;
    }
    if (selectedSystem?.id && versionsQuery.isSuccess && !versions.length) {
      setDraft({
        isNew: false,
        systemId: selectedSystem.id,
        name: selectedSystem.name,
        description: selectedSystem.description ?? "",
        values: designSystemFoundationDefaults(
          undefined,
          componentCatalogsQuery.data?.[0]?.catalogVersion ?? "",
        ),
        baseVersionId: null,
        baseChecksum: null,
      });
      setDraftDirty(false);
    }
  }, [
    componentCatalogsQuery.data,
    draft,
    selectedSystem?.description,
    selectedSystem?.id,
    selectedSystem?.name,
    selectedVersion,
    versionQuery.data?.manifest,
    versions.length,
    versionsQuery.isSuccess,
    viewMode,
  ]);

  // Catalogs can resolve after the draft is initialized; backfill the default
  // selection without marking the draft dirty so saving stays available.
  const defaultCatalogVersion = componentCatalogsQuery.data?.[0]?.catalogVersion;
  useEffect(() => {
    if (!draft || draft.values.componentCatalogVersion || !defaultCatalogVersion) return;
    setDraft((current) =>
      current && !current.values.componentCatalogVersion
        ? {
            ...current,
            values: { ...current.values, componentCatalogVersion: defaultCatalogVersion },
          }
        : current,
    );
  }, [defaultCatalogVersion, draft]);

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
    mutationFn: ({
      systemId,
      payload,
      key,
    }: {
      systemId: string;
      payload: DesignSystemVersionCreateRequest;
      key: string;
    }) => createWorkspaceDesignSystemVersion(workspaceId, systemId, payload, key),
    onSuccess: async (version) => {
      setDraft((current) =>
        current
          ? {
              ...current,
              baseVersionId: version.id,
              baseChecksum: version.manifestChecksum,
            }
          : current,
      );
      setSelectedVersionId(version.id);
      await invalidate();
      notifySuccessText(t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_CREATED"));
      runVersionCommand("validate", version.id);
    },
  });
  const validateMutation = useMutation({
    mutationFn: ({ versionId, key }: { versionId: string; key: string }) =>
      validateWorkspaceDesignSystemVersion(
        workspaceId,
        selectedSystemRef.current!.id,
        versionId,
        key,
      ),
    onSuccess: async (_, input) => {
      commandKeys.current.delete(`validate:${input.versionId}`);
      await invalidate();
      notifySuccessText(t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VALIDATED"));
    },
  });
  const defaultMutation = useMutation({
    mutationFn: ({ versionId, key }: { versionId: string; key: string }) => {
      const system = selectedSystemRef.current;
      const version = versionsRef.current.find((candidate) => candidate.id === versionId);
      if (!system || !version?.validationFindingHash) {
        throw new Error("DESIGN_SYSTEM_VALIDATION_REQUIRED");
      }
      return setWorkspaceDesignSystemDefault(
        workspaceId,
        {
          designSystemId: system.id,
          versionId,
          expectedManifestChecksum: version.manifestChecksum,
          validationFindingHash: version.validationFindingHash,
          expectedRevision: defaultRevisionRef.current,
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

  const saving = createSystemMutation.isPending || createVersionMutation.isPending;
  const draftNameTrimmed = draft?.name.trim() ?? "";
  const canSave = Boolean(
    draft &&
    !saving &&
    draftDirty &&
    draftNameTrimmed &&
    Object.keys(validateDesignSystemFoundationValues(draft.values)).length === 0,
  );

  const openNewSystemDraft = () => {
    setDraftDirty(false);
    setSelectedVersionId(null);
    setDraft({
      isNew: true,
      systemId: null,
      name: "",
      description: "",
      values: designSystemFoundationDefaults(
        undefined,
        componentCatalogsQuery.data?.[0]?.catalogVersion ?? "",
      ),
      baseVersionId: null,
      baseChecksum: null,
    });
    setViewMode("detail");
  };

  const openSystem = (systemId: string) => {
    setDraftDirty(false);
    setDraft(null);
    setSelectedSystemId(systemId);
    setSelectedVersionId(null);
    setViewMode("detail");
  };

  const backToList = () => {
    setDraftDirty(false);
    setDraft(null);
    setHistoryOpen(false);
    setDiscardTarget(null);
    setViewMode("list");
  };

  const requestBack = () => {
    if (draftDirty) setDiscardTarget({ kind: "back" });
    else backToList();
  };

  const requestVersion = (versionId: string) => {
    if (draftDirty) setDiscardTarget({ kind: "version", versionId });
    else setSelectedVersionId(versionId);
  };

  const resolveDiscard = (discard: boolean) => {
    const target = discardTarget;
    setDiscardTarget(null);
    if (!discard || !target) return;
    backToList();
    if (target.kind === "version") {
      setSelectedVersionId(target.versionId);
      setHistoryOpen(true);
    }
  };

  const updateDraftMeta = (patch: Partial<Pick<DesignSystemDraft, "name" | "description">>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDraftDirty(true);
  };

  const updateDraftValue = <K extends keyof DesignSystemFoundationValues>(
    field: K,
    value: DesignSystemFoundationValues[K],
  ) => {
    setDraft((current) =>
      current ? { ...current, values: { ...current.values, [field]: value } } : current,
    );
    setDraftDirty(true);
  };

  const saveDraft = () => {
    if (!draft || !canSave) return;
    const key = crypto.randomUUID();
    if (draft.isNew) {
      createSystemMutation.mutate(
        {
          payload: { name: draftNameTrimmed, description: draft.description.trim() || null },
          key,
        },
        {
          onSuccess: (system) => {
            createVersionMutation.mutate({
              systemId: system.id,
              payload: {
                manifest: buildDesignSystemFoundationManifest(
                  { ...draft.values, manifestName: draftNameTrimmed },
                  undefined,
                ),
                parentVersionId: null,
                expectedParentChecksum: null,
                source: "manual",
              },
              key,
            });
            setDraft((current) =>
              current
                ? { ...current, isNew: false, systemId: system.id, name: draftNameTrimmed }
                : current,
            );
            setDraftDirty(false);
          },
        },
      );
      return;
    }
    createVersionMutation.mutate({
      systemId: draft.systemId!,
      payload: {
        manifest: buildDesignSystemFoundationManifest(
          { ...draft.values, manifestName: draftNameTrimmed },
          versionQuery.data?.manifest,
        ),
        parentVersionId: draft.baseVersionId,
        expectedParentChecksum: draft.baseChecksum,
        source: "manual",
      },
      key,
    });
    setDraftDirty(false);
  };

  return {
    search,
    setSearch,
    selectedSystemId,
    setSelectedSystemId,
    selectedVersionId,
    setSelectedVersionId,
    viewMode,
    openSystem,
    openNewSystemDraft,
    backToList,
    requestBack,
    requestVersion,
    discardTarget,
    resolveDiscard,
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
    draft,
    draftDirty,
    canSave,
    saving,
    updateDraftMeta,
    updateDraftValue,
    saveDraft,
    historyOpen,
    setHistoryOpen,
  };
}

export function useWorkspaceDesignSystemCardManifest(workspaceId: string, systemId: string) {
  const versionsQuery = useQuery({
    queryKey: [...WORKSPACE_DESIGN_SYSTEMS_QUERY_KEY, workspaceId, "card-versions", systemId],
    queryFn: ({ signal }) =>
      listWorkspaceDesignSystemVersions(workspaceId, systemId, { limit: 1, signal }),
    staleTime: 30_000,
  });
  const latestVersionId = versionsQuery.data?.items?.[0]?.id;
  const manifestQuery = useQuery({
    queryKey: [
      ...WORKSPACE_DESIGN_SYSTEMS_QUERY_KEY,
      workspaceId,
      "card-manifest",
      systemId,
      latestVersionId,
    ],
    queryFn: ({ signal }) =>
      getWorkspaceDesignSystemVersion(workspaceId, systemId, latestVersionId!, signal),
    enabled: Boolean(latestVersionId),
    staleTime: 30_000,
  });
  return manifestQuery.data?.manifest;
}

export type WorkspaceDesignSystemsController = ReturnType<
  typeof useWorkspaceDesignSystemsController
>;
