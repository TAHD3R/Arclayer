import { createLazyFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/pages/placeholder/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/seo/")({
  component: SeoPlaceholder,
});

function SeoPlaceholder() {
  return (
    <PlaceholderPage titleKey="nav:NAV_SETTINGS_SEO" descriptionKey="common:WORKSPACE_SEO_DESC" />
  );
}
