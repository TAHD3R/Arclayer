import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Textarea } from "@arclayer/ui/textarea";

type SeoDraft = {
  metaTitle: string;
  metaDescription: string;
};

function normalizeSeoDraft(value: SeoDraft): SeoDraft {
  return {
    metaTitle: value.metaTitle ?? "",
    metaDescription: value.metaDescription ?? "",
  };
}

export function ContentLibraryArticleEditorSeoDialog(props: {
  open: boolean;
  seo: SeoDraft;
  onOpenChange: (open: boolean) => void;
  onSeoChange: (value: Partial<SeoDraft>) => void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const [draft, setDraft] = React.useState(() => normalizeSeoDraft(props.seo));
  const metaTitleId = React.useId();
  const metaDescriptionId = React.useId();

  React.useEffect(() => {
    if (!props.open) return;
    setDraft(normalizeSeoDraft(props.seo));
  }, [props.open, props.seo]);

  const handleFieldChange = React.useCallback((field: keyof SeoDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  }, []);

  const handleConfirm = React.useCallback(() => {
    props.onSeoChange(draft);
    props.onOpenChange(false);
  }, [draft, props]);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("CONTENT_LIBRARY_EDITOR_SEO_DIALOG_TITLE")}
      description={t("CONTENT_LIBRARY_EDITOR_SEO_DIALOG_DESC")}
      bodyClassName="min-h-0 overflow-y-auto"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button type="button" onClick={handleConfirm}>
            {t("common:CONFIRM")}
          </Button>
        </>
      }
    >
      <form
        className="py-2"
        onSubmit={(event) => {
          event.preventDefault();
          handleConfirm();
        }}
      >
        <SettingDialogFields className="py-2">
          <SettingDialogField
            title={t("CONTENT_LIBRARY_EDITOR_SEO_META_TITLE")}
            description={t("CONTENT_LIBRARY_EDITOR_SEO_META_TITLE_HELP")}
          >
            <Input
              id={metaTitleId}
              value={draft.metaTitle}
              onChange={(event) => handleFieldChange("metaTitle", event.target.value)}
            />
          </SettingDialogField>

          <SettingDialogField
            title={t("CONTENT_LIBRARY_EDITOR_SEO_META_DESCRIPTION")}
            description={t("CONTENT_LIBRARY_EDITOR_SEO_META_DESCRIPTION_HELP")}
          >
            <Textarea
              id={metaDescriptionId}
              rows={4}
              value={draft.metaDescription}
              onChange={(event) => handleFieldChange("metaDescription", event.target.value)}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
