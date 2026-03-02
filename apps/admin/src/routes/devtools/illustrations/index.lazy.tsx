import { createLazyFileRoute } from "@tanstack/react-router";

import { IllustrationsDebugPage } from "@/pages/__dev/illustrations/page";

export const Route = createLazyFileRoute("/devtools/illustrations/")({
  component: IllustrationsDebugPage,
});
