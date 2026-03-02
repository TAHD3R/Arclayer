import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/devtools/illustrations/")({
  staticData: { titleKey: "debug:ILLUSTRATIONS_DEBUG_TITLE" },
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
});
