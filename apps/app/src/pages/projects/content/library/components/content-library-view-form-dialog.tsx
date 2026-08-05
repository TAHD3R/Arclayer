import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

import { ContentLibraryViewFormFields } from "./content-library-view-form";
import type { ContentLibraryPrototypeViewDraft } from "./content-library-view-form";

type ContentLibraryViewFormDialogMode = "edit" | "saveAs";

export function ContentLibraryViewFormDialog(props: {
  open: boolean;
  mode: ContentLibraryViewFormDialogMode;
  draft: ContentLibraryPrototypeViewDraft;
  originalName?: string;
  submitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (next: ContentLibraryPrototypeViewDraft) => void;
  onSubmit: () => Promise<void> | void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const trimmedName = props.draft.name.trim();
  const normalizedOriginalName = props.originalName?.trim() ?? "";
  const saveAsNameUnchanged =
    props.mode === "saveAs" && Boolean(trimmedName) && trimmedName === normalizedOriginalName;
  const title =
    props.mode === "edit"
      ? t("CONTENT_LIBRARY_ACTION_EDIT_VIEW")
      : t("CONTENT_LIBRARY_ACTION_SAVE_AS_VIEW");
  const description =
    props.mode === "edit"
      ? t("CONTENT_LIBRARY_VIEW_EDIT_DIALOG_DESC")
      : t("CONTENT_LIBRARY_VIEW_SAVE_AS_DIALOG_DESC");

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={title}
      description={description}
      bodyClassName="py-5"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            disabled={props.submitting}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            type="button"
            disabled={!trimmedName || props.submitting || saveAsNameUnchanged}
            onClick={() => void props.onSubmit()}
          >
            {props.mode === "edit"
              ? t("CONTENT_LIBRARY_ACTION_UPDATE_VIEW")
              : t("CONTENT_LIBRARY_ACTION_SAVE_AS_VIEW")}
          </Button>
        </>
      }
    >
      <SettingDialogFields>
        <ContentLibraryViewFormFields
          value={props.draft}
          onChange={props.onDraftChange}
          disabled={props.submitting}
          fieldIdPrefix={`content-library-view-dialog-${props.mode}`}
          nameInvalid={saveAsNameUnchanged}
          nameHint={
            saveAsNameUnchanged ? t("CONTENT_LIBRARY_SAVE_AS_UNCHANGED_NAME_HINT") : undefined
          }
        />
      </SettingDialogFields>
    </SettingDialog>
  );
}
