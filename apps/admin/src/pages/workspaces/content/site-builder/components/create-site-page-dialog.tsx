import { Button, Input, Select } from "antd";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { SettingDialog } from "@celestial/ui/setting-dialog";

export type CreateStructureNodeInput = {
  title: string;
  path: string;
  modelKey: string;
};

function buildInitialForm(modelKey?: string): CreateStructureNodeInput {
  return {
    title: "",
    path: "/",
    modelKey: modelKey ?? "",
  };
}

export function CreateStructureNodeDialog(props: {
  open: boolean;
  confirmLoading?: boolean;
  modelOptions: Array<{ label: string; value: string }>;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: CreateStructureNodeInput) => Promise<void>;
}) {
  const { t } = useTranslation(["content_library", "common"]);
  const [form, setForm] = useState<CreateStructureNodeInput>(() =>
    buildInitialForm(props.modelOptions[0]?.value),
  );

  useEffect(() => {
    if (!props.open) return;
    setForm(buildInitialForm(props.modelOptions[0]?.value));
  }, [props.modelOptions, props.open]);

  const canSubmit = useMemo(() => {
    if (props.confirmLoading) return false;
    return (
      form.title.trim().length > 0 && form.path.trim().length > 0 && form.modelKey.trim().length > 0
    );
  }, [form.modelKey, form.path, form.title, props.confirmLoading]);

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
                modelKey: form.modelKey.trim(),
              });
            }}
          >
            {t("content_library:SITE_BUILDER_DIALOG_SUBMIT")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        {props.modelOptions.length > 1 ? (
          <div className="grid gap-1.5">
            <label className="font-semibold text-foreground">
              {t("content_library:SITE_BUILDER_ROUTE_FIELD_TYPE_LABEL")}
            </label>
            <Select
              value={form.modelKey}
              options={props.modelOptions}
              onChange={(modelKey) => setForm((current) => ({ ...current, modelKey }))}
              disabled={props.confirmLoading}
            />
          </div>
        ) : null}

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
