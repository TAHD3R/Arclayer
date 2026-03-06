import { Drawer, Input, Select, Space, Button, Typography, Tabs } from "antd";
import type { FieldErrors, Resolver } from "react-hook-form";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { useState } from "react";

import type { WorkspacePageTreeNode, WorkspacePageUpdateIn } from "@/types/api";
import type { PageBlueprint } from "@celestial/block-protocol";

const formSchema = z.object({
  path: z
    .string()
    .trim()
    .min(1, "PATH_REQUIRED")
    .refine((v) => v.startsWith("/"), "PATH_MUST_START_WITH_SLASH"),
  title: z.string().trim().max(256).nullable().optional(),
  description: z.string().trim().max(1024).nullable().optional(),
  visibility: z.enum(["public", "private"]),
});

export type PageSettingsFormValues = z.infer<typeof formSchema>;

const resolver: Resolver<PageSettingsFormValues> = async (values) => {
  const parsed = formSchema.safeParse(values);
  if (parsed.success) return { values: parsed.data, errors: {} };

  const errors: FieldErrors<PageSettingsFormValues> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path?.[0] ?? "").trim();
    if (!key) continue;
    if (key in errors) continue;
    (errors as Record<string, unknown>)[key] = {
      type: issue.code,
      message: issue.message,
    };
  }

  return { values: {}, errors };
};

export type PageSettingsDrawerProps = {
  open: boolean;
  page: WorkspacePageTreeNode | null | undefined;
  pageBlueprint?: PageBlueprint | null;
  supportedLocales?: string[] | null;
  defaultLocale?: string | null;
  fallbackLocale?: string | null;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (payload: WorkspacePageUpdateIn) => Promise<void> | void;
  onChangePageBlueprintSeo?: (next: PageBlueprint) => void;
};

function normalizeNullableText(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  return raw;
}

