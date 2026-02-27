import { Button, Form, Select } from "antd";

import { Accordion } from "@/components/ui/accordion";
import { SettingAccordionItem } from "@/components/settings-primitives/setting-accordion-item";
import { SettingPanel } from "@/components/settings-primitives/setting-panel";

import type { OrganizationSettingsBasicsController } from "../hooks/use-organization-settings-basics-controller";

export function OrganizationSettingsBasicsAccessPanel(props: {
  controller: OrganizationSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;

  return (
    <SettingPanel
      title={t("settings:SETTINGS_ORG_ACCESS_PANEL_TITLE")}
      description={t("settings:SETTINGS_ORG_ACCESS_PANEL_DESC")}
    >
      <div className="rounded-lg border border-border">
        <Accordion type="single" collapsible className="px-0">
          <SettingAccordionItem
            value="organization_default_role"
            variant="action"
            title={t("settings:SETTINGS_ORG_DEFAULT_ROLE_TITLE")}
            description={t("settings:SETTINGS_ORG_DEFAULT_ROLE_DESC")}
            showSummary
            summary={c.defaultRoleLabel}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            keepRendered
            disabled={c.disabled || !c.coreQuery.data || c.roleOptions.length === 0}
            confirmText={t("settings:SETTINGS_SAVE")}
            confirmLoading={c.savingKey === "organization:defaultRole"}
            onConfirm={() =>
              void c.withSavingKey("organization:defaultRole", async () => {
                const values = await c.form.validateFields(["defaultRoleCode"]);
                await c.patchCoreMutation.mutateAsync({
                  defaultRoleCode: String(values.defaultRoleCode),
                });
              })
            }
            onReset={
              c.isDefaultRoleDirty
                ? () =>
                    void c.withSavingKey("reset:organization:defaultRole", async () => {
                      c.form.setFieldValue("defaultRoleCode", c.initialDefaultRoleCode);
                      await c.patchCoreMutation.mutateAsync({
                        defaultRoleCode: String(c.initialDefaultRoleCode),
                      });
                    })
                : undefined
            }
            resetLoading={c.savingKey === "reset:organization:defaultRole"}
          >
            <Form.Item
              name="defaultRoleCode"
              rules={[
                {
                  required: true,
                  message: t("settings:SETTINGS_ORG_DEFAULT_ROLE_REQUIRED"),
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Select size="large" options={c.roleOptions} optionFilterProp="label" showSearch />
            </Form.Item>
          </SettingAccordionItem>

          <SettingAccordionItem
            value="organization_assign_role_to_all"
            variant="action"
            title={t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_TITLE")}
            description={t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_DESC")}
            showSummary={false}
            keepRendered
            disabled={c.disabled || !c.isOwner || c.roleOptions.length === 0}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Form.Item
                name="assignRoleCode"
                rules={[
                  {
                    required: true,
                    message: t("settings:SETTINGS_ORG_DEFAULT_ROLE_REQUIRED"),
                  },
                ]}
                style={{ marginBottom: 0 }}
                className="flex-1"
              >
                <Select size="large" options={c.roleOptions} optionFilterProp="label" showSearch />
              </Form.Item>

              <Button
                type="primary"
                disabled={c.disabled || !c.isOwner || c.roleOptions.length === 0}
                onClick={() => {
                  void c.form
                    .validateFields(["assignRoleCode"])
                    .then(() => {
                      c.assignRoleDialogForm.resetFields();
                      c.setAssignRoleDialogOpen(true);
                    })
                    .catch(() => undefined);
                }}
              >
                {t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_CONFIRM")}
              </Button>
            </div>
          </SettingAccordionItem>
        </Accordion>
      </div>
    </SettingPanel>
  );
}
