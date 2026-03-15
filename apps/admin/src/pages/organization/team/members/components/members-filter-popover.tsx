import { Filter } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { OrgMembershipStatus, OrgUserStatus } from "@/types/api";
import { Button } from "@celestial/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@celestial/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@celestial/ui/select";

export type OrgMemberFilters = {
  roleCode?: string;
  membershipStatus?: OrgMembershipStatus;
  userStatus?: OrgUserStatus;
  hasWorkspace?: boolean;
};

export function MembersFilterPopover({
  value,
  onChange,
  roleOptions,
}: {
  value: OrgMemberFilters;
  onChange: (next: OrgMemberFilters) => void;
  roleOptions: Array<{ value: string; label: string }>;
}) {
  const { t } = useTranslation(["common", "team"]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" title={t("common:ORG_MEMBERS_FILTER_TITLE")}>
          <Filter size={18} />
          {t("common:ORG_MEMBERS_FILTER_TITLE")}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 p-3">
        <div className="font-bold">{t("common:ORG_MEMBERS_FILTER_TITLE")}</div>

        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("common:ORG_MEMBERS_TABLE_ROLE")}
            </div>
            <Select
              value={value.roleCode ?? "all"}
              onValueChange={(next) =>
                onChange({
                  ...value,
                  roleCode: next === "all" ? undefined : String(next),
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value="all">{t("team:TEAM_FILTER_ALL")}</SelectItem>
                {roleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("common:ORG_MEMBERS_FILTER_MEMBER_STATUS")}
            </div>
            <Select
              value={value.membershipStatus ?? "all"}
              onValueChange={(next) =>
                onChange({
                  ...value,
                  membershipStatus: next === "all" ? undefined : (next as OrgMembershipStatus),
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value="all">{t("team:TEAM_FILTER_ALL")}</SelectItem>
                <SelectItem value="active">{t("team:TEAM_MEMBERSHIP_STATUS_ACTIVE")}</SelectItem>
                <SelectItem value="invited">{t("team:TEAM_MEMBERSHIP_STATUS_INVITED")}</SelectItem>
                <SelectItem value="disabled">
                  {t("team:TEAM_MEMBERSHIP_STATUS_DISABLED")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("common:ORG_MEMBERS_FILTER_USER_STATUS")}
            </div>
            <Select
              value={value.userStatus ?? "all"}
              onValueChange={(next) =>
                onChange({
                  ...value,
                  userStatus: next === "all" ? undefined : (next as OrgUserStatus),
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value="all">{t("team:TEAM_FILTER_ALL")}</SelectItem>
                <SelectItem value="active">{t("team:TEAM_USER_STATUS_ACTIVE")}</SelectItem>
                <SelectItem value="disabled">{t("team:TEAM_USER_STATUS_DISABLED")}</SelectItem>
                <SelectItem value="locked">{t("team:TEAM_USER_STATUS_LOCKED")}</SelectItem>
              </SelectContent>
            </Select>
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
              onValueChange={(next) =>
                onChange({
                  ...value,
                  hasWorkspace:
                    next === "all" ? undefined : next === "with_workspace" ? true : false,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value="all">{t("team:TEAM_FILTER_ALL")}</SelectItem>
                <SelectItem value="with_workspace">
                  {t("common:ORG_MEMBERS_FILTER_WORKSPACE_WITH")}
                </SelectItem>
                <SelectItem value="without_workspace">
                  {t("common:ORG_MEMBERS_FILTER_WORKSPACE_WITHOUT")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button onClick={() => onChange({})}>{t("team:TEAM_FILTER_RESET")}</Button>
          <PopoverClose asChild>
            <Button>{t("team:TEAM_FILTER_DONE")}</Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}
