import { useEffect } from "react";

import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { getMyOrganization } from "@/api/me";
import { ContentGuard } from "@/components/common/content-guard";
import { buildOrganizationPath } from "@/lib/organization-routing";

export const Route = createFileRoute("/w/$workspaceId/settings/organization/")({
  component: WorkspaceOrganizationSettingsRedirectRoute,
});

function WorkspaceOrganizationSettingsRedirectRoute() {
  const navigate = useNavigate();

  const myOrganizationQuery = useQuery({
    queryKey: ["me", "organization", "workspace-settings-redirect"],
    queryFn: async () => getMyOrganization(),
    retry: false,
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  useEffect(() => {
    const orgId = String(myOrganizationQuery.data?.organization.id || "").trim();
    if (!orgId) return;

    void navigate({
      to: buildOrganizationPath(orgId, "/settings/organization"),
      replace: true,
    });
  }, [myOrganizationQuery.data?.organization.id, navigate]);

  return (
    <ContentGuard
      loading={myOrganizationQuery.isLoading || Boolean(myOrganizationQuery.data?.organization.id)}
      error={myOrganizationQuery.error}
      onRetry={() => {
        void myOrganizationQuery.refetch();
      }}
      empty={!myOrganizationQuery.data?.organization.id}
    />
  );
}
