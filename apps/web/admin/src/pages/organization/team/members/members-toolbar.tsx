import { Button as AntButton, Input as AntInput } from "antd";
import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LoaderOne } from "@/components/ui/loader";
import { MembersFilterPopover, type OrgMemberFilters } from "./members-filter-popover";

interface OrganizationMembersInviteActionProps {
  onInvite: () => void;
}

export function OrganizationMembersInviteAction({
  onInvite,
}: OrganizationMembersInviteActionProps) {
  const { t } = useTranslation(["common"]);

  return (
    <AntButton type="primary" icon={<Plus size={16} />} onClick={onInvite}>
      {t("common:ORG_MEMBERS_INVITE")}
    </AntButton>
  );
}

interface OrganizationMembersToolbarProps {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  filters: OrgMemberFilters;
  onFiltersChange: (next: OrgMemberFilters) => void;
  isFetching: boolean;
  isLoading: boolean;
}

export function OrganizationMembersToolbar({
  searchInput,
  onSearchInputChange,
  filters,
  onFiltersChange,
  isFetching,
  isLoading,
}: OrganizationMembersToolbarProps) {
  const { t } = useTranslation(["common"]);

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <AntInput
          variant="borderless"
          value={searchInput}
          onChange={(event) => onSearchInputChange(event.target.value)}
          placeholder={t("common:ORG_MEMBERS_SEARCH_PLACEHOLDER")}
          allowClear
          prefix={<Search className="size-4 text-muted-foreground" />}
          className="w-[360px] max-w-full"
        />

        <MembersFilterPopover value={filters} onChange={onFiltersChange} />
      </div>

      {isFetching && !isLoading ? <LoaderOne /> : null}
    </div>
  );
}
