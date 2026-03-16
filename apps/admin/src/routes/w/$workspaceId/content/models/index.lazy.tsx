import { createLazyFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/pages/placeholder/page";

export const Route = createLazyFileRoute("/w/$workspaceId/content/models/")({
  component: ContentModelsPlaceholder,
});

function ContentModelsPlaceholder() {
  return (
    <PlaceholderPage
      titleKey="nav:NAV_CONTENT_MODELS"
      descriptionKey="common:WORKSPACE_CONTENT_MODELS_DESC"
    />
  );
}
