import { Button as AntButton, Input, Select } from "antd";
import { ConfirmDialog } from "@celestial/ui/confirm-dialog";
import { SettingDialog } from "@celestial/ui/setting-dialog";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";

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
    <SettingDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("team:TEAM_ROLES_ADD_ROLE_DIALOG_TITLE")}
      description={t("team:TEAM_ROLES_ADD_ROLE_DIALOG_DESC")}
      contentClassName="max-w-[640px]"
      footer={
        <>
          <AntButton type="text" onClick={onCancel} disabled={submitting}>
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
        </>
      }
    >
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("team:TEAM_ROLES_FIELD_TEMPLATE")}
          </label>
          <div className="text-label-secondary">{t("team:TEAM_ROLES_FIELD_TEMPLATE_HELP")}</div>
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
          <div className="text-label-secondary">{t("team:TEAM_ROLES_FIELD_NAME_HELP")}</div>
          <Input
            value={roleName}
            onChange={(event) => onRoleNameChange(event.target.value)}
            placeholder={t("team:TEAM_ROLES_FIELD_NAME")}
          />
        </div>

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">{t("team:TEAM_ROLES_FIELD_DESC")}</label>
          <div className="text-label-secondary">{t("team:TEAM_ROLES_FIELD_DESC_HELP")}</div>
          <Input.TextArea
            value={roleDescription}
            onChange={(event) => onRoleDescriptionChange(event.target.value)}
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder={t("team:TEAM_ROLES_FIELD_DESC")}
          />
        </div>
      </div>
    </SettingDialog>
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
    <ConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) onCancel();
      }}
      title={t("team:TEAM_ROLES_DELETE_TITLE")}
      description={t("team:TEAM_ROLES_DELETE_DESC", { roleName })}
      cancelText={t("common:CANCEL")}
      confirmText={t("team:TEAM_ACTION_DELETE")}
      danger
      loading={submitting}
      onConfirm={async () => {
        onConfirm();
      }}
    />
  );
}
