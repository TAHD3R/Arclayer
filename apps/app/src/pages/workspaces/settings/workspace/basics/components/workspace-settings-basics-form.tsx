import { Form } from "@arclayer/ui/form";
import { UserCenterSettingsSectionStack } from "@/pages/usercenter/shared/usercenter-settings-section-stack";
import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";
import { WorkspaceSettingsBasicsAccessPanel } from "./workspace-settings-basics-access-panel";
import { WorkspaceSettingsBasicsCommercePanel } from "./workspace-settings-basics-commerce-panel";
import { WorkspaceSettingsBasicsCorePanels } from "./workspace-settings-basics-core-panels";
import { WorkspaceSettingsDangerSection } from "./workspace-settings-danger-section";

export function WorkspaceSettingsBasicsForm(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;

  return (
    <Form {...c.form}>
      <UserCenterSettingsSectionStack mode="dialog">
        <WorkspaceSettingsBasicsCorePanels controller={c} />
        <WorkspaceSettingsBasicsAccessPanel controller={c} />
        <WorkspaceSettingsBasicsCommercePanel workspaceId={c.workspaceId} />
        <WorkspaceSettingsDangerSection workspaceId={c.workspaceId} />
      </UserCenterSettingsSectionStack>
    </Form>
  );
}
