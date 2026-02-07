import { createFileRoute } from "@tanstack/react-router";

import { PluginsInstalledView } from "@/pages/plugins/installed/page";

export const Route = createFileRoute("/plugins/installed/")({
  component: PluginsInstalledPage,
});

function PluginsInstalledPage() {
  return <PluginsInstalledView scope="organization" />;
}
