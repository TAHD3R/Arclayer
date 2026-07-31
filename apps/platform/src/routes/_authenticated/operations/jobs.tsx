import { createFileRoute } from "@tanstack/react-router";

import { parsePlatformJobsSearch } from "@/operations/operations-routing";
import { PlatformJobsPage } from "@/pages/platform-jobs";

export const Route = createFileRoute("/_authenticated/operations/jobs")({
  validateSearch: parsePlatformJobsSearch,
  component: () => <PlatformJobsPage search={Route.useSearch()} />,
});
