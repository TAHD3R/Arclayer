"use client";

import { Button as AntButton, Select } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";

import type { Role } from "@/api/rbac";
import type { TeamMember } from "@/api/team";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("team:TEAM_EDIT_ROLES_DESC")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 py-2">
          <Select
            allowClear
            placeholder={t("team:TEAM_EDIT_ROLES_PLACEHOLDER")}
            loading={props.rolesLoading}
            value={props.value ?? undefined}
            onChange={(next) => props.onChange(next ? String(next) : null)}
            options={options}
            showSearch
            optionFilterProp="label"
            getPopupContainer={(node) => node.parentElement ?? document.body}
          />
        </div>

        <DialogFooter>
          <AntButton onClick={() => props.onOpenChange(false)} disabled={props.confirmLoading}>
            {t("common:CANCEL")}
          </AntButton>
          <AntButton
            type="primary"
            loading={props.confirmLoading}
            disabled={Boolean(props.confirmDisabled) || props.confirmLoading}
            onClick={props.onConfirm}
          >
            {t("common:CONFIRM")}
          </AntButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
