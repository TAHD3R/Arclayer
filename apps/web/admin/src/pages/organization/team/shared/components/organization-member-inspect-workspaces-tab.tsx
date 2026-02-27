import { useTranslation } from "react-i18next";

import { PageSkeleton } from "@/components/common/page-skeleton";
import { ContentGuard } from "@/components/common/content-guard";

import {
  type ResolvedMemberWorkspace,
  OrganizationMemberWorkspaceList,
} from "./organization-member-workspace-list";

type OrganizationMemberInspectWorkspacesTabProps = {
  workspaces: ResolvedMemberWorkspace[];
  roleNameByCode: Map<string, string>;
  workspaceDataLoading: boolean;
  workspaceDataError: unknown;
  onEnterWorkspace: (workspaceId: string) => void;
};

export function OrganizationMemberInspectWorkspacesTab({
  workspaces,
  roleNameByCode,
  workspaceDataLoading,
  workspaceDataError,
  onEnterWorkspace,
}: OrganizationMemberInspectWorkspacesTabProps) {
  const { t } = useTranslation(["common"]);

  if (workspaceDataLoading) {
    return <PageSkeleton variant="table" />;
  }

  return (
    <ContentGuard
      loading={false}
      error={workspaceDataError && workspaces.length === 0 ? workspaceDataError : null}
      empty={workspaces.length === 0}
      emptyTitle={t("common:ORG_MEMBERS_INSPECT_WORKSPACES_EMPTY_TITLE")}
      emptyDescription={t("common:ORG_MEMBERS_INSPECT_WORKSPACES_EMPTY_DESC")}
      variant="compact"
      className="py-4"
    >
      <div className="px-8">
        <OrganizationMemberWorkspaceList
          workspaces={workspaces}
          roleNameByCode={roleNameByCode}
          onEnterWorkspace={onEnterWorkspace}
          searchable
        />
      </div>
    </ContentGuard>
  );
}
