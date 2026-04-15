import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/usercenter/security/")({
  staticData: { titleKey: "account:ME_TAB_SECURITY" },
  beforeLoad: () => {
    throw redirect({ to: "/usercenter/profile", replace: true });
  },
});
