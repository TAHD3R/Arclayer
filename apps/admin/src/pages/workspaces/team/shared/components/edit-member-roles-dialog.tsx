"use client";

import { Button as AntButton, Select } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

import type { Role, TeamMember } from "@/types/api";
import { SettingDialog } from "@celestial/ui/setting-dialog";

export function EditMemberRolesDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMember | null;
  roles: Role[];
  rolesLoading?: boolean;
  value: string | null;
  onChange: (next: string | null) => void;
  onConfirm: () => void;
  confirmLoading?: boolean;
  confirmDisabled?: boolean;
}) {
  const { t } = useTranslation(["team", "common"]);

  const options = React.useMemo(() => {
    return props.roles.map((r) => ({
      label: r.name || r.code,
      value: r.code,
    }));
  }, [props.roles]);

  const title = props.member
    ? t("team:TEAM_EDIT_ROLES_TITLE", { username: props.member.username })
    : t("team:TEAM_EDIT_ROLES_TITLE");

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={title}
      description={t("team:TEAM_EDIT_ROLES_DESC")}
      contentClassName="sm:max-w-xl"
      footer={
        <>
          <AntButton
            autoInsertSpace={false}
            type="text"
            onClick={() => props.onOpenChange(false)}
            disabled={props.confirmLoading}
          >
            {t("common:CANCEL")}
          </AntButton>
          <AntButton
            autoInsertSpace={false}
            type="primary"
            loading={props.confirmLoading}
            disabled={Boolean(props.confirmDisabled) || props.confirmLoading}
            onClick={props.onConfirm}
          >
            {t("common:CONFIRM")}
          </AntButton>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("team:TEAM_INVITE_FIELD_ROLE")}
          </label>
          <div className="text-label-secondary">{t("team:TEAM_EDIT_ROLES_FIELD_ROLE_HELP")}</div>
          <Select
            allowClear
            placeholder={t("team:TEAM_EDIT_ROLES_PLACEHOLDER")}
            loading={props.rolesLoading}
            value={props.value ?? undefined}
            onChange={(next) => props.onChange(next ? String(next) : null)}
            options={options}
            showSearch
            optionFilterProp="label"
            getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
          />
        </div>
      </div>
    </SettingDialog>
  );
}
