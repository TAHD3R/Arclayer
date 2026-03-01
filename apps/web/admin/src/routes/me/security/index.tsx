import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/me/security/")({
  staticData: { titleKey: "account:ME_TAB_SECURITY" },
});
