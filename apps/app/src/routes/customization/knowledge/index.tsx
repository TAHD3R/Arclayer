import { createFileRoute } from "@tanstack/react-router";

import { CustomizationPage } from "@/pages/customization/page";

export const Route = createFileRoute("/customization/knowledge/")({
  staticData: { titleKey: "settings:CUSTOMIZATION_KNOWLEDGE_TITLE" },
  component: () => <CustomizationPage section="knowledge" />,
});
