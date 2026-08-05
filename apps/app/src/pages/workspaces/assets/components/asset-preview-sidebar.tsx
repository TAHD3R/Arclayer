import { Info, Link2, Plus, Share2, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@arclayer/ui/accordion";
import { Input } from "@arclayer/ui/input";
import { Textarea } from "@arclayer/ui/textarea";

import { AssetAddTagActionTag, AssetUserTagChip } from "@/components/ui/tags";
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
      <div className="text-footnote  text-label-secondary">
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
              <span className="line-clamp-2 font-mono text-caption break-all text-label-primary">
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

export function AssetTagEditor(props: { controller: AssetPreviewController }) {
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
          className="h-5.5 w-22 px-2 text-caption"
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

function AssetFilenameEditor(props: { controller: AssetPreviewController }) {
  return (
    <div className="space-y-3">
      <Input
        className="text-label-primary"
        value={props.controller.filenameDraft}
        onChange={(event) => {
          props.controller.dirtyRef.current.filename = true;
          props.controller.setFilenameDraft(event.target.value);
        }}
        placeholder={props.controller.t("assets:ASSET_EDIT_FILENAME_PLACEHOLDER")}
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

function AssetAltNameEditor(props: { controller: AssetPreviewController }) {
  return (
    <div className="space-y-3">
      <Textarea
        className="min-h-28 resize-none text-label-primary"
        placeholder={props.controller.t("assets:ASSET_EDIT_ALT_NAME_PLACEHOLDER")}
        value={props.controller.altNameDraft}
        onChange={(event) => {
          props.controller.dirtyRef.current.altName = true;
          props.controller.setAltNameDraft(event.target.value);
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

function AssetSidebarAccordionItem(props: {
  value: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <AccordionItem
      value={props.value}
      className="overflow-hidden rounded-lg border border-border/70 bg-card/95 px-4 shadow-sm shadow-black/5 backdrop-blur-sm last:border-b dark:border-white/10 dark:bg-card/90 dark:shadow-black/30"
    >
      <AccordionTrigger className="py-3 text-callout font-semibold text-label-primary hover:no-underline">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="inline-flex size-5 shrink-0 items-center justify-center text-label-secondary">
            {props.icon}
          </span>
          <span className="truncate">{props.title}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 px-1">{props.children}</AccordionContent>
    </AccordionItem>
  );
}

export function AssetPreviewSidebar(props: AssetPreviewSidebarProps) {
  const { active, controller } = props;

  return (
    <AssetInspectorShell>
      <Accordion
        type="single"
        collapsible
        defaultValue="overview"
        className="w-full space-y-3"
        data-testid="asset-preview-sidebar-accordion"
      >
        <AssetSidebarAccordionItem
          value="overview"
          title={controller.t("assets:ASSET_DIALOG_OVERVIEW")}
          icon={<Info className="size-4" />}
        >
          <AssetInspectorPanel title={controller.t("assets:ASSET_EDIT_FILENAME")}>
            <AssetFilenameEditor controller={controller} />
          </AssetInspectorPanel>

          <AssetInspectorPanel title={controller.t("assets:ASSET_EDIT_ALT_NAME")}>
            <AssetAltNameEditor controller={controller} />
          </AssetInspectorPanel>

          {/*
          <AssetInspectorPanel title={controller.t("assets:ASSET_TAG_FIELD_TITLE")}>
            <AssetTagEditor controller={controller} />
          </AssetInspectorPanel>
          */}

          <AssetInspectorPanel title={controller.t("assets:ASSET_META_TITLE")}>
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
                label={controller.t("assets:ASSET_META_INDEXABLE")}
                value={getIndexableLabel(active.indexable, controller.t)}
              />
            </AssetInspectorList>
          </AssetInspectorPanel>
        </AssetSidebarAccordionItem>

        <AssetSidebarAccordionItem
          value="share"
          title={controller.t("assets:ASSET_DIALOG_SHARE")}
          icon={<Share2 className="size-4" />}
        >
          <AssetShareLinks controller={controller} />
        </AssetSidebarAccordionItem>

        <AssetSidebarAccordionItem
          value="advanced"
          title={controller.t("assets:ASSET_META_ADVANCED_TITLE")}
          icon={<SlidersHorizontal className="size-4" />}
        >
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
        </AssetSidebarAccordionItem>
      </Accordion>
    </AssetInspectorShell>
  );
}
