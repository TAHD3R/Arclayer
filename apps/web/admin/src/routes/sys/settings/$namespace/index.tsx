import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sys/settings/$namespace/")({
  staticData: { titleKey: "sys:SYS_SETTINGS_TITLE" },
});
