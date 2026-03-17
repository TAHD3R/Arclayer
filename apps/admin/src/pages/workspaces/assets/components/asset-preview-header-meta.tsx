import { AssetMimeTag, AssetPurposeTag, AssetVisibilityTag } from "@/components/ui/tags";
import type { AssetMasonryItem } from "@/types/assets-masonry";

import type { useAssetPreviewDialogController } from "./asset-preview-dialog-controller";
import { getMimeLabel, getPurposeLabel, getVisibilityLabel } from "./asset-masonry-tile";

type AssetPreviewController = ReturnType<typeof useAssetPreviewDialogController>;

export function AssetPreviewHeaderMeta(props: {
  active: AssetMasonryItem;
  controller: AssetPreviewController;
}) {
  return (
    <span className="mt-2 flex flex-col gap-2">
      <span className="text-caption text-label-secondary">
        {props.controller.uploaderAndTimeText}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <AssetMimeTag
          title={props.active.mimeType || undefined}
          label={getMimeLabel(props.active.mimeType, props.controller.t)}
        />
        <AssetVisibilityTag
          visibility={props.controller.displayVisibility}
          label={getVisibilityLabel(props.controller.displayVisibility, props.controller.t)}
        />
        <AssetPurposeTag
          purpose={props.controller.displayPurpose}
          label={getPurposeLabel(props.controller.displayPurpose, props.controller.t)}
        />
      </span>
    </span>
  );
}
