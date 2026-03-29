import { Check, FileText, Globe, Newspaper } from "lucide-react";
import { type ComponentType, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { UseFormReturn } from "react-hook-form";
import clsx from "clsx";

import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { Accordion } from "@arclayer/ui/accordion";
import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { SETUP_WORKSPACE_TEMPLATE_KEYS } from "@/lib/setup-template";
import { SetupFieldShell, SetupInputControl, SetupTextarea } from "./setup-form-controls";
import type { SetupSiteDraft, SetupWorkspaceTemplate } from "@/types/stores";

const TEMPLATE_ICON: Record<SetupWorkspaceTemplate, ComponentType<{ size?: number }>> = {
  blog: Newspaper,
  website: Globe,
  blank: FileText,
};

export function SetupWorkspaceTemplateStep(props: {
  form: UseFormReturn<SetupSiteDraft>;
  disabled?: boolean;
  onTemplateSelect: (templateKey: SetupWorkspaceTemplate) => void;
}) {
  const { t } = useTranslation();
  const values = props.form.watch();

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
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {templateItems.map((template) => {
          const Icon = TEMPLATE_ICON[template.key];
          const selected = values.templateKey === template.key;

          return (
            <Card
              key={template.key}
              className={clsx(
                "cursor-pointer border transition-all duration-200  hover:",
                selected ? "border-primary bg-primary/7" : "border-border/70",
              )}
              onClick={() => props.onTemplateSelect(template.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                props.onTemplateSelect(template.key);
              }}
              aria-label={template.title}
            >
              <div className="h-28 border-b border-border/50 bg-muted/35" />
              <CardHeader className="pb-4">
                <CardTitle
                  className={clsx(
                    "flex items-center gap-2 text-headline",
                    selected && "text-primary",
                  )}
                >
                  <Icon size={16} />
                  {template.title}
                  {selected ? <Check size={16} /> : null}
                </CardTitle>
                <CardDescription
                  className={clsx(
                    "text-callout",
                    selected ? "text-primary/85" : "text-label-secondary",
                  )}
                >
                  {template.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  type="button"
                  variant={selected ? "secondary" : "ghost"}
                  className="w-full justify-center"
                >
                  {selected
                    ? t("setup:SETUP_TEMPLATE_SELECTED_ACTION")
                    : t("setup:SETUP_TEMPLATE_SELECT_ACTION")}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Accordion type="single" collapsible className="px-0">
        <SettingAccordionItem
          value="workspaceName"
          title={t("setup:SETUP_FIELD_WORKSPACE_NAME_LABEL")}
          description={t("setup:SETUP_FIELD_WORKSPACE_NAME_DESC")}
          showSummary
          summary={values.workspaceName || "-"}
          disabled={props.disabled}
        >
          <SetupFieldShell
            error={
              props.form.formState.errors.workspaceName?.message
                ? String(props.form.formState.errors.workspaceName.message)
                : undefined
            }
          >
            <SetupInputControl
              autoComplete="off"
              aria-label={t("setup:SETUP_FIELD_WORKSPACE_NAME_LABEL")}
              placeholder={t("setup:SETUP_FIELD_WORKSPACE_NAME_PLACEHOLDER")}
              disabled={props.disabled}
              {...props.form.register("workspaceName")}
            />
          </SetupFieldShell>
        </SettingAccordionItem>

        <SettingAccordionItem
          value="siteName"
          title={t("setup:SETUP_FIELD_SITE_NAME_LABEL")}
          description={t("setup:SETUP_FIELD_SITE_NAME_DESC")}
          showSummary
          summary={values.siteName || "-"}
          disabled={props.disabled}
        >
          <SetupFieldShell
            error={
              props.form.formState.errors.siteName?.message
                ? String(props.form.formState.errors.siteName.message)
                : undefined
            }
          >
            <SetupInputControl
              autoComplete="off"
              aria-label={t("setup:SETUP_FIELD_SITE_NAME_LABEL")}
              placeholder={t("setup:SETUP_FIELD_SITE_NAME_PLACEHOLDER")}
              disabled={props.disabled}
              {...props.form.register("siteName")}
            />
          </SetupFieldShell>
        </SettingAccordionItem>

        <SettingAccordionItem
          value="siteUrl"
          title={t("setup:SETUP_FIELD_SITE_URL_LABEL")}
          description={t("setup:SETUP_FIELD_SITE_URL_DESC")}
          showSummary
          summary={values.siteUrl || "-"}
          disabled={props.disabled}
        >
          <SetupFieldShell
            error={
              props.form.formState.errors.siteUrl?.message
                ? String(props.form.formState.errors.siteUrl.message)
                : undefined
            }
          >
            <SetupInputControl
              autoComplete="off"
              aria-label={t("setup:SETUP_FIELD_SITE_URL_LABEL")}
              placeholder={t("setup:SETUP_FIELD_SITE_URL_PLACEHOLDER")}
              disabled={props.disabled}
              {...props.form.register("siteUrl")}
            />
          </SetupFieldShell>
        </SettingAccordionItem>

        <SettingAccordionItem
          value="siteDescription"
          title={t("setup:SETUP_FIELD_SITE_DESC_LABEL")}
          description={t("setup:SETUP_FIELD_SITE_DESC_DESC")}
          showSummary
          summary={values.siteDescription || "-"}
          disabled={props.disabled}
        >
          <SetupFieldShell
            error={
              props.form.formState.errors.siteDescription?.message
                ? String(props.form.formState.errors.siteDescription.message)
                : undefined
            }
          >
            <SetupTextarea
              aria-label={t("setup:SETUP_FIELD_SITE_DESC_LABEL")}
              placeholder={t("setup:SETUP_FIELD_SITE_DESC_PLACEHOLDER")}
              maxLength={160}
              disabled={props.disabled}
              {...props.form.register("siteDescription")}
            />
            <div className="flex items-center justify-end text-caption text-label-secondary">
              {`${(values.siteDescription || "").length}/160`}
            </div>
          </SetupFieldShell>
        </SettingAccordionItem>
      </Accordion>
    </div>
  );
}
