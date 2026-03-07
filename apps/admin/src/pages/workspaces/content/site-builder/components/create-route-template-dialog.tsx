import { Button, Input, Switch } from "antd";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { SettingDialog } from "@celestial/ui/setting-dialog";

export type CreateRouteTemplateInput = {
  pathPattern: string;
  entryTypeCode: string;
  isActive: boolean;
};

function buildInitialForm(): CreateRouteTemplateInput {
  return {
    pathPattern: "/blog/:slug",
    entryTypeCode: "",
    isActive: true,
  };
}

export function CreateRouteTemplateDialog(props: {
  open: boolean;
  confirmLoading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: CreateRouteTemplateInput) => Promise<void>;
}) {
  const { t } = useTranslation(["content_library", "common"]);
  const [form, setForm] = useState<CreateRouteTemplateInput>(buildInitialForm);

  useEffect(() => {
    if (!props.open) return;
    setForm(buildInitialForm());
  }, [props.open]);

  const canSubmit = useMemo(() => {
    if (props.confirmLoading) return false;
    return form.pathPattern.trim().length > 0 && form.entryTypeCode.trim().length > 0;
  }, [form.entryTypeCode, form.pathPattern, props.confirmLoading]);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("content_library:SITE_BUILDER_ROUTE_DIALOG_TITLE")}
      description={t("content_library:SITE_BUILDER_ROUTE_DIALOG_DESC")}
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
                pathPattern: form.pathPattern.trim(),
                entryTypeCode: form.entryTypeCode.trim(),
                isActive: form.isActive,
              });
            }}
          >
            {t("content_library:SITE_BUILDER_ROUTE_DIALOG_SUBMIT")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("content_library:SITE_BUILDER_ROUTE_FIELD_PATH_LABEL")}
          </label>
          <div className="text-footnote text-label-secondary">
            {t("content_library:SITE_BUILDER_ROUTE_FIELD_PATH_DESC")}
          </div>
          <Input
            autoFocus
            value={form.pathPattern}
            onChange={(event) =>
              setForm((current) => ({ ...current, pathPattern: event.target.value }))
            }
            placeholder={t("content_library:SITE_BUILDER_ROUTE_FIELD_PATH_PLACEHOLDER")}
            disabled={props.confirmLoading}
          />
        </div>

        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("content_library:SITE_BUILDER_ROUTE_FIELD_TYPE_LABEL")}
          </label>
          <div className="text-footnote text-label-secondary">
            {t("content_library:SITE_BUILDER_ROUTE_FIELD_TYPE_DESC")}
          </div>
          <Input
            value={form.entryTypeCode}
            onChange={(event) =>
              setForm((current) => ({ ...current, entryTypeCode: event.target.value }))
            }
            placeholder={t("content_library:SITE_BUILDER_ROUTE_FIELD_TYPE_PLACEHOLDER")}
            disabled={props.confirmLoading}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <div>
            <div className="font-semibold text-foreground">
              {t("content_library:SITE_BUILDER_ROUTE_FIELD_ACTIVE_LABEL")}
            </div>
            <div className="text-footnote text-label-secondary">
              {t("content_library:SITE_BUILDER_ROUTE_FIELD_ACTIVE_DESC")}
            </div>
          </div>
          <Switch
            checked={form.isActive}
            onChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))}
            disabled={props.confirmLoading}
          />
        </div>
      </div>
    </SettingDialog>
  );
}
