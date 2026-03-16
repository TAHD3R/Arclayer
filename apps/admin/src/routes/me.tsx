import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/me")({
  staticData: { titleKey: "account:ME_TITLE" },
  component: MeLayout,
});

function MeLayout() {
  // `/me/*` remains as an account-scoped namespace for pages like notifications
  // inbox that should render inside the account shell without requiring a menu
  // entry.
  return <Outlet />;
}
