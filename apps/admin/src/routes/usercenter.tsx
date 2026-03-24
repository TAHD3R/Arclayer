import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/usercenter")({
  staticData: { titleKey: "account:ACCOUNT_SETTINGS_TITLE" },
  component: UserCenterRouteLayout,
});

function UserCenterRouteLayout() {
  return <Outlet />;
}
