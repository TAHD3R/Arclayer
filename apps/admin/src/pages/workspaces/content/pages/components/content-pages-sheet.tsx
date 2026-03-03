import { Button, Form, Input } from "antd";
import { Info } from "lucide-react";
import * as React from "react";

import { SettingSheet } from "@celestial/ui/setting-sheet";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@celestial/ui/chrome-tabs";

import type {
  ContentPageFormValues,
  ContentPageRow,
  ContentPageSheetMode,
  PageType,
} from "../types";
import { normalizePathInput, validatePathWithType } from "../utils";

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

// Antd Form-compatible native select adapter (bridges value/onChange signature)
function FormSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value?: string | null;
  onChange?: (value: string | null) => void;
  options: Array<{ value: string | null; label: string }>;
  placeholder?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value || null)}
      className="h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-footnote shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((opt) => (
        <option key={String(opt.value)} value={opt.value ?? ""}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function renderFieldHeader(
  t: (key: string, options?: Record<string, unknown>) => string,
  titleKey: string,
  descKey: string,
) {
  return (
    <div className="grid gap-1.5">
      <span className="font-semibold text-foreground">{t(titleKey)}</span>
      <span className="text-label-secondary text-footnote">{t(descKey)}</span>
    </div>
  );
}

function getInitialValues(
  mode: ContentPageSheetMode,
  editingRow: ContentPageRow | null,
): ContentPageFormValues {
  if (mode === "edit" && editingRow) {
    return {
      title: editingRow.title ?? "",
      description: editingRow.description ?? "",
      path: editingRow.path,
      type: editingRow.pageType,
      visibility: editingRow.visibility,
      parentId: editingRow.parentId,
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
    contentMode: "blank",
    sourcePageId: null,
  };
}

export function ContentPagesSheet(props: ContentPagesSheetProps) {
  const [form] = Form.useForm<ContentPageFormValues>();
  const [tab, setTab] = React.useState<"basic" | "content">("basic");
  const [typeSwitchHint, setTypeSwitchHint] = React.useState<PageType | null>(null);
  const lastTypeRef = React.useRef<PageType | null>(null);

  React.useEffect(() => {
    if (!props.open) return;
    const initialValues = getInitialValues(props.mode, props.editingRow);
    form.setFieldsValue(initialValues);
    setTab("basic");
    setTypeSwitchHint(null);
    lastTypeRef.current = initialValues.type;
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
          <Button
            type="text"
            onClick={() => props.onOpenChange(false)}
            disabled={props.submitting}
            autoInsertSpace={false}
          >
            {props.t("common:CANCEL")}
          </Button>
          <Button
            type="primary"
            loading={props.submitting}
            onClick={() => form.submit()}
            autoInsertSpace={false}
          >
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
        onValuesChange={(changedValues) => {
          const nextType = changedValues.type as PageType | undefined;
          if (nextType) {
            if (lastTypeRef.current !== null && nextType !== lastTypeRef.current) {
              setTypeSwitchHint(nextType);
            }
            lastTypeRef.current = nextType;
          }

          const nextContentMode = changedValues.contentMode as
            | ContentPageFormValues["contentMode"]
            | undefined;
          if (nextContentMode && nextContentMode !== "copy") {
            form.setFieldValue("sourcePageId", null);
          }
        }}
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
            <ChromeTabsTrigger value="basic">
              {props.t("content_pages:SHEET_TAB_BASIC")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value="content">
              {props.t("content_pages:SHEET_TAB_CONTENT")}
            </ChromeTabsTrigger>
          </ChromeTabsList>

          <ChromeTabsContent value="basic" className="mt-4 grid grid-cols-1 gap-4">
            <div className="grid gap-2">
              {renderFieldHeader(
                props.t,
                "content_pages:FIELD_TITLE_LABEL",
                "content_pages:FIELD_TITLE_DESC",
              )}
              <Form.Item
                className="mb-0"
                name="title"
                rules={[
                  { required: true, message: props.t("content_pages:VALIDATION_TITLE_REQUIRED") },
                ]}
              >
                <Input maxLength={256} />
              </Form.Item>
            </div>

            <div className="grid gap-2">
              {renderFieldHeader(
                props.t,
                "content_pages:FIELD_TYPE_LABEL",
                "content_pages:FIELD_TYPE_DESC",
              )}
              <Form.Item className="mb-0" name="type">
                <FormSelect
                  options={[
                    { value: "static", label: props.t("content_pages:INDEX_TYPE_STATIC") },
                    { value: "template", label: props.t("content_pages:INDEX_TYPE_TEMPLATE") },
                  ]}
                />
              </Form.Item>
            </div>

            {typeSwitchHint ? (
              <div className="flex gap-2.5 rounded-md border border-blue-200 bg-blue-50 p-3 text-footnote dark:border-blue-800 dark:bg-blue-950/40">
                <Info className="size-4 shrink-0 text-blue-500 mt-0.5" />
                <div className="grid gap-1">
                  <span className="font-medium">
                    {typeSwitchHint === "template"
                      ? props.t("content_pages:TYPE_SWITCH_TEMPLATE_TITLE")
                      : props.t("content_pages:TYPE_SWITCH_STATIC_TITLE")}
                  </span>
                  <span className="text-label-secondary">
                    {typeSwitchHint === "template"
                      ? props.t("content_pages:TYPE_SWITCH_TEMPLATE_DESC")
                      : props.t("content_pages:TYPE_SWITCH_STATIC_DESC")}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="grid gap-2">
              {renderFieldHeader(
                props.t,
                "content_pages:FIELD_PATH_LABEL",
                "content_pages:FIELD_PATH_DESC",
              )}
              <Form.Item
                className="mb-0"
                name="path"
                rules={[
                  { required: true, message: props.t("content_pages:VALIDATION_PATH_REQUIRED") },
                  ({ getFieldValue }) => ({
                    validator(_, value: string) {
                      const nextType = (getFieldValue("type") as PageType | undefined) ?? "static";
                      const mismatch = validatePathWithType(
                        normalizePathInput(value || ""),
                        nextType,
                      );
                      if (!mismatch) return Promise.resolve();
                      return Promise.reject(
                        new Error(props.t("content_pages:VALIDATION_PATH_TYPE_MISMATCH")),
                      );
                    },
                  }),
                ]}
              >
                <Input placeholder="/about" />
              </Form.Item>
            </div>

            <div className="grid gap-2">
              {renderFieldHeader(
                props.t,
                "content_pages:FIELD_VISIBILITY_LABEL",
                "content_pages:FIELD_VISIBILITY_DESC",
              )}
              <Form.Item className="mb-0" name="visibility">
                <FormSelect
                  options={[
                    {
                      value: "public",
                      label: props.t("content_pages:INDEX_FILTER_VISIBILITY_PUBLIC"),
                    },
                    {
                      value: "private",
                      label: props.t("content_pages:INDEX_FILTER_VISIBILITY_PRIVATE"),
                    },
                  ]}
                />
              </Form.Item>
            </div>

            <div className="grid gap-2">
              {renderFieldHeader(
                props.t,
                "content_pages:FIELD_PARENT_LABEL",
                "content_pages:FIELD_PARENT_DESC",
              )}
              <Form.Item className="mb-0" name="parentId">
                <FormSelect options={parentOptions} />
              </Form.Item>
            </div>
          </ChromeTabsContent>

          <ChromeTabsContent value="content" className="mt-4 grid grid-cols-1 gap-4">
            <div className="grid gap-2">
              {renderFieldHeader(
                props.t,
                "content_pages:FIELD_DESCRIPTION_LABEL",
                "content_pages:FIELD_DESCRIPTION_DESC",
              )}
              <Form.Item className="mb-0" name="description">
                <Input.TextArea rows={4} maxLength={1024} />
              </Form.Item>
            </div>

            {props.mode === "create" ? (
              <>
                <div className="grid gap-2">
                  {renderFieldHeader(
                    props.t,
                    "content_pages:FIELD_CONTENT_MODE_LABEL",
                    "content_pages:FIELD_CONTENT_MODE_DESC",
                  )}
                  <Form.Item className="mb-0" name="contentMode">
                    <FormSelect
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
                </div>

                {contentModeValue === "copy" ? (
                  <div className="grid gap-2">
                    {renderFieldHeader(
                      props.t,
                      "content_pages:FIELD_COPY_SOURCE_LABEL",
                      "content_pages:FIELD_COPY_SOURCE_DESC",
                    )}
                    <Form.Item
                      className="mb-0"
                      name="sourcePageId"
                      rules={[
                        {
                          required: true,
                          message: props.t("content_pages:VALIDATION_COPY_SOURCE_REQUIRED"),
                        },
                      ]}
                    >
                      <FormSelect
                        options={copySourceOptions}
                        placeholder={props.t("content_pages:COPY_SOURCE_PLACEHOLDER")}
                      />
                    </Form.Item>
                  </div>
                ) : null}
              </>
            ) : null}

            {typeValue === "template" ? (
              <div className="text-caption text-label-secondary">
                {props.t("content_pages:TYPE_TEMPLATE_HINT")}
              </div>
            ) : null}
          </ChromeTabsContent>
        </ChromeTabs>
      </Form>
    </SettingSheet>
  );
}
