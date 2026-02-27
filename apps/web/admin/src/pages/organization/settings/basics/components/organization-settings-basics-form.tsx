import { Form } from "antd";

import { ChromeTabs, ChromeTabsContent } from "@/components/ui/chrome-tabs";

import type { OrganizationSettingsTabKey } from "../../types";
import { OrganizationSettingsTabs } from "../../components/organization-settings-tabs";
import type {
  OrganizationSettingsBasicsController,
  OrganizationSettingsBasicsFormValues,
} from "../hooks/use-organization-settings-basics-controller";
import { OrganizationSettingsBasicsAccessPanel } from "./organization-settings-basics-access-panel";
import { OrganizationSettingsBasicsCorePanels } from "./organization-settings-basics-core-panels";

export function OrganizationSettingsBasicsForm(props: {
  controller: OrganizationSettingsBasicsController;
}) {
  const c = props.controller;

  return (
    <Form<OrganizationSettingsBasicsFormValues>
      form={c.form}
      layout="vertical"
      requiredMark={false}
      autoComplete="off"
      disabled={c.disabled}
      initialValues={{
        name: c.initialOrgName,
        locale: c.initialOrgLocale,
        timezone: c.initialOrgTimezone,
        dateFormat: c.initialOrgDateFormat,
        defaultRoleCode: c.initialDefaultRoleCode,
        assignRoleCode: c.initialDefaultRoleCode,
      }}
    >
      <ChromeTabs
        value={c.tab}
        onValueChange={(next) => c.onTabChange(next as OrganizationSettingsTabKey)}
      >
        <OrganizationSettingsTabs deploymentEnabled={c.runtime.deploymentSettingsEnabled} />

        <ChromeTabsContent value="basics">
          <div className="flex flex-col gap-8">
            <OrganizationSettingsBasicsCorePanels controller={c} />
            <OrganizationSettingsBasicsAccessPanel controller={c} />
          </div>
        </ChromeTabsContent>
      </ChromeTabs>
    </Form>
  );
}
