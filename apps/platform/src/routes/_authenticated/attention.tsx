import { createFileRoute, Outlet } from "@tanstack/react-router";

import { parseNeedsAttentionSearch } from "@/operations/operations-routing";
import { NeedsAttentionPage } from "@/pages/needs-attention";

export const Route = createFileRoute("/_authenticated/attention")({
  validateSearch: parseNeedsAttentionSearch,
  component: function NeedsAttentionRoute() {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <>
        <NeedsAttentionPage
          onSearchChange={(next) => void navigate({ search: next, replace: true })}
          search={search}
        />
        <Outlet />
      </>
    );
  },
});
