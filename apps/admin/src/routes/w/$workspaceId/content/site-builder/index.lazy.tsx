import { createLazyFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/pages/placeholder/page";

export const Route = createLazyFileRoute("/w/$workspaceId/content/site-builder/")({
  component: SiteBuilderPlaceholder,
});

function SiteBuilderPlaceholder() {
  return <PlaceholderPage titleKey="nav:NAV_CONTENT_SITE_BUILDER" />;
}
