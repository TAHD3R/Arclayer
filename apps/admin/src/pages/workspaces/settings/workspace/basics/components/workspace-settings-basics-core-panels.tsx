import { Accordion } from "@celestial/ui/accordion";
import { Input } from "@celestial/ui/input";
import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { SettingPanel } from "@celestial/ui/setting-panel";

import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";
import { WorkspaceSettingsIconAccordionItem } from "./workspace-settings-icon-accordion-item";
import { WorkspaceSettingsBasicsLocalizationPanel } from "./workspace-settings-basics-localization-panel";

function FieldMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="text-footnote text-destructive">{message}</div>;
}

export function WorkspaceSettingsBasicsCorePanels(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;
  const nameField = c.form.register("name", {
    required: t("settings:SETTINGS_WORKSPACE_NAME_REQUIRED"),
    maxLength: { value: 128, message: t("settings:SETTINGS_WORKSPACE_NAME_TOO_LONG") },
  });
  const slugField = c.form.register("slug", {
    required: t("settings:SETTINGS_WORKSPACE_SLUG_REQUIRED"),
    maxLength: { value: 64, message: t("settings:SETTINGS_WORKSPACE_SLUG_TOO_LONG") },
  });

  return (
    <>
      <SettingPanel
        title={t("settings:SETTINGS_WORKSPACE_BASICS_PANEL_TITLE")}
        description={t("settings:SETTINGS_WORKSPACE_BASICS_PANEL_DESC")}
      >
        <div className="rounded-lg border border-border">
          <Accordion type="single" collapsible className="px-0">
            <SettingAccordionItem
              value="workspace_name"
              variant="action"
              title={t("settings:SETTINGS_WORKSPACE_NAME_LABEL")}
              description={t("settings:SETTINGS_WORKSPACE_NAME_ITEM_DESC")}
              showSummary
              summary={c.currentWorkspaceName}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              keepRendered
              disabled={c.disabled || !c.detailQuery.data}
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={c.savingKey === "workspace:name"}
              onConfirm={() =>
                void c.withSavingKey("workspace:name", async () => {
                  const values = await validateFormFields(c.form, ["name"]);
                  await c.patchWorkspaceMutation.mutateAsync({
                    name: String(values.name || "").trim(),
                  });
                })
              }
              onReset={
                c.isWorkspaceNameDirty && c.detailQuery.data
                  ? () =>
                      void c.withSavingKey("reset:workspace:name", async () => {
                        c.form.setValue("name", c.initialWorkspaceName, { shouldDirty: false });
                        c.form.clearErrors("name");
                        await c.patchWorkspaceMutation.mutateAsync({
                          name: String(c.initialWorkspaceName || "").trim(),
                        });
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={c.savingKey === "reset:workspace:name"}
            >
              <div className="space-y-2">
                <Input
                  {...nameField}
                  placeholder={t("settings:SETTINGS_WORKSPACE_NAME_PLACEHOLDER")}
                />
                <FieldMessage message={getFieldErrorMessage(c.form, "name")} />
              </div>
            </SettingAccordionItem>

            <WorkspaceSettingsIconAccordionItem controller={c} />

            <SettingAccordionItem
              value="workspace_slug"
              variant="action"
              title={t("settings:SETTINGS_WORKSPACE_SLUG_LABEL")}
              description={t("settings:SETTINGS_WORKSPACE_SLUG_DESC")}
              showSummary
              summary={c.currentWorkspaceSlug}
              placeholder={t("settings:SETTINGS_NOT_SET")}
              keepRendered
              disabled={c.disabled || !c.detailQuery.data}
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={c.savingKey === "workspace:slug"}
              onConfirm={() =>
                void c.withSavingKey("workspace:slug", async () => {
                  const values = await validateFormFields(c.form, ["slug"]);
                  await c.patchWorkspaceMutation.mutateAsync({
                    slug: String(values.slug || "").trim(),
                  });
                })
              }
              onReset={
                c.isWorkspaceSlugDirty && c.detailQuery.data
                  ? () =>
                      void c.withSavingKey("reset:workspace:slug", async () => {
                        c.form.setValue("slug", c.initialWorkspaceSlug, { shouldDirty: false });
                        c.form.clearErrors("slug");
                        await c.patchWorkspaceMutation.mutateAsync({
                          slug: String(c.persistedWorkspaceSlug || "").trim(),
                        });
                      })
                  : undefined
              }
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={c.savingKey === "reset:workspace:slug"}
            >
              <div className="space-y-2">
                <Input
                  {...slugField}
                  placeholder={t("settings:SETTINGS_WORKSPACE_SLUG_PLACEHOLDER")}
                />
                <FieldMessage message={getFieldErrorMessage(c.form, "slug")} />
                <div className="text-label-secondary">
                  {t("settings:SETTINGS_WORKSPACE_SLUG_PORTAL_HINT", {
                    url: c.siteUrl,
                  })}
                </div>
              </div>
            </SettingAccordionItem>
          </Accordion>
        </div>
      </SettingPanel>

      <WorkspaceSettingsBasicsLocalizationPanel controller={c} />
    </>
  );
}
