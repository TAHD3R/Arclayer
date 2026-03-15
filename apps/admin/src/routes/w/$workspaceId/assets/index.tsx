import { createFileRoute } from "@tanstack/react-router";

type WorkspaceAssetsSearch = {
  q?: string;
  assetId?: string;
};

export const Route = createFileRoute("/w/$workspaceId/assets/")({
  staticData: { titleKey: "nav:NAV_ASSETS" },
  validateSearch: (search: Record<string, unknown>): WorkspaceAssetsSearch => {
    const q = typeof search.q === "string" && search.q.trim() ? search.q.trim() : undefined;
    const assetId =
      typeof search.assetId === "string" && search.assetId.trim()
        ? search.assetId.trim()
        : undefined;
    return {
      ...(q ? { q } : {}),
      ...(assetId ? { assetId } : {}),
    };
  },
});
