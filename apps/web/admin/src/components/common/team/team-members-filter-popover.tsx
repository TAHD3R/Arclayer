import { Button, Select } from "antd";
import { Filter } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Role } from "@/api/rbac";
import type { MembershipStatus, UserStatus } from "@/api/team";
export type TeamMembersFilters = {
  membershipStatus?: MembershipStatus;
  userStatus?: UserStatus;
  roleCode?: string;
};

export type TeamMemberSort =
  | "user__username"
  | "-user__username"
  | "user__email"
  | "-user__email"
  | "user__last_login_at"
  | "-user__last_login_at"
  | "status"
  | "-status"
  | "-created_at";

export function TeamMembersFilterPopover(props: {
  value: TeamMembersFilters;
  onChange: (next: TeamMembersFilters) => void;
  roles: Role[];
  rolesLoading?: boolean;
  sort: TeamMemberSort;
  onSortChange: (next: TeamMemberSort) => void;
  defaultSort?: TeamMemberSort;
}) {
  const { t } = useTranslation(["team"]);

  const membershipStatusOptions = useMemo(
    () => [
      { label: t("team:TEAM_FILTER_ALL"), value: "all" },
      { label: t("team:TEAM_MEMBERSHIP_STATUS_ACTIVE"), value: "active" },
      { label: t("team:TEAM_MEMBERSHIP_STATUS_INVITED"), value: "invited" },
      { label: t("team:TEAM_MEMBERSHIP_STATUS_DISABLED"), value: "disabled" },
    ],
    [t],
  );

  const userStatusOptions = useMemo(
    () => [
      { label: t("team:TEAM_FILTER_ALL"), value: "all" },
      { label: t("team:TEAM_USER_STATUS_ACTIVE"), value: "active" },
      { label: t("team:TEAM_USER_STATUS_DISABLED"), value: "disabled" },
      { label: t("team:TEAM_USER_STATUS_LOCKED"), value: "locked" },
    ],
    [t],
  );

  const roleOptions = useMemo(() => {
    return [
      { label: t("team:TEAM_FILTER_ALL"), value: "all" },
      ...props.roles.map((r) => ({
        label: r.name || r.code,
        value: r.code,
      })),
    ];
  }, [props.roles, t]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="text"
          icon={<Filter size={18} />}
          title={t("team:TEAM_FILTER_TITLE")}
          className="!h-10 !bg-transparent hover:!bg-accent/40"
        >
          {t("team:TEAM_FILTER_TITLE")}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 p-3">
        <div className="font-bold">{t("team:TEAM_FILTER_TITLE")}</div>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("team:TEAM_FILTER_FIELD_SORT")}
            </div>
            <Select
              value={props.sort}
              onChange={props.onSortChange}
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              options={[
                { label: t("team:TEAM_SORT_NEWEST"), value: "-created_at" },
                { label: t("team:TEAM_SORT_USERNAME_AZ"), value: "user__username" },
                { label: t("team:TEAM_SORT_USERNAME_ZA"), value: "-user__username" },
                { label: t("team:TEAM_SORT_EMAIL_AZ"), value: "user__email" },
                { label: t("team:TEAM_SORT_EMAIL_ZA"), value: "-user__email" },
                { label: t("team:TEAM_SORT_LAST_LOGIN_RECENT"), value: "-user__last_login_at" },
                { label: t("team:TEAM_SORT_LAST_LOGIN_OLD"), value: "user__last_login_at" },
                { label: t("team:TEAM_SORT_MEMBER_STATUS"), value: "status" },
                { label: t("team:TEAM_SORT_MEMBER_STATUS_DESC"), value: "-status" },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("team:TEAM_FILTER_FIELD_MEMBERSHIP_STATUS")}
            </div>
            <Select
              // antd Select emits string values; keep the model typed and cast at the boundary
              // so the rest of the app stays type-safe.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              value={props.value.membershipStatus ?? "all"}
              onChange={(v) => {
                const next = v === "all" ? undefined : (v as MembershipStatus);
                props.onChange({ ...props.value, membershipStatus: next });
              }}
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              options={membershipStatusOptions}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("team:TEAM_FILTER_FIELD_USER_STATUS")}
            </div>
            <Select
              value={props.value.userStatus ?? "all"}
              onChange={(v) => {
                const next = v === "all" ? undefined : (v as UserStatus);
                props.onChange({ ...props.value, userStatus: next });
              }}
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              options={userStatusOptions}
            />
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            <div className="text-footnote text-label-secondary">
              {t("team:TEAM_FILTER_FIELD_ROLE")}
            </div>
            <Select
              showSearch
              optionFilterProp="label"
              loading={props.rolesLoading}
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              value={props.value.roleCode ?? "all"}
              onChange={(v) =>
                props.onChange({ ...props.value, roleCode: v === "all" ? undefined : v })
              }
              options={roleOptions}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button
            onClick={() => {
              props.onChange({
                membershipStatus: undefined,
                userStatus: undefined,
                roleCode: undefined,
              });
              props.onSortChange(props.defaultSort ?? "-created_at");
            }}
          >
            {t("team:TEAM_FILTER_RESET")}
          </Button>

          <PopoverClose asChild>
            <Button type="primary">{t("team:TEAM_FILTER_DONE")}</Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}
