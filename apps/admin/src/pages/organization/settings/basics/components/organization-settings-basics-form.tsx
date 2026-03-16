import { Form } from "@arclayer/ui/form";
import { ChromeTabs, ChromeTabsContent } from "@arclayer/ui/chrome-tabs";

import type { OrganizationSettingsTabKey } from "../../types";
import { OrganizationSettingsTabs } from "../../components/organization-settings-tabs";
import type { OrganizationSettingsBasicsController } from "../hooks/use-organization-settings-basics-controller";
import { OrganizationSettingsBasicsAccessPanel } from "./organization-settings-basics-access-panel";
import { OrganizationSettingsBasicsCorePanels } from "./organization-settings-basics-core-panels";

export function OrganizationSettingsBasicsForm(props: {
  controller: OrganizationSettingsBasicsController;
}) {
  const c = props.controller;

  return (
    <Form {...c.form}>
      <ChromeTabs
        value={c.tab}
        onValueChange={(next) => c.onTabChange(next as OrganizationSettingsTabKey)}
      >
        <OrganizationSettingsTabs />

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
