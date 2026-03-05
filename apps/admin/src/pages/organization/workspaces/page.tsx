import { useEffect, useState } from "react";

import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { OrganizationWorkspacesDialog } from "./dialog";

export function OrganizationWorkspacesPage() {
  const { orgId: organizationId } = useParams({ from: "/o/$orgId/workspaces/" });
  const { create } = useSearch({ from: "/o/$orgId/workspaces/" });
  const navigate = useNavigate();
  const autoOpenCreate = create === "1";
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (open) return;
    void navigate({ to: `/o/${organizationId}/`, replace: true });
  }, [navigate, open, organizationId]);

  return (
    <OrganizationWorkspacesDialog
      open={open}
      onOpenChange={setOpen}
      organizationId={organizationId}
      autoOpenCreate={autoOpenCreate}
      onEnterWorkspace={(workspaceId) => {
        void navigate({ to: `/w/${workspaceId}`, replace: true });
      }}
    />
  );
}
