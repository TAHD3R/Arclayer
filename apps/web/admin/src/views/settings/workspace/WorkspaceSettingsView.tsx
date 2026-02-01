import { Form, Input } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { getWorkspaceDetail, patchWorkspaceDetail } from "@/api/workspaces";
import { DefaultPage } from "@/components/app/defaultPage";
import { PageState } from "@/components/app/pageState";
import { Accordion } from "@/components/animate-ui/components/radix/accordion";
import { SettingAccordionItem } from "@/components/app/settingAccordionItem";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { SettingActionItem } from "@/components/app/settingActionItem";
import { SettingOverlayFooter } from "@/components/app/settingOverlayFooter";
import { SettingPanel } from "@/components/app/settingPanel";
import { notifyError, notifySuccessText } from "@/utils/notifications";
import { useSettingOverlays, type SettingOverlayConfig } from "@/hooks/useSettingOverlays";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

type WorkspaceSettingsTabKey =
  | "basics"
  | "collaboration"
  | "content_strategy"
  | "integrations"
  | "resource_processing";

type FormValues = {
  name: string;
  slug: string;
};

function normalizeSlug(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase();
}

function isValidSlug(slug: string): boolean {
  // Keep it aligned with backend: ^[a-z0-9]+(?:-[a-z0-9]+)*$
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function WorkspaceSettingsView() {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const detailQuery = useQuery({
    queryKey: ["workspace", "detail", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => getWorkspaceDetail(String(workspaceId)),
    retry: false,
    meta: { silent: true },
  });

  React.useEffect(() => {
    if (!detailQuery.data) return;
    if (form.isFieldsTouched()) return;
    form.setFieldsValue({
      name: detailQuery.data.name,
      slug: detailQuery.data.slug,
    });
  }, [detailQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return patchWorkspaceDetail(String(workspaceId), {
        name: String(values.name || "").trim(),
        slug: normalizeSlug(values.slug),
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({ queryKey: ["workspace", "detail", workspaceId] });
      // Workspace selector + other places rely on this list.
      await queryClient.invalidateQueries({ queryKey: ["me", "workspaces"] });
    },
    onError: (err) => notifyError(err),
  });

  const disabled = detailQuery.isFetching || saveMutation.isPending;

  type OverlayKey = "basics";

  const saveBasics = async () => {
    const values = await form.validateFields(["name", "slug"]);
    await saveMutation.mutateAsync(values);
  };

  const resetBasics = async () => {
    if (!detailQuery.data) return;
    form.setFieldsValue({ name: detailQuery.data.name, slug: detailQuery.data.slug });
  };

  const overlayConfigs = React.useMemo<readonly SettingOverlayConfig<OverlayKey>[]>(() => {
    return [
      {
        key: "basics",
        type: "sheet",
        title: t("settings:SETTINGS_WORKSPACE_BASICS_EDIT_TITLE"),
        description: t("settings:SETTINGS_WORKSPACE_BASICS_EDIT_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:BACK")}
            resetText={t("settings:SETTINGS_RESET")}
            resetVisible
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={saveMutation.isPending}
            disabled={disabled}
            onReset={resetBasics}
            onSave={saveBasics}
          />
        ),
        content: () => (
          <div className="space-y-6">
            <Form.Item
              name="name"
              label={t("settings:SETTINGS_WORKSPACE_NAME_LABEL")}
              rules={[
                { required: true, message: t("settings:SETTINGS_WORKSPACE_NAME_REQUIRED") },
                { max: 128, message: t("settings:SETTINGS_WORKSPACE_NAME_TOO_LONG") },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input size="large" placeholder={t("settings:SETTINGS_WORKSPACE_NAME_PLACEHOLDER")} />
            </Form.Item>

            <Form.Item
              name="slug"
              label={t("settings:SETTINGS_WORKSPACE_SLUG_LABEL")}
              rules={[
                { required: true, message: t("settings:SETTINGS_WORKSPACE_SLUG_REQUIRED") },
                {
                  validator: async (_rule, value) => {
                    const slug = normalizeSlug(String(value || ""));
                    if (!slug) throw new Error(t("settings:SETTINGS_WORKSPACE_SLUG_REQUIRED"));
                    if (slug.length > 64)
                      throw new Error(t("settings:SETTINGS_WORKSPACE_SLUG_TOO_LONG"));
                    if (!isValidSlug(slug))
                      throw new Error(t("settings:SETTINGS_WORKSPACE_SLUG_INVALID"));
                  },
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input size="large" placeholder={t("settings:SETTINGS_WORKSPACE_SLUG_PLACEHOLDER")} />
            </Form.Item>
          </div>
        ),
      },
    ];
  }, [disabled, form, saveMutation.isPending, t]);

  const overlays = useSettingOverlays(overlayConfigs);

  return (
    <DefaultPage
      title={t("settings:SETTINGS_WORKSPACE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_DESC")}
      width="fixed"
    >
      <PageState
        loading={Boolean(workspaceId && detailQuery.isLoading && !detailQuery.data)}
        loadingVariant="form"
        empty={!workspaceId}
        emptyTitle={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_TITLE")}
        emptyDescription={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_DESC")}
        error={detailQuery.isError ? detailQuery.error : null}
        onRetry={() => void detailQuery.refetch()}
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          autoComplete="off"
          disabled={disabled}
          initialValues={{
            name: detailQuery.data?.name ?? "",
            slug: detailQuery.data?.slug ?? "",
          }}
        >
          <ChromeTabs defaultValue={"basics" satisfies WorkspaceSettingsTabKey}>
            <ChromeTabsList>
              <ChromeTabsTrigger value="basics">
                {t("settings:SETTINGS_WORKSPACE_TAB_BASICS")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="collaboration">
                {t("settings:SETTINGS_WORKSPACE_TAB_COLLABORATION")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="content_strategy">
                {t("settings:SETTINGS_WORKSPACE_TAB_CONTENT_STRATEGY")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="integrations">
                {t("settings:SETTINGS_WORKSPACE_TAB_INTEGRATIONS")}
              </ChromeTabsTrigger>
              <ChromeTabsTrigger value="resource_processing">
                {t("settings:SETTINGS_WORKSPACE_TAB_RESOURCE_PROCESSING")}
              </ChromeTabsTrigger>
            </ChromeTabsList>

            <ChromeTabsContent value="basics">
              <div className="flex flex-col gap-8">
                <SettingPanel
                  title={t("settings:SETTINGS_WORKSPACE_BASICS_PANEL_TITLE")}
                  description={t("settings:SETTINGS_WORKSPACE_BASICS_PANEL_DESC")}
                >
                  <div className="divide-y divide-border rounded-lg border border-border">
                    <SettingActionItem
                      title={t("settings:SETTINGS_WORKSPACE_NAME_LABEL")}
                      summary={detailQuery.data?.name}
                      placeholder={t("settings:SETTINGS_NOT_SET")}
                      description={t("settings:SETTINGS_WORKSPACE_NAME_ITEM_DESC")}
                      disabled={disabled || !detailQuery.data}
                      onTrigger={() => overlays.open("basics")}
                    />
                    <SettingActionItem
                      title={t("settings:SETTINGS_WORKSPACE_SLUG_LABEL")}
                      summary={detailQuery.data?.slug}
                      placeholder={t("settings:SETTINGS_NOT_SET")}
                      description={t("settings:SETTINGS_WORKSPACE_SLUG_ITEM_DESC")}
                      disabled={disabled || !detailQuery.data}
                      onTrigger={() => overlays.open("basics")}
                    />
                  </div>
                </SettingPanel>
              </div>
            </ChromeTabsContent>

            <ChromeTabsContent value="collaboration">
              <PlaceholderPoliciesPanel
                title={t("settings:SETTINGS_WORKSPACE_TAB_COLLABORATION")}
                description={t("settings:SETTINGS_WORKSPACE_COLLABORATION_DESC")}
                items={[
                  {
                    title: t("settings:SETTINGS_WORKSPACE_COLLAB_DEFAULT_ROLE_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_COLLAB_DEFAULT_ROLE_DESC"),
                  },
                  {
                    title: t("settings:SETTINGS_WORKSPACE_COLLAB_EDIT_LOCK_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_COLLAB_EDIT_LOCK_DESC"),
                  },
                  {
                    title: t("settings:SETTINGS_WORKSPACE_COLLAB_APPROVAL_FLOW_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_COLLAB_APPROVAL_FLOW_DESC"),
                  },
                ]}
              />
            </ChromeTabsContent>

            <ChromeTabsContent value="content_strategy">
              <PlaceholderPoliciesPanel
                title={t("settings:SETTINGS_WORKSPACE_TAB_CONTENT_STRATEGY")}
                description={t("settings:SETTINGS_WORKSPACE_CONTENT_STRATEGY_DESC")}
                items={[
                  {
                    title: t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_CONTENT_AUTOSAVE_DESC"),
                  },
                  {
                    title: t("settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_CONTENT_RETENTION_DESC"),
                  },
                ]}
              />
            </ChromeTabsContent>

            <ChromeTabsContent value="integrations">
              <PlaceholderPoliciesPanel
                title={t("settings:SETTINGS_WORKSPACE_TAB_INTEGRATIONS")}
                description={t("settings:SETTINGS_WORKSPACE_INTEGRATIONS_DESC")}
                items={[
                  {
                    title: t("settings:SETTINGS_WORKSPACE_INTEGRATIONS_WEBHOOKS_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_INTEGRATIONS_WEBHOOKS_DESC"),
                  },
                  {
                    title: t("settings:SETTINGS_WORKSPACE_INTEGRATIONS_PREVIEW_URL_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_INTEGRATIONS_PREVIEW_URL_DESC"),
                  },
                ]}
              />
            </ChromeTabsContent>

            <ChromeTabsContent value="resource_processing">
              <PlaceholderPoliciesPanel
                title={t("settings:SETTINGS_WORKSPACE_TAB_RESOURCE_PROCESSING")}
                description={t("settings:SETTINGS_WORKSPACE_RESOURCE_PROCESSING_DESC")}
                items={[
                  {
                    title: t("settings:SETTINGS_WORKSPACE_RESOURCE_IMAGE_PROCESSING_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_RESOURCE_IMAGE_PROCESSING_DESC"),
                  },
                  {
                    title: t("settings:SETTINGS_WORKSPACE_RESOURCE_CDN_PREFIX_TITLE"),
                    description: t("settings:SETTINGS_WORKSPACE_RESOURCE_CDN_PREFIX_DESC"),
                  },
                ]}
              />
            </ChromeTabsContent>
          </ChromeTabs>

          {overlays.renderOverlays()}
        </Form>
      </PageState>
    </DefaultPage>
  );
}

function PlaceholderPoliciesPanel(props: {
  title: string;
  description: string;
  items: Array<{ title: string; description: string }>;
}) {
  const { t } = useTranslation(["common"]);
  return (
    <SettingPanel title={props.title} description={props.description}>
      <Accordion
        type="single"
        collapsible
        className="divide-y divide-border rounded-lg border border-border"
      >
        {props.items.map((it, idx) => (
          <SettingAccordionItem
            key={`${it.title}-${idx}`}
            value={`placeholder-${idx}`}
            variant="action"
            title={it.title}
            description={it.description}
            disabled
            showSummary={false}
          >
            <div className="text-[16px] text-muted-foreground leading-snug">
              {t("common:PAGE_COMING_SOON_DESC")}
            </div>
          </SettingAccordionItem>
        ))}
      </Accordion>
    </SettingPanel>
  );
}
