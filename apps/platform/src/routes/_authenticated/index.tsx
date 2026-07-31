import { createFileRoute } from "@tanstack/react-router";

import { OperationsInboxPage } from "@/pages/operations-inbox";
import { parseOperationsInboxSearch } from "@/operations/operations-routing";

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: parseOperationsInboxSearch,
  component: () => {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <OperationsInboxPage
        onSearchChange={(next) => void navigate({ search: next, replace: true })}
        search={search}
      />
    );
  },
});
