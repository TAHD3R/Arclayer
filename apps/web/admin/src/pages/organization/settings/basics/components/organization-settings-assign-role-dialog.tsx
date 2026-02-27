import { Button, Form, Input } from "antd";
import { useCallback } from "react";

import { SettingDialog } from "@/components/settings-primitives/setting-dialog";

import type { OrganizationSettingsBasicsController } from "../hooks/use-organization-settings-basics-controller";

function dialogFieldLabel(title: string, description: string) {
  return (
    <div className="grid gap-1.5">
      <span className="font-semibold text-foreground">{title}</span>
      <span className="text-label-secondary">{description}</span>
    </div>
  );
}

export function OrganizationSettingsAssignRoleDialog(props: {
  controller: OrganizationSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;

  const handleConfirm = useCallback(() => {
    void c.withSavingKey("organization:assignRoleAll", async () => {
      const roleValues = await c.form.validateFields(["assignRoleCode"]);
      const values = await c.assignRoleDialogForm.validateFields();
      await c.assignRoleMutation.mutateAsync({
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
      title={t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_TITLE")}
      description={t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_DESC")}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="text" onClick={c.closeAssignRoleDialog}>
            {t("common:CANCEL")}
          </Button>
          <Button
            type="primary"
            loading={c.savingKey === "organization:assignRoleAll"}
            disabled={c.disabled || !c.isOwner || c.roleOptions.length === 0}
            onClick={handleConfirm}
          >
            {t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_CONFIRM")}
          </Button>
        </div>
      }
    >
      <Form form={c.assignRoleDialogForm} layout="vertical" requiredMark={false} autoComplete="off">
        <Form.Item
          name="confirmName"
          label={dialogFieldLabel(
            t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL"),
            t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_DIALOG_CONFIRM_DESC", {
              role: c.assignRoleLabel,
            }),
          )}
          rules={[
            {
              required: true,
              message: t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_CONFIRM_NAME_REQUIRED"),
            },
            {
              validator: async (_, value) => {
                if (String(value || "").trim() === c.persistedOrgName) {
                  return;
                }
                throw new Error(t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_CONFIRM_NAME_MISMATCH"));
              },
            },
          ]}
          style={{ marginBottom: 0 }}
        >
          <Input
            size="large"
            placeholder={t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_CONFIRM_NAME_PLACEHOLDER")}
          />
        </Form.Item>
      </Form>
    </SettingDialog>
  );
}
