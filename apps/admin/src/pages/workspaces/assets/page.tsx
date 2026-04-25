import { AssetsPageView } from "./components/assets-page-view";

export function AssetsPage(props: {
  projectId: string;
  initialSearchQuery?: string;
  initialAssetId?: string;
}) {
  return (
    <AssetsPageView
      projectId={props.projectId}
      initialSearchQuery={props.initialSearchQuery}
      initialAssetId={props.initialAssetId}
    />
  );
}
