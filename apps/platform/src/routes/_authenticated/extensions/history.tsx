import { createFileRoute } from "@tanstack/react-router";

import { ExtensionsHistoryPage } from "@/pages/extensions";

type ExtensionsHistorySearch = Readonly<{ operationId?: string }>;

function operationId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const Route = createFileRoute("/_authenticated/extensions/history")({
  validateSearch: (value: Record<string, unknown>): ExtensionsHistorySearch => ({
    operationId: operationId(value.operationId),
  }),
  component: function ExtensionsHistoryRoute() {
    return <ExtensionsHistoryPage operationId={Route.useSearch().operationId} />;
  },
});
