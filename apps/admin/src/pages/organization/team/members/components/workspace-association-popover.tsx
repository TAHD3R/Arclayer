import { Button as AntButton } from "antd";
import { useTranslation } from "react-i18next";

import { Popover, PopoverContent, PopoverTrigger } from "@celestial/ui/popover";
import {
  type ResolvedMemberWorkspace,
  OrganizationMemberWorkspaceList,
} from "@/pages/organization/team/shared/components/organization-member-workspace-list";

export function WorkspaceAssociationPopover({
  workspaces,
  roleNameByCode,
  onEnterWorkspace,
}: {
  workspaces: ResolvedMemberWorkspace[];
  roleNameByCode: Map<string, string>;
  onEnterWorkspace: (workspaceId: string) => void;
}) {
  const { t } = useTranslation(["common", "team"]);

  if (!workspaces.length) {
    return <span className="text-footnote text-label-secondary">{t("common:NA")}</span>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <AntButton
          type="text"
          className="!h-auto !px-2 !py-1 !font-medium !text-foreground hover:!bg-accent"
          autoInsertSpace={false}
        >
          {t("common:ORG_MEMBERS_ASSOCIATED_WORKSPACES_COUNT", { count: workspaces.length })}
        </AntButton>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={8} className="w-100 max-w-[90vw] p-3">
        <div className="space-y-3">
          <div className="flex flex-col gap-2">
            <div className="font-semibold">{t("common:ORG_MEMBERS_WORKSPACE_POPOVER_TITLE")}</div>
            <div className="text-label-secondary">
              {t("common:ORG_MEMBERS_WORKSPACE_POPOVER_DESC")}
            </div>
          </div>

          <div className="max-h-[420px] overflow-auto pr-1">
            <OrganizationMemberWorkspaceList
              workspaces={workspaces}
              roleNameByCode={roleNameByCode}
              onEnterWorkspace={onEnterWorkspace}
              searchable
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
