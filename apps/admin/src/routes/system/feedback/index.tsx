import { createFileRoute } from "@tanstack/react-router";

import { SystemFeedbackCenterPage } from "@/pages/system/feedback/page";

function SystemFeedbackCenterRoute() {
  const search = Route.useSearch();
  return <SystemFeedbackCenterPage initialReporterUserId={search.reporterUserId} />;
}

export const Route = createFileRoute("/system/feedback/")({
  staticData: { titleKey: "platform:FEEDBACK_CENTER_TITLE" },
  validateSearch: (search: Record<string, unknown>) => {
    const reporterUserId =
      typeof search.reporterUserId === "string" ? search.reporterUserId.trim() : "";
    return reporterUserId ? { reporterUserId } : {};
  },
  component: SystemFeedbackCenterRoute,
});
