import { createFileRoute } from "@tanstack/react-router";

import { SystemJobsPage } from "@/pages/system/jobs/page";

export const Route = createFileRoute("/system/jobs/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_JOBS_PAGE_TITLE" },
  component: SystemJobsPage,
});
