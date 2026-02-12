import { Button, Form, Input, InputNumber, Select } from "antd";
import * as React from "react";

import { SettingSheet } from "@/components/common/setting-sheet";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";

import type {
  ContentPageFormValues,
  ContentPageRow,
  ContentPageSheetMode,
  PageType,
} from "./content-pages-types";
import { normalizePathInput, validatePathWithType } from "./content-pages-utils";

type ContentPagesSheetProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  open: boolean;
  mode: ContentPageSheetMode;
  editingRow: ContentPageRow | null;
  pages: ContentPageRow[];
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ContentPageFormValues) => Promise<void>;
};

function getInitialValues(mode: ContentPageSheetMode, editingRow: ContentPageRow | null): ContentPageFormValues {
  if (mode === "edit" && editingRow) {
    return {
      title: editingRow.title ?? "",
      description: editingRow.description ?? "",
      path: editingRow.path,
      type: editingRow.pageType,
      visibility: editingRow.visibility,
      parentId: editingRow.parentId,
      sortOrder: editingRow.sortOrder,
      contentMode: "blank",
      sourcePageId: null,
    };
  }

  return {
    title: "",
    description: "",
    path: "/",
    type: "static",
    visibility: "public",
    parentId: null,
    sortOrder: 0,
    contentMode: "blank",
    sourcePageId: null,
  };
}

