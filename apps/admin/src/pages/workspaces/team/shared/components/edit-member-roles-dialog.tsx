"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@celestial/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@celestial/ui/select";
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
          <Button
            variant="ghost"
            onClick={() => props.onOpenChange(false)}
            disabled={props.confirmLoading}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            loading={props.confirmLoading}
            disabled={Boolean(props.confirmDisabled) || props.confirmLoading}
            onClick={props.onConfirm}
          >
            {t("common:CONFIRM")}
          </Button>
        </>
      }
    >
      <div className="grid gap-1.5">
        <label className="font-semibold text-foreground">{t("team:TEAM_INVITE_FIELD_ROLE")}</label>
        <div className="text-label-secondary">{t("team:TEAM_EDIT_ROLES_FIELD_ROLE_HELP")}</div>
        <Select
          value={props.value ?? "__none__"}
          onValueChange={(next) => props.onChange(next === "__none__" ? null : String(next))}
        >
          <SelectTrigger className="w-full" disabled={props.rolesLoading}>
            <SelectValue placeholder={t("team:TEAM_EDIT_ROLES_PLACEHOLDER")} />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value="__none__">{t("common:NA")}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </SettingDialog>
  );
}
