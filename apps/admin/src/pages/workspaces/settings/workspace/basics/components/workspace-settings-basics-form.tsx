import { Form } from "@arclayer/ui/form";
import { UserCenterSettingsSectionStack } from "@/pages/usercenter/shared/usercenter-settings-section-stack";
import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";
import { WorkspaceSettingsBasicsAccessPanel } from "./workspace-settings-basics-access-panel";
import { WorkspaceSettingsBasicsCorePanels } from "./workspace-settings-basics-core-panels";

export function WorkspaceSettingsBasicsForm(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;

  return (
    <Form {...c.form}>
      <UserCenterSettingsSectionStack mode="dialog">
        <WorkspaceSettingsBasicsCorePanels controller={c} />
        <WorkspaceSettingsBasicsAccessPanel controller={c} />
      </UserCenterSettingsSectionStack>
    </Form>
  );
}
