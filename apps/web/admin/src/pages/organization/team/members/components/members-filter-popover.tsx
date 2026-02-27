import { Button as AntButton, Select } from "antd";
import { Filter } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { OrgMembershipStatus, OrgRole, OrgUserStatus } from "@/types/api";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

export type OrgMemberFilters = {
  role?: OrgRole;
  membershipStatus?: OrgMembershipStatus;
  userStatus?: OrgUserStatus;
  hasWorkspace?: boolean;
};

export function MembersFilterPopover({
  value,
  onChange,
}: {
  value: OrgMemberFilters;
  onChange: (next: OrgMemberFilters) => void;
}) {
  const { t } = useTranslation(["common", "team"]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <AntButton
          type="text"
          icon={<Filter size={18} />}
          title={t("common:ORG_MEMBERS_FILTER_TITLE")}
          className="h-10! bg-transparent! hover:bg-accent/40!"
        >
          {t("common:ORG_MEMBERS_FILTER_TITLE")}
        </AntButton>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 p-3">
        <div className="font-bold">{t("common:ORG_MEMBERS_FILTER_TITLE")}</div>

        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("common:ORG_MEMBERS_TABLE_ROLE")}
            </div>
            <Select
              value={value.role ?? "all"}
              className="w-full"
              onChange={(next) =>
                onChange({
                  ...value,
                  role: next === "all" ? undefined : (next as OrgRole),
                })
              }
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              options={[
                { value: "all", label: t("team:TEAM_FILTER_ALL") },
                { value: "owner", label: t("common:ORG_ROLE_OWNER") },
                { value: "admin", label: t("common:ORG_ROLE_ADMIN") },
                { value: "member", label: t("common:ORG_ROLE_MEMBER") },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("common:ORG_MEMBERS_FILTER_MEMBER_STATUS")}
            </div>
            <Select
              value={value.membershipStatus ?? "all"}
              className="w-full"
              onChange={(next) =>
                onChange({
                  ...value,
                  membershipStatus: next === "all" ? undefined : (next as OrgMembershipStatus),
                })
              }
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              options={[
                { value: "all", label: t("team:TEAM_FILTER_ALL") },
                { value: "active", label: t("team:TEAM_MEMBERSHIP_STATUS_ACTIVE") },
                { value: "invited", label: t("team:TEAM_MEMBERSHIP_STATUS_INVITED") },
                { value: "disabled", label: t("team:TEAM_MEMBERSHIP_STATUS_DISABLED") },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("common:ORG_MEMBERS_FILTER_USER_STATUS")}
            </div>
            <Select
              value={value.userStatus ?? "all"}
              className="w-full"
              onChange={(next) =>
                onChange({
                  ...value,
                  userStatus: next === "all" ? undefined : (next as OrgUserStatus),
                })
              }
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              options={[
                { value: "all", label: t("team:TEAM_FILTER_ALL") },
                { value: "active", label: t("team:TEAM_USER_STATUS_ACTIVE") },
                { value: "disabled", label: t("team:TEAM_USER_STATUS_DISABLED") },
                { value: "locked", label: t("team:TEAM_USER_STATUS_LOCKED") },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("common:ORG_MEMBERS_FILTER_WORKSPACE_ASSOCIATION")}
            </div>
            <Select
              value={
                value.hasWorkspace === undefined
                  ? "all"
                  : value.hasWorkspace
                    ? "with_workspace"
                    : "without_workspace"
              }
              className="w-full"
              onChange={(next) =>
                onChange({
                  ...value,
                  hasWorkspace:
                    next === "all" ? undefined : next === "with_workspace" ? true : false,
                })
              }
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              options={[
                { value: "all", label: t("team:TEAM_FILTER_ALL") },
                { value: "with_workspace", label: t("common:ORG_MEMBERS_FILTER_WORKSPACE_WITH") },
                {
                  value: "without_workspace",
                  label: t("common:ORG_MEMBERS_FILTER_WORKSPACE_WITHOUT"),
                },
              ]}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <AntButton onClick={() => onChange({})}>{t("team:TEAM_FILTER_RESET")}</AntButton>
          <PopoverClose asChild>
            <AntButton type="primary">{t("team:TEAM_FILTER_DONE")}</AntButton>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}
