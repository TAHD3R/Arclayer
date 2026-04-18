import { AssetsPageView } from "./components/assets-page-view";

export function AssetsPage(props: { initialSearchQuery?: string; initialAssetId?: string }) {
  return (
    <AssetsPageView
      initialSearchQuery={props.initialSearchQuery}
      initialAssetId={props.initialAssetId}
    />
  );
}
