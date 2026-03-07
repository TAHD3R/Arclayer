import { createFileRoute, Link } from "@tanstack/react-router";
import { App, Button, Card, Form, Input, List, Modal, Space, Tag, Typography } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@celestial/runtime/http";

import { createWorkspaceContentEntry, listWorkspaceContentEntries } from "@/api/content-entries";
import { getWorkspaceSite } from "@/api/workspace-site";
import type { ContentEntryCreateIn, ContentEntryOut } from "@/types/api";

export const Route = createFileRoute("/w/$workspaceId/blocks/")({
  component: WorkspaceReusableBlocksHome,
});

type CreateReusableBlockForm = {
  slug: string;
  title?: string;
};

function WorkspaceReusableBlocksHome() {
  const { t } = useTranslation(["editor"]);
  const { workspaceId } = Route.useParams();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const { message } = App.useApp();

  const siteQuery = useQuery({
    queryKey: ["workspace", workspaceId, "site"],
    queryFn: () => getWorkspaceSite(workspaceId),
  });

  const entriesQuery = useQuery({
    queryKey: ["workspace", workspaceId, "content", "entries", "reusable_block"],
    queryFn: () =>
      listWorkspaceContentEntries(workspaceId, {
        typeCode: "reusable_block",
        page: 1,
        size: 200,
      }),
  });

  const items = entriesQuery.data?.items ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<CreateReusableBlockForm>();

  const createMutation = useMutation({
    mutationFn: async (payload: CreateReusableBlockForm): Promise<ContentEntryOut> => {
      const slug = (payload.slug || "").trim();
      const title = (payload.title || "").trim();
      const defaultLocale = (siteQuery.data?.defaultLocale || "").trim();

      const createPayload: ContentEntryCreateIn = {
        typeCode: "reusable_block",
        slug,
        title: title ? title : null,
      };
      if (defaultLocale) createPayload.locale = defaultLocale;

      return await createWorkspaceContentEntry(workspaceId, createPayload);
    },
    onSuccess: async (created) => {
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "entries", "reusable_block"],
      });
      setCreateOpen(false);
      form.resetFields();
      await navigate({
        to: "/w/$workspaceId/blocks/$entryId/",
        params: { workspaceId, entryId: created.id },
      });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        message.error(err.message || t("editor:EDITOR_ROUTER_ERROR_TITLE"));
        return;
      }
      message.error(String(err));
    },
  });

  const onSubmitCreate = async () => {
    const values = await form.validateFields();
    await createMutation.mutateAsync(values);
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Typography.Title level={3} className="!mb-1">
              {t("editor:EDITOR_REUSABLE_BLOCKS_TITLE")}
            </Typography.Title>
            <Typography.Paragraph className="!mb-0 text-label-secondary">
              {t("editor:EDITOR_REUSABLE_BLOCKS_DESC")}
            </Typography.Paragraph>
          </div>
          <Space size={8} wrap>
            <Link to="/w/$workspaceId/" params={{ workspaceId }}>
              <Button>{t("editor:EDITOR_PAGE_BACK_TO_PAGES")}</Button>
            </Link>
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              {t("editor:EDITOR_REUSABLE_BLOCKS_CREATE")}
            </Button>
          </Space>
        </div>

        <div className="mt-4">
          {entriesQuery.error ? (
            <Typography.Text type="danger">{String(entriesQuery.error)}</Typography.Text>
          ) : (
            <List
              loading={entriesQuery.isLoading}
              dataSource={items}
              locale={{ emptyText: t("editor:EDITOR_REUSABLE_BLOCKS_EMPTY") }}
              renderItem={(entry) => (
                <List.Item
                  actions={[
                    <Link
                      key="open"
                      to="/w/$workspaceId/blocks/$entryId/"
                      params={{ workspaceId, entryId: entry.id }}
                    >
                      <Button>{t("editor:EDITOR_REUSABLE_BLOCKS_OPEN")}</Button>
                    </Link>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space size={8} wrap>
                        <Typography.Text strong>{entry.title || entry.slug}</Typography.Text>
                        <Typography.Text type="secondary">{entry.slug}</Typography.Text>
                      </Space>
                    }
                    description={
                      <Space size={8} wrap>
                        <Tag color={entry.visibility === "public" ? "green" : "default"}>
                          {entry.visibility}
                        </Tag>
                        <Tag>{`${t("editor:EDITOR_PAGES_DRAFT_REV")}: ${entry.draftRevision}`}</Tag>
                        {entry.publishedRevision ? (
                          <Tag>{`${t("editor:EDITOR_PAGES_PUBLISHED_REV")}: ${entry.publishedRevision}`}</Tag>
                        ) : (
                          <Tag color="default">{t("editor:EDITOR_BLOCK_STATUS_DRAFT_ONLY")}</Tag>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </div>
      </Card>

      <Modal
        title={t("editor:EDITOR_REUSABLE_BLOCKS_CREATE")}
        open={createOpen}
        okText={t("editor:EDITOR_REUSABLE_BLOCKS_CREATE_OK")}
        cancelText={t("editor:EDITOR_REUSABLE_BLOCKS_CREATE_CANCEL")}
        confirmLoading={createMutation.isPending}
        onOk={() => void onSubmitCreate()}
        onCancel={() => setCreateOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            label={t("editor:EDITOR_REUSABLE_BLOCKS_FORM_SLUG")}
            name="slug"
            rules={[
              {
                required: true,
                message: t("editor:EDITOR_REUSABLE_BLOCKS_FORM_SLUG_REQUIRED"),
              },
              { max: 256 },
            ]}
          >
            <Input placeholder={t("editor:EDITOR_REUSABLE_BLOCKS_FORM_SLUG_PLACEHOLDER")} />
          </Form.Item>
          <Form.Item
            label={t("editor:EDITOR_REUSABLE_BLOCKS_FORM_TITLE")}
            name="title"
            rules={[{ max: 256 }]}
          >
            <Input placeholder={t("editor:EDITOR_REUSABLE_BLOCKS_FORM_TITLE_PLACEHOLDER")} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
