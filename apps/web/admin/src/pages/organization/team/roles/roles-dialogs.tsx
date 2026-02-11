import { Button as AntButton, Input, Select } from "antd";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";
import type { DisplayOrganizationPermission, DisplayOrganizationRole } from "./roles-display";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

type CreateRoleDialogProps = {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  templateRoleCode: string;
  roleName: string;
  roleDescription: string;
  onTemplateRoleCodeChange: (roleCode: string) => void;
  onRoleNameChange: (value: string) => void;
  onRoleDescriptionChange: (value: string) => void;
  roleOptions: Array<{ value: string; label: string }>;
  t: Translate;
};

export function CreateRoleDialog(props: CreateRoleDialogProps) {
  const {
    open,
    onOpenChange,
    onCancel,
    onConfirm,
    submitting,
    templateRoleCode,
    roleName,
    roleDescription,
    onTemplateRoleCodeChange,
    onRoleNameChange,
    onRoleDescriptionChange,
    roleOptions,
    t,
  } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t("team:TEAM_ROLES_ADD_ROLE_DIALOG_TITLE")}</DialogTitle>
          <DialogDescription>{t("team:TEAM_ROLES_ADD_ROLE_DIALOG_DESC")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <label className="font-semibold text-foreground">
              {t("team:TEAM_ROLES_FIELD_TEMPLATE")}
            </label>
            <div className="text-muted-foreground">{t("team:TEAM_ROLES_FIELD_TEMPLATE_HELP")}</div>
            <Select
              value={templateRoleCode}
              onChange={(next) => onTemplateRoleCodeChange(String(next))}
              options={roleOptions}
              placeholder={t("team:TEAM_ROLES_FIELD_TEMPLATE_PLACEHOLDER")}
              getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
              className="w-full"
            />
          </div>

          <div className="grid gap-1.5">
            <label className="font-semibold text-foreground">{t("team:TEAM_ROLES_FIELD_NAME")}</label>
            <div className="text-muted-foreground">{t("team:TEAM_ROLES_FIELD_NAME_HELP")}</div>
            <Input
              value={roleName}
              onChange={(event) => onRoleNameChange(event.target.value)}
              placeholder={t("team:TEAM_ROLES_FIELD_NAME")}
            />
          </div>

          <div className="grid gap-1.5">
            <label className="font-semibold text-foreground">{t("team:TEAM_ROLES_FIELD_DESC")}</label>
            <div className="text-muted-foreground">{t("team:TEAM_ROLES_FIELD_DESC_HELP")}</div>
            <Input.TextArea
              value={roleDescription}
              onChange={(event) => onRoleDescriptionChange(event.target.value)}
              autoSize={{ minRows: 3, maxRows: 6 }}
              placeholder={t("team:TEAM_ROLES_FIELD_DESC")}
            />
          </div>
        </div>

        <DialogFooter>
          <AntButton onClick={onCancel} disabled={submitting}>
            {t("common:CANCEL")}
          </AntButton>
          <AntButton
            type="primary"
            loading={submitting}
            onClick={onConfirm}
            disabled={!roleName.trim()}
          >
            {t("common:CONFIRM")}
          </AntButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DeleteRoleDialogProps = {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  roleName: string;
  submitting: boolean;
  t: Translate;
};

export function DeleteRoleDialog(props: DeleteRoleDialogProps) {
  const { open, onOpenChange, onCancel, onConfirm, roleName, submitting, t } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("team:TEAM_ROLES_DELETE_TITLE")}</DialogTitle>
          <DialogDescription>
            {t("team:TEAM_ROLES_DELETE_DESC", { roleName })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <AntButton onClick={onCancel} disabled={submitting}>
            {t("common:CANCEL")}
          </AntButton>
          <AntButton danger type="primary" loading={submitting} onClick={onConfirm}>
            {t("team:TEAM_ACTION_DELETE")}
          </AntButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PermissionEditDialogProps = {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  permission: DisplayOrganizationPermission | null;
  displayRoles: DisplayOrganizationRole[];
  permissionDraft: Record<string, boolean>;
  onRoleCheckedChange: (roleCode: string, checked: boolean) => void;
  t: Translate;
};

export function PermissionEditDialog(props: PermissionEditDialogProps) {
  const {
    open,
    onOpenChange,
    onCancel,
    onConfirm,
    submitting,
    permission,
    displayRoles,
    permissionDraft,
    onRoleCheckedChange,
    t,
  } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[680px]">
        <DialogHeader>
          <DialogTitle>
            {permission
              ? t("team:TEAM_ROLES_PERMISSION_DIALOG_TITLE", {
                  permissionName: permission.displayName,
                })
              : ""}
          </DialogTitle>
          <DialogDescription>
            {permission?.displayDescription || t("team:TEAM_ROLES_PERMISSION_DIALOG_DESC")}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[420px] overflow-auto rounded-md border bg-card p-2">
          {displayRoles.length ? (
            displayRoles.map((role) => {
              const checked = Boolean(permissionDraft[role.code]);
              const disabled = role.isSystem;

              return (
                <label
                  key={role.code}
                  className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-70"
                  data-disabled={disabled}
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(value) => onRoleCheckedChange(role.code, Boolean(value))}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">
                      {role.name}
                      {role.isSystem ? (
                        <span className="ml-2 font-normal text-muted-foreground">
                          ({t("team:TEAM_ROLES_PERMISSION_READ_ONLY")})
                        </span>
                      ) : null}
                    </div>
                    {role.description ? (
                      <div className="mt-0.5 line-clamp-2 text-muted-foreground">
                        {role.description}
                      </div>
                    ) : null}
                  </div>
                </label>
              );
            })
          ) : (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t("team:TEAM_ROLES_PERMISSION_EMPTY_ROLES")}
            </div>
          )}
        </div>

        <DialogFooter>
          <AntButton onClick={onCancel} disabled={submitting}>
            {t("common:CANCEL")}
          </AntButton>
          <AntButton type="primary" loading={submitting} onClick={onConfirm}>
            {t("common:CONFIRM")}
          </AntButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
