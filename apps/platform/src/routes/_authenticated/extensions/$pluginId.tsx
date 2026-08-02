import { createFileRoute } from "@tanstack/react-router";

import { ExtensionsDetailPage } from "@/pages/extensions";

export const Route = createFileRoute("/_authenticated/extensions/$pluginId")({
  component: function ExtensionsDetailRoute() {
    return <ExtensionsDetailPage pluginId={Route.useParams().pluginId} />;
  },
});
