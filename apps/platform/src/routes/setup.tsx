import { createFileRoute } from "@tanstack/react-router";

import { PlatformSetupPage } from "@/pages/platform-setup";

function PlatformSetupRoute() {
  const { setupState } = Route.useRouteContext();
  return <PlatformSetupPage setupState={setupState} />;
}

export const Route = createFileRoute("/setup")({
  component: PlatformSetupRoute,
});
