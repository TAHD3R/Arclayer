import { Button, Input, Select, Switch } from "antd";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { SettingDialog } from "@celestial/ui/setting-dialog";

export type CreateRouteTemplateInput = {
  pathPattern: string;
  itemId: string;
  isActive: boolean;
};

function buildInitialForm(itemId?: string): CreateRouteTemplateInput {
  return {
    pathPattern: "/blog/:slug",
    itemId: itemId ?? "",
    isActive: true,
  };
}

export function CreateRouteTemplateDialog(props: {
  open: boolean;
  confirmLoading?: boolean;
  itemOptions: Array<{ label: string; value: string }>;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: CreateRouteTemplateInput) => Promise<void>;
}) {
  const { t } = useTranslation(["content_library", "common"]);
  const [form, setForm] = useState<CreateRouteTemplateInput>(() =>
    buildInitialForm(props.itemOptions[0]?.value),
  );

  useEffect(() => {
    if (!props.open) return;
    setForm(buildInitialForm(props.itemOptions[0]?.value));
  }, [props.itemOptions, props.open]);

  const canSubmit = useMemo(() => {
    if (props.confirmLoading) return false;
    return form.pathPattern.trim().length > 0 && form.itemId.trim().length > 0;
  }, [form.itemId, form.pathPattern, props.confirmLoading]);

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
                itemId: form.itemId.trim(),
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
        {props.itemOptions.length > 1 ? (
          <div className="grid gap-1.5">
            <label className="font-semibold text-foreground">
              {t("content_library:SITE_BUILDER_ROUTE_FIELD_TYPE_LABEL")}
            </label>
            <Select
              value={form.itemId}
              options={props.itemOptions}
              onChange={(itemId) => setForm((current) => ({ ...current, itemId }))}
              disabled={props.confirmLoading}
            />
          </div>
        ) : null}

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
