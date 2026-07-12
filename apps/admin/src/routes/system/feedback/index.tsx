import { createFileRoute } from "@tanstack/react-router";

import { SystemFeedbackCenterPage } from "@/pages/system/feedback/page";

export const Route = createFileRoute("/system/feedback/")({
  staticData: { titleKey: "platform:FEEDBACK_CENTER_TITLE" },
  component: SystemFeedbackCenterPage,
});
