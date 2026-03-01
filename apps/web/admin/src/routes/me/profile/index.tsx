import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/me/profile/")({
  staticData: { titleKey: "account:ME_TAB_PROFILE" },
});
