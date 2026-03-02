import { Button, Card, Form, Input } from "antd";
import { Check, FileText, Globe, Newspaper } from "lucide-react";
import { type ComponentType, useMemo } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { SettingAccordionItem } from "@/components/settings-primitives/setting-accordion-item";
import { Accordion } from "@/components/ui/accordion";
import { SETUP_WORKSPACE_TEMPLATE_KEYS } from "@/lib/setup-template";
import type { SetupSiteDraft, SetupWorkspaceTemplate } from "@/types/stores";

const TEMPLATE_ICON: Record<SetupWorkspaceTemplate, ComponentType<{ size?: number }>> = {
  blog: Newspaper,
  website: Globe,
  blank: FileText,
};

export function SetupWorkspaceTemplateStep(props: {
  form: ReturnType<typeof Form.useForm<SetupSiteDraft>>[0];
  disabled?: boolean;
  onValuesChange: (changed: Partial<SetupSiteDraft>, values: Partial<SetupSiteDraft>) => void;
  onTemplateSelect: (templateKey: SetupWorkspaceTemplate) => void;
}) {
  const { t } = useTranslation();
  const selectedTemplate = Form.useWatch("templateKey", props.form) as
    | SetupWorkspaceTemplate
    | undefined;
  const workspaceName = Form.useWatch("workspaceName", props.form) as string | undefined;
  const siteName = Form.useWatch("siteName", props.form) as string | undefined;
  const siteUrl = Form.useWatch("siteUrl", props.form) as string | undefined;
  const siteDescription = Form.useWatch("siteDescription", props.form) as string | undefined;

  const templateItems = useMemo(
    () =>
      SETUP_WORKSPACE_TEMPLATE_KEYS.map((key) => ({
        key,
        title: t(`setup:SETUP_TEMPLATE_${key.toUpperCase()}_TITLE`),
        description: t(`setup:SETUP_TEMPLATE_${key.toUpperCase()}_CARD_DESC`),
      })),
    [t],
  );

  return (
    <Form<SetupSiteDraft>
      form={props.form}
      layout="vertical"
      requiredMark={false}
      autoComplete="off"
      disabled={props.disabled}
      onValuesChange={props.onValuesChange}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3" style={{ marginBottom: 18 }}>
        {templateItems.map((template) => {
          const Icon = TEMPLATE_ICON[template.key];
          const selected = selectedTemplate === template.key;

          return (
            <Card
              key={template.key}
              className={clsx(
                "cursor-pointer border transition-all duration-200 shadow-xs hover:shadow-sm",
                selected ? "border-primary bg-primary/7" : "border-border/70",
              )}
              styles={{ body: { paddingTop: 14, paddingBottom: 14 } }}
              cover={
                <div className="h-28 border-b border-border/50 bg-muted/35">
                  {/* Template cover image placeholder (to be replaced with real preview image). */}
                </div>
              }
              actions={[
                <button
                  key={`${template.key}-action`}
                  type="button"
                  className={clsx(
                    "inline-flex cursor-pointer items-center gap-1 text-body font-medium",
                    selected ? "text-primary" : undefined,
                  )}
                  onClick={() => props.onTemplateSelect(template.key)}
                  aria-label={template.title}
                >
                  <Icon size={16} />
                  <span>
                    {selected
                      ? t("setup:SETUP_TEMPLATE_SELECTED_ACTION")
                      : t("setup:SETUP_TEMPLATE_SELECT_ACTION")}
                  </span>
                  {selected ? <Check size={16} /> : null}
                </button>,
              ]}
              onClick={() => props.onTemplateSelect(template.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  props.onTemplateSelect(template.key);
                }
              }}
              aria-label={template.title}
            >
              <Card.Meta
                title={
                  <span className={clsx("text-headline", selected ? "text-primary" : undefined)}>
                    {template.title}
                  </span>
                }
                description={
                  <span
                    className={clsx(
                      "text-callout",
                      selected ? "text-primary/85" : "text-label-secondary",
                    )}
                  >
                    {template.description}
                  </span>
                }
              />
            </Card>
          );
        })}
      </div>

      <Form.Item<SetupSiteDraft>
        name="templateKey"
        rules={[{ required: true, message: t("setup:SETUP_VALIDATION_TEMPLATE_REQUIRED") }]}
        style={{ marginBottom: 12 }}
      >
        <Input type="hidden" />
      </Form.Item>

      {/* Hidden items register fields for antd validation. */}
      <Form.Item<SetupSiteDraft>
        name="workspaceName"
        rules={[{ required: true, message: t("setup:SETUP_VALIDATION_WORKSPACE_NAME_REQUIRED") }]}
        hidden
      >
        <Input />
      </Form.Item>
      <Form.Item<SetupSiteDraft>
        name="siteName"
        rules={[{ required: true, message: t("setup:SETUP_VALIDATION_SITE_NAME_REQUIRED") }]}
        hidden
      >
        <Input />
      </Form.Item>
      <Form.Item<SetupSiteDraft>
        name="siteUrl"
        rules={[
          { required: true, message: t("setup:SETUP_VALIDATION_SITE_URL_REQUIRED") },
          {
            validator: async (_rule, value: string | undefined) => {
              const raw = (value || "").trim();
              if (!raw) return;
              try {
                const url = new URL(raw);
                if (url.protocol !== "http:" && url.protocol !== "https:") {
                  throw new Error("protocol");
                }
              } catch {
                throw new Error(t("setup:SETUP_VALIDATION_SITE_URL_INVALID"));
              }
            },
          },
        ]}
        hidden
      >
        <Input />
      </Form.Item>
      <Form.Item<SetupSiteDraft> name="siteDescription" hidden>
        <Input />
      </Form.Item>

      <Accordion type="single" collapsible className="px-0">
        <SettingAccordionItem
          value="workspaceName"
          title={t("setup:SETUP_FIELD_WORKSPACE_NAME_LABEL")}
          description={t("setup:SETUP_FIELD_WORKSPACE_NAME_DESC")}
          showSummary
          summary={workspaceName || "-"}
          disabled={props.disabled}
        >
          <Input
            autoComplete="off"
            aria-label={t("setup:SETUP_FIELD_WORKSPACE_NAME_LABEL")}
            placeholder={t("setup:SETUP_FIELD_WORKSPACE_NAME_PLACEHOLDER")}
            size="large"
            value={workspaceName}
            onChange={(e) => {
              const next = e.target.value;
              props.form.setFieldValue("workspaceName", next);
              props.onValuesChange({ workspaceName: next }, props.form.getFieldsValue(true));
            }}
          />
        </SettingAccordionItem>

        <SettingAccordionItem
          value="siteName"
          title={t("setup:SETUP_FIELD_SITE_NAME_LABEL")}
          description={t("setup:SETUP_FIELD_SITE_NAME_DESC")}
          showSummary
          summary={siteName || "-"}
          disabled={props.disabled}
        >
          <Input
            autoComplete="off"
            aria-label={t("setup:SETUP_FIELD_SITE_NAME_LABEL")}
            placeholder={t("setup:SETUP_FIELD_SITE_NAME_PLACEHOLDER")}
            size="large"
            value={siteName}
            onChange={(e) => {
              const next = e.target.value;
              props.form.setFieldValue("siteName", next);
              props.onValuesChange({ siteName: next }, props.form.getFieldsValue(true));
            }}
          />
        </SettingAccordionItem>

        <SettingAccordionItem
          value="siteUrl"
          title={t("setup:SETUP_FIELD_SITE_URL_LABEL")}
          description={t("setup:SETUP_FIELD_SITE_URL_DESC")}
          showSummary
          summary={siteUrl || "-"}
          disabled={props.disabled}
        >
          <Input
            autoComplete="off"
            aria-label={t("setup:SETUP_FIELD_SITE_URL_LABEL")}
            placeholder={t("setup:SETUP_FIELD_SITE_URL_PLACEHOLDER")}
            size="large"
            value={siteUrl}
            onChange={(e) => {
              const next = e.target.value;
              props.form.setFieldValue("siteUrl", next);
              props.onValuesChange({ siteUrl: next }, props.form.getFieldsValue(true));
            }}
          />
        </SettingAccordionItem>

        <SettingAccordionItem
          value="siteDescription"
          title={t("setup:SETUP_FIELD_SITE_DESC_LABEL")}
          description={t("setup:SETUP_FIELD_SITE_DESC_DESC")}
          showSummary
          summary={siteDescription || "-"}
          disabled={props.disabled}
        >
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 5 }}
            aria-label={t("setup:SETUP_FIELD_SITE_DESC_LABEL")}
            placeholder={t("setup:SETUP_FIELD_SITE_DESC_PLACEHOLDER")}
            maxLength={160}
            allowClear
            showCount={{ formatter: ({ count }) => `${count}/160` }}
            value={siteDescription}
            onChange={(e) => {
              const next = e.target.value;
              props.form.setFieldValue("siteDescription", next);
              props.onValuesChange({ siteDescription: next }, props.form.getFieldsValue(true));
            }}
          />
        </SettingAccordionItem>
      </Accordion>

      {/* Prevent Enter key from moving steps unexpectedly. */}
      <Button htmlType="submit" style={{ display: "none" }} />
    </Form>
  );
}
