import { Plus, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@celestial/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@celestial/ui/input-group";
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
    <Button onClick={onInvite}>
      <Plus size={16} />
      {t("common:ORG_MEMBERS_INVITE")}
    </Button>
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
        <InputGroup className="w-[min(100%,22.5rem)]">
          <InputGroupAddon>
            <Search className="size-4 text-label-secondary" />
          </InputGroupAddon>
          <InputGroupInput
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
            placeholder={t("team:TEAM_SEARCH_PLACEHOLDER")}
          />
          {searchInput ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label={t("common:CLEAR")}
                size="icon-xs"
                onClick={() => onSearchInputChange("")}
              >
                <X className="size-3.5" />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>

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
