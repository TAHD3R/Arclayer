import { Form } from "antd";

import { ChromeTabs, ChromeTabsContent } from "@/components/ui/chrome-tabs";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

import { WorkspaceSettingsTabs } from "../../components/workspace-settings-tabs";
import type { WorkspaceSettingsFormValues } from "../../types";
import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";
import { WorkspaceSettingsBasicsAccessPanel } from "./workspace-settings-basics-access-panel";
import { WorkspaceSettingsBasicsCorePanels } from "./workspace-settings-basics-core-panels";

export function WorkspaceSettingsBasicsForm(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;

  return (
    <Form<WorkspaceSettingsFormValues>
      form={c.form}
      layout="vertical"
      requiredMark={false}
      autoComplete="off"
      disabled={c.disabled}
      initialValues={{
        name: c.initialWorkspaceName,
        slug: c.initialWorkspaceSlug,
        locale: c.initialWorkspaceLocale,
        timezone: c.initialWorkspaceTimezone,
        dateFormat: c.initialWorkspaceDateFormat,
        defaultRoleCode: c.initialDefaultRoleCode,
        assignRoleCode: c.initialDefaultRoleCode,
      }}
    >
      <ChromeTabs
        value="basics"
        onValueChange={(next) => c.onTabChange(next as WorkspaceSettingsTabKey)}
      >
        <WorkspaceSettingsTabs />

        <ChromeTabsContent value="basics">
          <div className="flex flex-col gap-8">
            <WorkspaceSettingsBasicsCorePanels controller={c} />
            <WorkspaceSettingsBasicsAccessPanel controller={c} />
          </div>
        </ChromeTabsContent>
      </ChromeTabs>
    </Form>
  );
}