export function PageSettingsDrawer(props: PageSettingsDrawerProps) {
  const { t } = useTranslation(["editor"]);

  const page = props.page;
  const doc = props.pageBlueprint ?? null;
  const locales =
    props.supportedLocales && props.supportedLocales.length
      ? props.supportedLocales
      : [props.defaultLocale, props.fallbackLocale].filter(
          (x): x is string => typeof x === "string" && x.trim().length > 0,
        );
  const [activeLocale, setActiveLocale] = useState<string>(() => locales[0] ?? "en-US");

  const form = useForm<PageSettingsFormValues>({
    resolver,
    values: page
      ? {
          path: page.path,
          title: page.title ?? null,
          description: page.description ?? null,
          visibility: page.visibility,
        }
      : {
          path: "/",
          title: null,
          description: null,
          visibility: "public",
        },
    mode: "onSubmit",
  });

  const onSave = async () => {
    const ok = await form.trigger();
    if (!ok) return;
    const values = form.getValues();

    const payload: WorkspacePageUpdateIn = {
      path: values.path.trim(),
      title: normalizeNullableText(values.title) || null,
      description: normalizeNullableText(values.description) || null,
      visibility: values.visibility,
    };
    await props.onSubmit(payload);
  };

  const root = doc ? doc.nodesById[doc.rootId] : null;
  const rootSeo = root && root.type === "page_root" ? (root.seo ?? null) : null;

  const getSeoText = (key: "title" | "description", locale: string): string => {
    if (!rootSeo) return "";
    const v = rootSeo[key];
    if (!v || typeof v !== "object" || Array.isArray(v)) return "";
    const m = v as Record<string, unknown>;
    const out = m[locale];
    return typeof out === "string" ? out : "";
  };

  const setSeoText = (key: "title" | "description", locale: string, text: string) => {
    if (!doc) return;
    const rootNode = doc.nodesById[doc.rootId];
    if (!rootNode || rootNode.type !== "page_root") return;

    const next = JSON.parse(JSON.stringify(doc)) as PageBlueprint;
    const nextRoot = next.nodesById[next.rootId];
    if (!nextRoot || nextRoot.type !== "page_root") return;

    const seo = (nextRoot.seo ?? {}) as {
      title?: Record<string, string>;
      description?: Record<string, string>;
    };
    const map = (seo[key] ?? {}) as Record<string, string>;
    const v = (text || "").trim();
    if (v) map[locale] = v;
    else delete map[locale];
    seo[key] = map;
    nextRoot.seo = seo;
    props.onChangePageBlueprintSeo?.(next);
  };

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      title={t("editor:EDITOR_PAGE_SETTINGS_TITLE")}
      width={420}
      destroyOnClose
    >
      {!page ? (
        <Typography.Text type="secondary">{t("editor:EDITOR_PAGE_SETTINGS_EMPTY")}</Typography.Text>
      ) : (
        <Space direction="vertical" size={12} className="w-full">
          {doc && locales.length ? (
            <div>
              <Typography.Text strong>{t("editor:EDITOR_PAGE_SETTINGS_SEO_TITLE")}</Typography.Text>
              <div className="mt-2">
                <Tabs
                  size="small"
                  activeKey={activeLocale}
                  onChange={(k) => setActiveLocale(String(k))}
                  items={locales.map((loc) => ({
                    key: loc,
                    label: loc,
                    children: (
                      <Space direction="vertical" size={10} className="w-full">
                        <div>
                          <Typography.Text type="secondary">
                            {t("editor:EDITOR_PAGE_SETTINGS_SEO_META_TITLE")}
                          </Typography.Text>
                          <Input
                            className="mt-2"
                            value={getSeoText("title", loc)}
                            onChange={(e) => setSeoText("title", loc, e.target.value)}
                            placeholder={t(
                              "editor:EDITOR_PAGE_SETTINGS_SEO_META_TITLE_PLACEHOLDER",
                            )}
                          />
                        </div>

                        <div>
                          <Typography.Text type="secondary">
                            {t("editor:EDITOR_PAGE_SETTINGS_SEO_META_DESC")}
                          </Typography.Text>
                          <Input.TextArea
                            className="mt-2"
                            value={getSeoText("description", loc)}
                            onChange={(e) => setSeoText("description", loc, e.target.value)}
                            placeholder={t("editor:EDITOR_PAGE_SETTINGS_SEO_META_DESC_PLACEHOLDER")}
                            autoSize={{ minRows: 3, maxRows: 6 }}
                          />
                        </div>
                      </Space>
                    ),
                  }))}
                />
              </div>
              <Typography.Text type="secondary" className="text-caption">
                {t("editor:EDITOR_PAGE_SETTINGS_SEO_HINT")}
              </Typography.Text>
            </div>
          ) : null}

          <div>
            <Typography.Text strong>{t("editor:EDITOR_PAGES_FORM_PATH")}</Typography.Text>
            <Controller
              control={form.control}
              name="path"
              render={({ field, fieldState }) => (
                <div className="mt-2">
                  <Input {...field} status={fieldState.error ? "error" : ""} />
                  {fieldState.error ? (
                    <Typography.Text type="danger" className="mt-1 block text-caption">
                      {fieldState.error.message === "PATH_REQUIRED"
                        ? t("editor:EDITOR_PAGES_FORM_PATH_REQUIRED")
                        : t("editor:EDITOR_PAGE_SETTINGS_PATH_INVALID")}
                    </Typography.Text>
                  ) : null}
                </div>
              )}
            />
          </div>

          <div>
            <Typography.Text strong>{t("editor:EDITOR_PAGES_FORM_TITLE")}</Typography.Text>
            <Controller
              control={form.control}
              name="title"
              render={({ field }) => (
                <div className="mt-2">
                  <Input
                    value={(field.value ?? "") as string}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder={t("editor:EDITOR_PAGES_FORM_TITLE_PLACEHOLDER")}
                  />
                </div>
              )}
            />
          </div>

          <div>
            <Typography.Text strong>{t("editor:EDITOR_PAGES_FORM_DESC")}</Typography.Text>
            <Controller
              control={form.control}
              name="description"
              render={({ field }) => (
                <div className="mt-2">
                  <Input.TextArea
                    value={(field.value ?? "") as string}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder={t("editor:EDITOR_PAGES_FORM_DESC_PLACEHOLDER")}
                    autoSize={{ minRows: 3, maxRows: 6 }}
                  />
                </div>
              )}
            />
          </div>

          <div>
            <Typography.Text strong>{t("editor:EDITOR_PAGE_SETTINGS_VISIBILITY")}</Typography.Text>
            <Controller
              control={form.control}
              name="visibility"
              render={({ field }) => (
                <div className="mt-2">
                  <Select
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    options={[
                      { value: "public", label: t("editor:EDITOR_PAGE_SETTINGS_VIS_PUBLIC") },
                      { value: "private", label: t("editor:EDITOR_PAGE_SETTINGS_VIS_PRIVATE") },
                    ]}
                    className="w-full"
                  />
                </div>
              )}
            />
          </div>

          <div className="mt-2 flex justify-end">
            <Space>
              <Button onClick={props.onClose}>{t("editor:EDITOR_PAGE_SETTINGS_CANCEL")}</Button>
              <Button type="primary" onClick={() => void onSave()} loading={props.saving}>
                {t("editor:EDITOR_PAGE_SETTINGS_SAVE")}
              </Button>
            </Space>
          </div>
        </Space>
      )}
    </Drawer>
  );
}
