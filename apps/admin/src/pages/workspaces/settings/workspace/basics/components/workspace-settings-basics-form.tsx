import { Form } from "@arclayer/ui/form";
import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";
import { WorkspaceSettingsBasicsAccessPanel } from "./workspace-settings-basics-access-panel";
import { WorkspaceSettingsBasicsCorePanels } from "./workspace-settings-basics-core-panels";

export function WorkspaceSettingsBasicsForm(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;

  return (
    <Form {...c.form}>
      <div className="flex flex-col gap-8">
        <WorkspaceSettingsBasicsCorePanels controller={c} />
        <WorkspaceSettingsBasicsAccessPanel controller={c} />
      </div>
    </Form>
  );
}
