import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/account")({
  staticData: { titleKey: "account:ACCOUNT_SETTINGS_TITLE" },
  component: AccountRouteLayout,
});

function AccountRouteLayout() {
  return <Outlet />;
}
