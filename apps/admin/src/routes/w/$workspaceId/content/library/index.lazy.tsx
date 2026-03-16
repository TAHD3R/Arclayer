import { createLazyFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/pages/placeholder/page";

export const Route = createLazyFileRoute("/w/$workspaceId/content/library/")({
  component: ContentLibraryPlaceholder,
});

function ContentLibraryPlaceholder() {
  return <PlaceholderPage titleKey="nav:NAV_CONTENT_LIBRARY" />;
}
