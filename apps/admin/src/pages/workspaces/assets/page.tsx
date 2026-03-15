import { useSearch } from "@tanstack/react-router";

import { AssetsPageView } from "./components/assets-page-view";

export function AssetsPage() {
  const { q, assetId } = useSearch({ from: "/w/$workspaceId/assets/" });
  return <AssetsPageView initialSearchQuery={q} initialAssetId={assetId} />;
}
