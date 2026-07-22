import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  PROJECT_DESIGN_SYSTEM_QUERY_KEY,
  compareProjectDesignSystemVersions,
  listProjectDesignSystemVersions,
  previewProjectDesignSystemImpact,
} from "@/api/project-design-systems";

const STYLE_GUIDE_HISTORY_PAGE_SIZE = 20;

interface ProjectStyleGuideHistoryInput {
  projectId: string;
  systemId: string | null;
  targetVersionId: string | null;
  enabled: boolean;
}

interface ComparisonSelection {
  systemId: string;
  targetVersionId: string;
  versionId: string;
}

export function projectStyleGuideHistoryQueryKey(projectId: string, systemId: string | null) {
  return [...PROJECT_DESIGN_SYSTEM_QUERY_KEY, projectId, "versions", systemId] as const;
}

export function useProjectStyleGuideHistory(input: ProjectStyleGuideHistoryInput) {
  const [selection, setSelection] = useState<ComparisonSelection | null>(null);
  const selectedFromVersionId =
    selection?.systemId === input.systemId &&
    selection.targetVersionId === input.targetVersionId &&
    selection.versionId !== input.targetVersionId
      ? selection.versionId
      : null;

  const historyQuery = useInfiniteQuery({
    queryKey: projectStyleGuideHistoryQueryKey(input.projectId, input.systemId),
    enabled: input.enabled && Boolean(input.systemId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      if (!input.systemId) throw new Error("CREATION_EDITOR_STYLE_PROJECT_FORK_REQUIRED");
      return listProjectDesignSystemVersions(input.projectId, input.systemId, {
        limit: STYLE_GUIDE_HISTORY_PAGE_SIZE,
        cursor: pageParam ?? undefined,
        signal,
      });
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });

  const versions = useMemo(
    () => (historyQuery.data?.pages ?? []).flatMap((page) => page.items ?? []),
    [historyQuery.data?.pages],
  );
  const canCompare = Boolean(
    input.systemId &&
    input.targetVersionId &&
    selectedFromVersionId &&
    selectedFromVersionId !== input.targetVersionId,
  );
  const comparisonQuery = useQuery({
    queryKey: [
      ...projectStyleGuideHistoryQueryKey(input.projectId, input.systemId),
      "comparison",
      selectedFromVersionId,
      input.targetVersionId,
    ],
    enabled: input.enabled && canCompare,
    queryFn: ({ signal }) => {
      if (!input.systemId || !input.targetVersionId || !selectedFromVersionId) {
        throw new Error("CREATION_EDITOR_STYLE_COMPARISON_REQUIRED");
      }
      return compareProjectDesignSystemVersions(
        input.projectId,
        input.systemId,
        { fromVersionId: selectedFromVersionId, toVersionId: input.targetVersionId },
        signal,
      );
    },
    retry: false,
  });
  const impactQuery = useQuery({
    queryKey: [
      ...projectStyleGuideHistoryQueryKey(input.projectId, input.systemId),
      "impact-preview",
      selectedFromVersionId,
      input.targetVersionId,
    ],
    enabled: input.enabled && canCompare,
    queryFn: ({ signal }) => {
      if (!input.systemId || !input.targetVersionId || !selectedFromVersionId) {
        throw new Error("CREATION_EDITOR_STYLE_IMPACT_REQUIRED");
      }
      return previewProjectDesignSystemImpact(
        input.projectId,
        input.systemId,
        { fromVersionId: selectedFromVersionId, toVersionId: input.targetVersionId },
        signal,
      );
    },
    retry: false,
  });

  return {
    historyQuery,
    versions,
    systemMetadataRevision: historyQuery.data?.pages[0]?.systemMetadataRevision ?? null,
    comparisonQuery,
    comparison: comparisonQuery.data ?? null,
    impactQuery,
    impact: impactQuery.data ?? null,
    selectedFromVersionId,
    targetVersionId: input.targetVersionId,
    selectComparisonVersion: (versionId: string) => {
      if (!input.systemId || !input.targetVersionId || versionId === input.targetVersionId) return;
      setSelection({
        systemId: input.systemId,
        targetVersionId: input.targetVersionId,
        versionId,
      });
    },
    clearComparison: () => setSelection(null),
  };
}

export type ProjectStyleGuideHistory = ReturnType<typeof useProjectStyleGuideHistory>;
