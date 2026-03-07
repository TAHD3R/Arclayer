import { Button, Input, Select } from "antd";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";
import { SettingDialog } from "@celestial/ui/setting-dialog";

type ViewStatusFilter = "all" | "draft" | "published";

export type CreateContentViewInput = {
  code: string;
  name: string;
  statusFilter: ViewStatusFilter;
};

function buildInitialForm(): CreateContentViewInput {
  return {
    code: "",
    name: "",
    statusFilter: "all",
  };
}

const STATUS_FILTER_OPTIONS: Array<{ value: ViewStatusFilter; labelKey: string }> = [
  { value: "all", labelKey: "content_library:LIBRARY_VIEW_FILTER_ALL" },
  { value: "draft", labelKey: "content_library:LIBRARY_VIEW_FILTER_DRAFT" },
  { value: "published", labelKey: "content_library:LIBRARY_VIEW_FILTER_PUBLISHED" },
];

export function CreateContentViewDialog(props: {
  open: boolean;
  modelName: string;
  confirmLoading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: CreateContentViewInput) => Promise<void>;
}) {
  const { t } = useTranslation(["content_library", "common"]);
  const [form, setForm] = useState<CreateContentViewInput>(buildInitialForm);

  useEffect(() => {
    if (!props.open) return;
    setForm(buildInitialForm());
  }, [props.open]);

  const canSubmit = useMemo(() => {
    if (props.confirmLoading) return false;
    return form.code.trim().length > 0 && form.name.trim().length > 0;
  }, [form.code, form.name, props.confirmLoading]);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("content_library:LIBRARY_VIEW_DIALOG_TITLE")}
      description={t("content_library:LIBRARY_VIEW_DIALOG_DESC", { modelName: props.modelName })}
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
                ...form,
                code: form.code.trim(),
                name: form.name.trim(),
              });
            }}
          >
            {t("content_library:LIBRARY_VIEW_DIALOG_SUBMIT")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("content_library:LIBRARY_VIEW_FIELD_NAME_LABEL")}
          </label>
          <div className="text-footnote text-label-secondary">
            {t("content_library:LIBRARY_VIEW_FIELD_NAME_DESC")}
          </div>
          <Input
            autoFocus
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder={t("content_library:LIBRARY_VIEW_FIELD_NAME_PLACEHOLDER")}
            disabled={props.confirmLoading}
          />
        </div>

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("content_library:LIBRARY_VIEW_FIELD_CODE_LABEL")}
          </label>
          <div className="text-footnote text-label-secondary">
            {t("content_library:LIBRARY_VIEW_FIELD_CODE_DESC")}
          </div>
          <Input
            value={form.code}
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
            placeholder={t("content_library:LIBRARY_VIEW_FIELD_CODE_PLACEHOLDER")}
            disabled={props.confirmLoading}
          />
        </div>

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("content_library:LIBRARY_VIEW_FIELD_FILTER_LABEL")}
          </label>
          <div className="text-footnote text-label-secondary">
            {t("content_library:LIBRARY_VIEW_FIELD_FILTER_DESC")}
          </div>
          <Select
            value={form.statusFilter}
            options={STATUS_FILTER_OPTIONS.map((item) => ({
              value: item.value,
              label: t(item.labelKey),
            }))}
            onChange={(statusFilter) => setForm((current) => ({ ...current, statusFilter }))}
            disabled={props.confirmLoading}
            getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
          />
        </div>
      </div>
    </SettingDialog>
  );
}
