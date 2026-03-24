import { createFileRoute, redirect } from "@tanstack/react-router";
import { buildInboxSourceSearch } from "@/lib/routing/inbox-source";

export const Route = createFileRoute("/w/$workspaceId/notifications/")({
  staticData: { titleKey: "notifications:NOTIFICATIONS_PAGE_TITLE" },
  beforeLoad: ({ params }) => {
    const sourcePath = `/w/${params.workspaceId}/notifications`;
    throw redirect({
      to: "/me/inbox",
      search: buildInboxSourceSearch(sourcePath),
      replace: true,
    });
  },
});
