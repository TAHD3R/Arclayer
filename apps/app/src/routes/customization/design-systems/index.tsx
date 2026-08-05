import { createFileRoute } from "@tanstack/react-router";

import { CustomizationPage } from "@/pages/customization/page";

export const Route = createFileRoute("/customization/design-systems/")({
  staticData: { titleKey: "settings:CUSTOMIZATION_DESIGN_SYSTEMS_TITLE" },
  component: () => <CustomizationPage section="design-systems" />,
});
