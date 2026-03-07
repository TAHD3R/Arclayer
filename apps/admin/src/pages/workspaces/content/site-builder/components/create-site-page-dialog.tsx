import { Button, Input } from "antd";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { SettingDialog } from "@celestial/ui/setting-dialog";

export type CreateSitePageInput = {
  title: string;
  path: string;
};

function buildInitialForm(): CreateSitePageInput {
  return {
    title: "",
    path: "/",
  };
}

export function CreateSitePageDialog(props: {
  open: boolean;
  confirmLoading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: CreateSitePageInput) => Promise<void>;
}) {
  const { t } = useTranslation(["content_library", "common"]);
  const [form, setForm] = useState<CreateSitePageInput>(buildInitialForm);

  useEffect(() => {
    if (!props.open) return;
    setForm(buildInitialForm());
  }, [props.open]);

  const canSubmit = useMemo(() => {
    if (props.confirmLoading) return false;
    return form.title.trim().length > 0 && form.path.trim().length > 0;
  }, [form.path, form.title, props.confirmLoading]);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("content_library:SITE_BUILDER_DIALOG_TITLE")}
      description={t("content_library:SITE_BUILDER_DIALOG_DESC")}
      footer={
        <>
          <Button
            type="text"
            autoInsertSpace={false}
            disabled={props.confirmLoading}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            type="primary"
            autoInsertSpace={false}
            icon={<Plus className="size-4" aria-hidden="true" />}
            loading={props.confirmLoading}
            disabled={!canSubmit}
            onClick={async () => {
              await props.onConfirm({
                title: form.title.trim(),
                path: form.path.trim(),
              });
            }}
          >
            {t("content_library:SITE_BUILDER_DIALOG_SUBMIT")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("content_library:SITE_BUILDER_FIELD_TITLE_LABEL")}
          </label>
          <div className="text-footnote text-label-secondary">
            {t("content_library:SITE_BUILDER_FIELD_TITLE_DESC")}
          </div>
          <Input
            autoFocus
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder={t("content_library:SITE_BUILDER_FIELD_TITLE_PLACEHOLDER")}
            disabled={props.confirmLoading}
          />
        </div>

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("content_library:SITE_BUILDER_FIELD_PATH_LABEL")}
          </label>
          <div className="text-footnote text-label-secondary">
            {t("content_library:SITE_BUILDER_FIELD_PATH_DESC")}
          </div>
          <Input
            value={form.path}
            onChange={(event) => setForm((current) => ({ ...current, path: event.target.value }))}
            placeholder={t("content_library:SITE_BUILDER_FIELD_PATH_PLACEHOLDER")}
            disabled={props.confirmLoading}
          />
        </div>
      </div>
    </SettingDialog>
  );
}
