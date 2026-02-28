import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  staticData: { titleKey: "nav:NAV_DASHBOARD" },
});
