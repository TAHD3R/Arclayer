import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/me")({
  staticData: { titleKey: "account:ME_TITLE" },
  component: MeLayout,
});

function MeLayout() {
  // Personal center settings are now accessed via dialog only; `/me/*` remains
  // as a namespace for non-dialog pages like notifications inbox.
  return <Outlet />;
}
