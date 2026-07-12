import { createFileRoute } from "@tanstack/react-router";

import { SystemAuditLogPage } from "@/pages/system/audit-log/page";

export const Route = createFileRoute("/system/audit-log/")({
  staticData: { titleKey: "platform:AUDIT_TITLE" },
  component: SystemAuditLogPage,
});
