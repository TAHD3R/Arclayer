import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/me/preferences/")({
  staticData: { titleKey: "account:ME_TAB_PREFERENCES" },
});
