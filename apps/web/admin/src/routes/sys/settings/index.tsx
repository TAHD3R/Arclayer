import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/sys/settings/")({
  staticData: { titleKey: "sys:SYS_SETTINGS_TITLE" },
  beforeLoad: () => {
    throw redirect({
      to: "/sys/settings/$namespace",
      params: { namespace: "core" },
      replace: true,
    });
  },
});
