import { Button, Form, Input } from "antd";
import { UserCog } from "lucide-react";
import { useCallback } from "react";

import { SettingDialog } from "@celestial/ui/setting-dialog";

import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";

function dialogFieldLabel(title: string, description: string) {
  return (
    <div className="grid gap-1.5">
      <span className="font-semibold text-foreground">{title}</span>
      <span className="text-label-secondary">{description}</span>
    </div>
  );
}

export function WorkspaceSettingsAssignRoleDialog(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;

  const handleConfirm = useCallback(() => {
    void c.withSavingKey("workspace:assignRoleAll", async () => {
      const roleValues = await c.form.validateFields(["assignRoleCode"]);
      const values = await c.assignRoleDialogForm.validateFields();
      await c.assignWorkspaceRoleMutation.mutateAsync({
        roleCode: String(roleValues.assignRoleCode),
        confirmName: String(values.confirmName || "").trim(),
      });
      c.closeAssignRoleDialog();
    });
  }, [c]);

  return (
    <SettingDialog
      open={c.assignRoleDialogOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) c.closeAssignRoleDialog();
      }}
      title={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_DESC")}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="text" onClick={c.closeAssignRoleDialog} autoInsertSpace={false}>
            {t("common:CANCEL")}
          </Button>
          <Button
            autoInsertSpace={false}
            type="primary"
            icon={<UserCog className="size-4" aria-hidden="true" />}
            loading={c.savingKey === "workspace:assignRoleAll"}
            disabled={c.disabled || c.roleOptions.length === 0}
            onClick={handleConfirm}
          >
            {t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM")}
          </Button>
        </div>
      }
    >
      <Form
        form={c.assignRoleDialogForm}
        layout="vertical"
        requiredMark={false}
        autoComplete="off"
        className="grid gap-4 py-2"
      >
        <Form.Item
          name="confirmName"
          label={dialogFieldLabel(
            t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL"),
            t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_DIALOG_CONFIRM_DESC", {
              role: c.assignRoleLabel,
            }),
          )}
          rules={[
            {
              required: true,
              message: t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM_NAME_REQUIRED"),
            },
            {
              validator: async (_, value) => {
                if (String(value || "").trim() === c.persistedWorkspaceName) {
                  return;
                }
                throw new Error(
                  t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM_NAME_MISMATCH"),
                );
              },
            },
          ]}
          style={{ marginBottom: 0 }}
        >
          <Input
            size="large"
            placeholder={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM_NAME_PLACEHOLDER")}
          />
        </Form.Item>
      </Form>
    </SettingDialog>
  );
}