export function ContentPagesSheet(props: ContentPagesSheetProps) {
  const [form] = Form.useForm<ContentPageFormValues>();
  const [tab, setTab] = React.useState<"basic" | "content">("basic");

  React.useEffect(() => {
    if (!props.open) return;
    form.setFieldsValue(getInitialValues(props.mode, props.editingRow));
    setTab("basic");
  }, [form, props.editingRow, props.mode, props.open]);

  const typeValue = Form.useWatch("type", form) as PageType | undefined;
  const contentModeValue = Form.useWatch("contentMode", form);

  const currentEditingId = props.editingRow?.id ?? null;

  const parentOptions = React.useMemo(
    () => [
      {
        value: null,
        label: props.t("content_pages:PARENT_OPTION_ROOT"),
      },
      ...props.pages
        .filter((row) => row.id !== currentEditingId)
        .map((row) => ({
          value: row.id,
          label: `${row.path}${row.title ? ` · ${row.title}` : ""}`,
        })),
    ],
    [currentEditingId, props.pages, props.t],
  );

  const copySourceOptions = React.useMemo(
    () =>
      props.pages
        .filter((row) => row.id !== currentEditingId)
        .map((row) => ({
          value: row.id,
          label: `${row.path}${row.title ? ` · ${row.title}` : ""}`,
        })),
    [currentEditingId, props.pages],
  );

  return (
    <SettingSheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        props.mode === "create"
          ? props.t("content_pages:SHEET_TITLE_CREATE")
          : props.t("content_pages:SHEET_TITLE_EDIT")
      }
      description={
        props.mode === "create"
          ? props.t("content_pages:SHEET_DESC_CREATE")
          : props.t("content_pages:SHEET_DESC_EDIT")
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="text" onClick={() => props.onOpenChange(false)} disabled={props.submitting}>
            {props.t("common:CANCEL")}
          </Button>
          <Button type="primary" loading={props.submitting} onClick={() => form.submit()}>
            {props.mode === "create"
              ? props.t("content_pages:SHEET_ACTION_CREATE")
              : props.t("content_pages:SHEET_ACTION_SAVE")}
          </Button>
        </div>
      }
    >
      <Form<ContentPageFormValues>
        form={form}
        layout="vertical"
        onFinish={async (values) => {
          const normalizedPath = normalizePathInput(values.path);
          await props.onSubmit({
            ...values,
            path: normalizedPath,
            parentId: values.parentId || null,
            sourcePageId: values.sourcePageId || null,
          });
        }}
      >
        <ChromeTabs value={tab} onValueChange={(next) => setTab(next as "basic" | "content")}>
          <ChromeTabsList className="w-auto">
            <ChromeTabsTrigger value="basic">{props.t("content_pages:SHEET_TAB_BASIC")}</ChromeTabsTrigger>
            <ChromeTabsTrigger value="content">{props.t("content_pages:SHEET_TAB_CONTENT")}</ChromeTabsTrigger>
          </ChromeTabsList>

          <ChromeTabsContent value="basic" className="mt-4 grid grid-cols-1 gap-3">
            <Form.Item
              label={props.t("content_pages:FIELD_TITLE_LABEL")}
              name="title"
              rules={[{ required: true, message: props.t("content_pages:VALIDATION_TITLE_REQUIRED") }]}
            >
              <Input maxLength={256} />
            </Form.Item>

            <Form.Item label={props.t("content_pages:FIELD_TYPE_LABEL")} name="type">
              <Select
                options={[
                  { value: "static", label: props.t("content_pages:INDEX_TYPE_STATIC") },
                  { value: "template", label: props.t("content_pages:INDEX_TYPE_TEMPLATE") },
                ]}
              />
            </Form.Item>

            <Form.Item
              label={props.t("content_pages:FIELD_PATH_LABEL")}
              name="path"
              extra={props.t("content_pages:FIELD_PATH_HELP")}
              rules={[
                { required: true, message: props.t("content_pages:VALIDATION_PATH_REQUIRED") },
                ({ getFieldValue }) => ({
                  validator(_, value: string) {
                    const nextType = (getFieldValue("type") as PageType | undefined) ?? "static";
                    const mismatch = validatePathWithType(normalizePathInput(value || ""), nextType);
                    if (!mismatch) return Promise.resolve();
                    return Promise.reject(new Error(props.t("content_pages:VALIDATION_PATH_TYPE_MISMATCH")));
                  },
                }),
              ]}
            >
              <Input placeholder="/about" />
            </Form.Item>

            <Form.Item label={props.t("content_pages:FIELD_VISIBILITY_LABEL")} name="visibility">
              <Select
                options={[
                  { value: "public", label: props.t("content_pages:INDEX_FILTER_VISIBILITY_PUBLIC") },
                  { value: "private", label: props.t("content_pages:INDEX_FILTER_VISIBILITY_PRIVATE") },
                ]}
              />
            </Form.Item>

            <Form.Item label={props.t("content_pages:FIELD_PARENT_LABEL")} name="parentId">
              <Select
                showSearch
                optionFilterProp="label"
                options={parentOptions}
              />
            </Form.Item>

            <Form.Item label={props.t("content_pages:FIELD_SORT_ORDER_LABEL")} name="sortOrder">
              <InputNumber className="w-full" min={0} precision={0} />
            </Form.Item>
          </ChromeTabsContent>

          <ChromeTabsContent value="content" className="mt-4 grid grid-cols-1 gap-3">
            <Form.Item label={props.t("content_pages:FIELD_DESCRIPTION_LABEL")} name="description">
              <Input.TextArea rows={4} maxLength={1024} />
            </Form.Item>

            {props.mode === "create" ? (
              <>
                <Form.Item label={props.t("content_pages:FIELD_CONTENT_MODE_LABEL")} name="contentMode">
                  <Select
                    options={[
                      {
                        value: "blank",
                        label: props.t("content_pages:CONTENT_MODE_BLANK"),
                      },
                      {
                        value: "copy",
                        label: props.t("content_pages:CONTENT_MODE_COPY"),
                      },
                    ]}
                  />
                </Form.Item>

                <Form.Item
                  label={props.t("content_pages:FIELD_COPY_SOURCE_LABEL")}
                  name="sourcePageId"
                  rules={
                    contentModeValue === "copy"
                      ? [
                          {
                            required: true,
                            message: props.t("content_pages:VALIDATION_COPY_SOURCE_REQUIRED"),
                          },
                        ]
                      : []
                  }
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    disabled={contentModeValue !== "copy"}
                    options={copySourceOptions}
                    placeholder={props.t("content_pages:COPY_SOURCE_PLACEHOLDER")}
                  />
                </Form.Item>
              </>
            ) : null}

            {typeValue === "template" ? (
              <div className="text-xs text-muted-foreground">
                {props.t("content_pages:TYPE_TEMPLATE_HINT")}
              </div>
            ) : null}
          </ChromeTabsContent>
        </ChromeTabs>
      </Form>
    </SettingSheet>
  );
}
