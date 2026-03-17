import { Plus } from "lucide-react";

import { Input } from "@arclayer/ui/input";

import { UserAvatar } from "@/components/common/entity-avatar";
import {
  AssetAddTagActionTag,
  AssetIndexableTag,
  AssetPurposeTag,
  AssetUserTagChip,
  AssetVisibilityTag,
} from "@/components/ui/tags";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import { copyToClipboard } from "@/lib/clipboard";
import { notifyErrorText, notifySuccessText } from "@/lib/notifications";

import {
  AssetInspectorActionRow,
  AssetInspectorList,
  AssetInspectorMono,
  AssetInspectorPanel,
  AssetInspectorRow,
  AssetInspectorShell,
} from "./asset-preview-inspector";
import type { useAssetPreviewDialogController } from "./asset-preview-dialog-controller";
import {
  formatCreatedAt,
  getIndexableLabel,
  getMimeLabel,
  getPurposeLabel,
  getVisibilityLabel,
  tagInputStyle,
} from "./asset-masonry-tile";

type AssetPreviewController = ReturnType<typeof useAssetPreviewDialogController>;

type AssetPreviewSidebarProps = {
  active: AssetMasonryItem;
  controller: AssetPreviewController;
  currentFolderPathLabel: string;
};

function AssetShareLinks(props: { controller: AssetPreviewController }) {
  const rows = props.controller.linkSnippets
    ? [
        {
          label: props.controller.t("assets:ASSET_LINKS_FORMAT_URL"),
          value: props.controller.linkSnippets.url,
        },
        {
          label: props.controller.t("assets:ASSET_LINKS_FORMAT_HTML"),
          value: props.controller.linkSnippets.html,
        },
        {
          label: props.controller.t("assets:ASSET_LINKS_FORMAT_MARKDOWN"),
          value: props.controller.linkSnippets.markdown,
        },
      ]
    : [];

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-background/70 px-3 py-3 text-footnote text-label-secondary">
        {props.controller.t("assets:ASSET_LINKS_REQUIRES_PUBLIC")}
      </div>
    );
  }

  return (
    <AssetInspectorList>
      {rows.map((row, index) => (
        <AssetInspectorActionRow
          key={row.label}
          label={row.label}
          value={
            <span className="line-clamp-2 font-mono text-caption break-all text-foreground">
              {row.value}
            </span>
          }
          separate={index < rows.length - 1}
          onClick={() => {
            copyToClipboard(row.value)
              .then(() => notifySuccessText(props.controller.t("assets:ASSET_LINK_COPIED")))
              .catch(() => notifyErrorText(props.controller.t("assets:ASSET_COPY_LINK_FAILED")));
          }}
        />
      ))}
    </AssetInspectorList>
  );
}

function AssetTagEditor(props: { controller: AssetPreviewController }) {
  return (
    <>
      <textarea
        className="min-h-28 w-full resize-none rounded-xl border border-border/60 bg-background px-3 py-2 text-callout text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder={props.controller.t("assets:ASSET_META_DESCRIPTION_PLACEHOLDER")}
        value={props.controller.descriptionDraft}
        onChange={(event) => {
          props.controller.dirtyRef.current.description = true;
          props.controller.setDescriptionDraft(event.target.value);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {props.controller.selectedTags.map((tag) => (
          <AssetUserTagChip
            key={tag.id}
            label={tag.name}
            closable={true}
            onClose={(event) => {
              event.preventDefault();
              props.controller.removeTag(tag.id);
            }}
          />
        ))}
        {props.controller.inputVisible ? (
          <Input
            ref={props.controller.inputRef}
            type="text"
            style={tagInputStyle}
            className="h-[22px] w-[88px] px-2 text-caption"
            value={props.controller.inputValue}
            onChange={(event) => props.controller.setInputValue(event.target.value)}
            onBlur={() => void props.controller.confirmAddTag()}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void props.controller.confirmAddTag();
            }}
          />
        ) : (
          <AssetAddTagActionTag
            className="bg-background hover:bg-accent/50"
            label={
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <Plus size={14} />
                <span>{props.controller.t("assets:ASSET_TAG_NEW")}</span>
              </span>
            }
            onClick={() => props.controller.setInputVisible(true)}
          />
        )}
      </div>
      {props.controller.saveState !== "idle" ? (
        <div className="text-caption text-label-secondary">
          {props.controller.saveState === "saving"
            ? props.controller.t("assets:ASSET_SAVE_SAVING")
            : props.controller.saveState === "saved"
              ? props.controller.t("assets:ASSET_SAVE_SAVED")
              : props.controller.t("assets:ASSET_SAVE_FAILED")}
        </div>
      ) : null}
    </>
  );
}

