import { Button, Form, Input } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { getWorkspaceDetail, patchWorkspaceDetail } from "@/api/workspaces";
import { DefaultPage } from "@/components/app/defaultPage";
import { PageState } from "@/components/app/pageState";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { notifyError, notifySuccessText } from "@/utils/notifications";

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
  });

  React.useEffect(() => {
    if (!detailQuery.data) return;
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

  const onSave = async () => {
    const values = await form.validateFields();
    await saveMutation.mutateAsync(values);
  };

  return (
    <DefaultPage
      title={t("settings:SETTINGS_WORKSPACE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_DESC")}
      width="fixed"
    >
      <PageState
        loading={detailQuery.isLoading && !detailQuery.data}
        loadingVariant="form"
        error={detailQuery.isError ? detailQuery.error : null}
        onRetry={() => void detailQuery.refetch()}
      >
        <div className="max-w-2xl">
          <Form<FormValues>
            form={form}
            layout="vertical"
            requiredMark={false}
            disabled={detailQuery.isFetching || saveMutation.isPending}
          >
            <Form.Item
              name="name"
              label={t("settings:SETTINGS_WORKSPACE_NAME_LABEL")}
              rules={[
                { required: true, message: t("settings:SETTINGS_WORKSPACE_NAME_REQUIRED") },
                { max: 128, message: t("settings:SETTINGS_WORKSPACE_NAME_TOO_LONG") },
              ]}
            >
              <Input placeholder={t("settings:SETTINGS_WORKSPACE_NAME_PLACEHOLDER")} />
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
            >
              <Input placeholder={t("settings:SETTINGS_WORKSPACE_SLUG_PLACEHOLDER")} />
            </Form.Item>

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  if (!detailQuery.data) return;
                  form.setFieldsValue({ name: detailQuery.data.name, slug: detailQuery.data.slug });
                }}
              >
                {t("settings:SETTINGS_RESET")}
              </Button>
              <Button type="primary" onClick={() => void onSave()} loading={saveMutation.isPending}>
                {t("settings:SETTINGS_SAVE")}
              </Button>
            </div>
          </Form>
        </div>
      </PageState>
    </DefaultPage>
  );
}
