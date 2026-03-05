import { Button as AntButton, Input as AntInput } from "antd";
import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LoaderOne } from "@celestial/ui/loader";
import { MembersFilterPopover, type OrgMemberFilters } from "./members-filter-popover";

interface OrganizationMembersInviteActionProps {
  onInvite: () => void;
}

export function OrganizationMembersInviteAction({
  onInvite,
}: OrganizationMembersInviteActionProps) {
  const { t } = useTranslation(["common"]);

  return (
    <AntButton type="primary" icon={<Plus size={16} />} onClick={onInvite} autoInsertSpace={false}>
      {t("common:ORG_MEMBERS_INVITE")}
    </AntButton>
  );
}

interface OrganizationMembersToolbarProps {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  filters: OrgMemberFilters;
  onFiltersChange: (next: OrgMemberFilters) => void;
  roleOptions: Array<{ value: string; label: string }>;
  isFetching: boolean;
  isLoading: boolean;
}

export function OrganizationMembersToolbar({
  searchInput,
  onSearchInputChange,
  filters,
  onFiltersChange,
  roleOptions,
  isFetching,
  isLoading,
}: OrganizationMembersToolbarProps) {
  const { t } = useTranslation(["common", "team"]);

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <AntInput
          value={searchInput}
          onChange={(event) => onSearchInputChange(event.target.value)}
          placeholder={t("team:TEAM_SEARCH_PLACEHOLDER")}
          allowClear
          variant="filled"
          prefix={<Search className="size-4 text-label-secondary" />}
          style={{ width: 360, maxWidth: "100%" }}
        />

        <MembersFilterPopover
          value={filters}
          onChange={onFiltersChange}
          roleOptions={roleOptions}
        />
      </div>

      {isFetching && !isLoading ? <LoaderOne /> : null}
    </div>
  );
}
