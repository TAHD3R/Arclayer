import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/repair/master-key/")({
  staticData: { titleKey: "setup:MASTER_KEY_REPAIR_TITLE" },
});
