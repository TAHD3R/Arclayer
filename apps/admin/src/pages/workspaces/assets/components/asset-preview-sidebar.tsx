import { Link2, Plus } from "lucide-react";

import { Input } from "@arclayer/ui/input";

import { UserAvatar } from "@/components/common/entity-avatar";
import { AssetAddTagActionTag, AssetIndexableTag, AssetUserTagChip } from "@/components/ui/tags";
import { copyToClipboard } from "@/lib/clipboard";
import { notifyErrorText, notifySuccessText } from "@/lib/notifications";
import type { AssetMasonryItem } from "@/types/assets-masonry";

import type { useAssetPreviewDialogController } from "./asset-preview-dialog-controller";
import {
  AssetInspectorActionRow,
  AssetInspectorList,
  AssetInspectorMono,
  AssetInspectorPanel,
  AssetInspectorRow,
  AssetInspectorShell,
} from "./asset-preview-inspector";
import {
  formatCreatedAt,
  getIndexableLabel,
  getMimeLabel,
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
      <div className="text-footnote leading-6 text-label-secondary">
        {props.controller.t("assets:ASSET_LINKS_REQUIRES_PUBLIC")}
      </div>
    );
  }

  return (
    <AssetInspectorList>
      {rows.map((row) => (
        <AssetInspectorActionRow
          key={row.label}
          label={row.label}
          value={
            <span className="inline-flex min-w-0 items-start gap-2">
              <Link2 className="mt-0.5 size-3.5 shrink-0 text-label-tertiary" />
              <span className="line-clamp-2 font-mono text-caption break-all text-foreground">
                {row.value}
              </span>
            </span>
          }
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
          className="bg-muted/20 hover:bg-accent/50"
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
  );
}

function AssetDescriptionEditor(props: { controller: AssetPreviewController }) {
  return (
    <div className="space-y-3">
      <textarea
        className="min-h-28 w-full resize-none rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-callout text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder={props.controller.t("assets:ASSET_META_DESCRIPTION_PLACEHOLDER")}
        value={props.controller.descriptionDraft}
        onChange={(event) => {
          props.controller.dirtyRef.current.description = true;
          props.controller.setDescriptionDraft(event.target.value);
        }}
      />
      {props.controller.saveState !== "idle" ? (
        <div className="text-caption text-label-secondary">
          {props.controller.saveState === "saving"
            ? props.controller.t("assets:ASSET_SAVE_SAVING")
            : props.controller.saveState === "saved"
              ? props.controller.t("assets:ASSET_SAVE_SAVED")
              : props.controller.t("assets:ASSET_SAVE_FAILED")}
        </div>
      ) : null}
    </div>
  );
}

export function AssetPreviewSidebar(props: AssetPreviewSidebarProps) {
  const { active, controller } = props;

  return (
    <AssetInspectorShell>
      <AssetInspectorPanel title={controller.t("assets:ASSET_DIALOG_OVERVIEW")}>
        <div className="flex items-center gap-3">
          <UserAvatar
            name={controller.uploaderName}
            assetRef={active.uploaderAvatarUrl}
            size={40}
          />
          <div className="min-w-0">
            <div className="truncate text-footnote font-semibold text-label-primary">
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
            value={<span className="break-words">{props.currentFolderPathLabel}</span>}
          />
          <AssetInspectorRow
            label={controller.t("assets:ASSET_META_SIZE")}
            value={active.sizeText || "-"}
          />
          <AssetInspectorRow
            label={controller.t("assets:ASSET_META_CREATED_AT")}
            value={formatCreatedAt(active.createdAt, active.createdAtText, controller.dateTime)}
          />
          <AssetInspectorRow
            label={controller.t("assets:ASSET_META_MIME")}
            value={getMimeLabel(active.mimeType, controller.t)}
          />
          <AssetInspectorRow
            label={controller.t("assets:ASSET_DIALOG_ORGANIZATION")}
            value={
              <div className="flex flex-wrap gap-2">
                <AssetIndexableTag
                  indexable={active.indexable}
                  label={getIndexableLabel(active.indexable, controller.t)}
                />
              </div>
            }
          />
        </AssetInspectorList>
      </AssetInspectorPanel>

      <AssetInspectorPanel title={controller.t("assets:ASSET_DIALOG_NOTES")}>
        <AssetDescriptionEditor controller={controller} />
      </AssetInspectorPanel>

      <AssetInspectorPanel title={controller.t("assets:ASSET_TAG_FIELD_TITLE")}>
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