export function AssetPreviewSidebar(props: AssetPreviewSidebarProps) {
  const { active, controller } = props;

  return (
    <AssetInspectorShell>
      <AssetInspectorPanel title={controller.t("assets:ASSET_DIALOG_OVERVIEW")}>
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/75 px-3 py-3">
          <UserAvatar
            name={controller.uploaderName}
            assetRef={active.uploaderAvatarUrl}
            size={40}
          />
          <div className="min-w-0">
            <div className="truncate text-footnote font-semibold text-foreground">
              {controller.uploaderName}
            </div>
            <div className="truncate text-caption text-label-secondary">
              {controller.uploaderAndTimeText}
            </div>
          </div>
        </div>
        <AssetInspectorList>
          <AssetInspectorRow
            label={controller.t("assets:ASSET_DIALOG_LOCATION")}
            value={
              <span className="break-words text-footnote text-foreground">
                {props.currentFolderPathLabel}
              </span>
            }
            separate
          />
          <AssetInspectorRow
            label={controller.t("assets:ASSET_META_CREATED_AT")}
            value={formatCreatedAt(active.createdAt, active.createdAtText, controller.dateTime)}
            separate
          />
          <AssetInspectorRow
            label={controller.t("assets:ASSET_META_SIZE")}
            value={active.sizeText || "-"}
            separate
          />
          <AssetInspectorRow
            label={controller.t("assets:ASSET_META_MIME")}
            value={getMimeLabel(active.mimeType, controller.t)}
          />
        </AssetInspectorList>
      </AssetInspectorPanel>

      <AssetInspectorPanel title={controller.t("assets:ASSET_DIALOG_ORGANIZATION")}>
        <AssetInspectorList>
          <AssetInspectorRow
            label={controller.t("assets:ASSET_META_VISIBILITY")}
            value={
              <AssetVisibilityTag
                visibility={controller.displayVisibility}
                label={getVisibilityLabel(controller.displayVisibility, controller.t)}
              />
            }
            separate
          />
          <AssetInspectorRow
            label={controller.t("assets:ASSET_META_PURPOSE")}
            value={
              <AssetPurposeTag
                purpose={controller.displayPurpose}
                label={getPurposeLabel(controller.displayPurpose, controller.t)}
              />
            }
            separate
          />
          <AssetInspectorRow
            label={controller.t("assets:ASSET_META_INDEXABLE")}
            value={
              <AssetIndexableTag
                indexable={active.indexable}
                label={getIndexableLabel(active.indexable, controller.t)}
              />
            }
            separate
          />
          <AssetInspectorRow
            label={controller.t("assets:ASSET_TAG_FIELD_TITLE")}
            value={String(controller.selectedTags.length)}
          />
        </AssetInspectorList>
      </AssetInspectorPanel>

      <AssetInspectorPanel title={controller.t("assets:ASSET_DIALOG_NOTES")}>
        <AssetTagEditor controller={controller} />
      </AssetInspectorPanel>

      <AssetInspectorPanel title={controller.t("assets:ASSET_DIALOG_SHARE")}>
        <AssetShareLinks controller={controller} />
      </AssetInspectorPanel>

      <AssetInspectorPanel title={controller.t("assets:ASSET_META_ADVANCED_TITLE")}>
        <AssetInspectorList>
          <AssetInspectorRow
            label={controller.t("assets:ASSET_META_ID")}
            value={<AssetInspectorMono value={active.id} />}
            separate
          />
          <AssetInspectorRow
            label={controller.t("assets:ASSET_META_SHA256")}
            value={<AssetInspectorMono value={active.checksumSha256} />}
          />
        </AssetInspectorList>
      </AssetInspectorPanel>
    </AssetInspectorShell>
  );
}
