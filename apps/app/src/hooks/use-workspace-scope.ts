import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listMyWorkspaces } from "@/api/workspaces";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export type MyWorkspaceItem = NonNullable<
  Awaited<ReturnType<typeof listMyWorkspaces>>["items"]
>[number];

function sortWorkspacePickerItems(
  workspaces: readonly MyWorkspaceItem[] | undefined,
): MyWorkspaceItem[] {
  return [...(workspaces ?? [])].sort((left, right) => left.name.localeCompare(right.name));
}

function resolveWorkspaceSelection(params: {
  workspaces: readonly MyWorkspaceItem[];
  currentWorkspaceId: string | null | undefined;
  lastWorkspaceId: string | null | undefined;
}): string | null {
  const { workspaces, currentWorkspaceId, lastWorkspaceId } = params;
  const currentMatch = currentWorkspaceId
    ? workspaces.find((workspace) => String(workspace.workspaceId) === String(currentWorkspaceId))
    : null;
  if (currentMatch) return currentMatch.workspaceId;

  const lastMatch = lastWorkspaceId
    ? workspaces.find((workspace) => String(workspace.workspaceId) === String(lastWorkspaceId))
    : null;
  if (lastMatch) return lastMatch.workspaceId;

  return workspaces[0]?.workspaceId ?? null;
}

export type WorkspaceScope = {
  workspaces: MyWorkspaceItem[];
  selectedWorkspaceId: string | null;
  selectedWorkspace: MyWorkspaceItem | null;
  isLoading: boolean;
  isError: boolean;
};

/**
 * Resolves the active workspace from the user's workspace list and keeps the
 * workspace store in sync. The account menu keeps this mounted on every scene,
 * so the resolved workspace stays available app-wide even when the scope
 * switcher itself is unmounted outside project routes.
 */
export function useWorkspaceScope(): WorkspaceScope {
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const lastWorkspaceId = useWorkspaceStore((state) => state.lastWorkspaceId);
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);

  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces", "switcher", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: listMyWorkspaces,
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaces = useMemo(
    () => sortWorkspacePickerItems(workspacesQuery.data?.items),
    [workspacesQuery.data?.items],
  );

  const selectedWorkspaceId = resolveWorkspaceSelection({
    workspaces,
    currentWorkspaceId,
    lastWorkspaceId,
  });

  const selectedWorkspace = useMemo(
    () =>
      selectedWorkspaceId
        ? (workspaces.find(
            (workspace) => String(workspace.workspaceId) === String(selectedWorkspaceId),
          ) ?? null)
        : null,
    [selectedWorkspaceId, workspaces],
  );

  useEffect(() => {
    if (!accessToken || !workspacesQuery.isSuccess || !selectedWorkspaceId) return;
    if (String(currentWorkspaceId || "") === String(selectedWorkspaceId)) return;
    setCurrentWorkspaceId(selectedWorkspaceId);
  }, [
    accessToken,
    currentWorkspaceId,
    selectedWorkspaceId,
    setCurrentWorkspaceId,
    workspacesQuery.isSuccess,
  ]);

  return {
    workspaces,
    selectedWorkspaceId,
    selectedWorkspace,
    isLoading: workspacesQuery.isLoading,
    isError: workspacesQuery.isError,
  };
}
