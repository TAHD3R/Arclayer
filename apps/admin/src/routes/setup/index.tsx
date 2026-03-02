import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/setup/")({
  staticData: { titleKey: "setup:SETUP_TITLE" },
});
