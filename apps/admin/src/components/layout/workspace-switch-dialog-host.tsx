import { useEffect, useMemo } from "react";

import { useNavigate, useRouterState } from "@tanstack/react-router";

import { switchWorkspacePath } from "@/lib/routing/workspace-routing";
import { OrganizationWorkspacesDialog } from "@/pages/organization/workspaces/dialog";
import { useWorkspaceSwitchDialogStore } from "@/stores/use-workspace-switch-dialog-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export function WorkspaceSwitchDialogHost() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const open = useWorkspaceSwitchDialogStore((s) => s.open);
  const organizationId = useWorkspaceSwitchDialogStore((s) => s.organizationId);
  const autoOpenCreate = useWorkspaceSwitchDialogStore((s) => s.autoOpenCreate);
  const closeDialog = useWorkspaceSwitchDialogStore((s) => s.closeDialog);
  const consumeAutoOpenCreate = useWorkspaceSwitchDialogStore((s) => s.consumeAutoOpenCreate);

  const effectiveAutoOpenCreate = useMemo(() => open && autoOpenCreate, [autoOpenCreate, open]);

  useEffect(() => {
    if (effectiveAutoOpenCreate) {
      consumeAutoOpenCreate();
    }
  }, [consumeAutoOpenCreate, effectiveAutoOpenCreate]);

  if (!organizationId) return null;

  return (
    <OrganizationWorkspacesDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
      organizationId={organizationId}
      autoOpenCreate={effectiveAutoOpenCreate}
      onEnterWorkspace={(nextWorkspaceId) => {
        const nextPath = switchWorkspacePath({
          pathname,
          currentWorkspaceId,
          nextWorkspaceId,
        });
        void navigate({ to: nextPath as never });
      }}
    />
  );
}
