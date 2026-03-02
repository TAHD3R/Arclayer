import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Card, Form, Input, List, Modal, Space, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createWorkspacePage, listWorkspacePagesTree } from "@/api/pages";
import type { WorkspacePageCreateIn, WorkspacePageTreeNode } from "@/types/api";

export const Route = createFileRoute("/w/$workspaceId/")({
  component: WorkspacePagesHome,
});

type FlatNode = {
  node: WorkspacePageTreeNode;
  depth: number;
};

function flattenTree(nodes: WorkspacePageTreeNode[], depth = 0): FlatNode[] {
  const out: FlatNode[] = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.children?.length) out.push(...flattenTree(n.children, depth + 1));
  }
  return out;
}

function WorkspacePagesHome() {
  const { t } = useTranslation(["editor"]);
  const { workspaceId } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["workspace", workspaceId, "content", "pages", "tree"],
    queryFn: () => listWorkspacePagesTree(workspaceId),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<WorkspacePageCreateIn>();

  const createMutation = useMutation({
    mutationFn: (payload: WorkspacePageCreateIn) => createWorkspacePage(workspaceId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["workspace", workspaceId, "content", "pages", "tree"],
      });
      setCreateOpen(false);
      form.resetFields();
    },
  });

  const flatItems = useMemo(() => flattenTree(data?.items ?? []), [data?.items]);

  const onSubmitCreate = async () => {
    const values = await form.validateFields();
    const path = (values.path || "").trim();
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    await createMutation.mutateAsync({
      ...values,
      path: normalizedPath,
    });
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Typography.Title level={3} className="!mb-1">
              {t("editor:EDITOR_PAGES_TITLE")}
            </Typography.Title>
            <Typography.Paragraph className="!mb-0 text-muted-foreground">
              {t("editor:EDITOR_PAGES_DESC")}
            </Typography.Paragraph>
          </div>
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            {t("editor:EDITOR_PAGES_CREATE")}
          </Button>
        </div>

        <div className="mt-4">
          {error ? (
            <Typography.Text type="danger">{String(error)}</Typography.Text>
          ) : (
            <List
              loading={isLoading}
              dataSource={flatItems}
              locale={{ emptyText: t("editor:EDITOR_PAGES_EMPTY") }}
              renderItem={({ node, depth }) => (
                <List.Item
                  actions={[
                    <Link
                      key="open"
                      to="/w/$workspaceId/pages/$pageId/"
                      params={{ workspaceId, pageId: node.id }}
                    >
                      <Button>{t("editor:EDITOR_PAGES_OPEN")}</Button>
                    </Link>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space size={8}>
                        <span style={{ paddingLeft: depth * 14 }}>
                          {node.title || t("editor:EDITOR_PAGES_UNTITLED")}
                        </span>
                        <Typography.Text type="secondary">{node.path}</Typography.Text>
                      </Space>
                    }
                    description={
                      <Space size={8} wrap>
                        <Tag color={node.visibility === "public" ? "green" : "default"}>
                          {node.visibility}
                        </Tag>
                        <Tag>{`${t("editor:EDITOR_PAGES_DRAFT_REV")}: ${node.draftRevision}`}</Tag>
                        {node.publishedRevision ? (
                          <Tag>{`${t("editor:EDITOR_PAGES_PUBLISHED_REV")}: ${node.publishedRevision}`}</Tag>
                        ) : null}
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
        title={t("editor:EDITOR_PAGES_CREATE")}
        open={createOpen}
        okText={t("editor:EDITOR_PAGES_CREATE_OK")}
        cancelText={t("editor:EDITOR_PAGES_CREATE_CANCEL")}
        confirmLoading={createMutation.isPending}
        onOk={() => void onSubmitCreate()}
        onCancel={() => setCreateOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            label={t("editor:EDITOR_PAGES_FORM_PATH")}
            name="path"
            rules={[
              { required: true, message: t("editor:EDITOR_PAGES_FORM_PATH_REQUIRED") },
              { max: 200 },
            ]}
          >
            <Input placeholder="/about" />
          </Form.Item>
          <Form.Item
            label={t("editor:EDITOR_PAGES_FORM_TITLE")}
            name="title"
            rules={[{ max: 256 }]}
          >
            <Input placeholder={t("editor:EDITOR_PAGES_FORM_TITLE_PLACEHOLDER")} />
          </Form.Item>
          <Form.Item
            label={t("editor:EDITOR_PAGES_FORM_DESC")}
            name="description"
            rules={[{ max: 1024 }]}
          >
            <Input.TextArea rows={3} placeholder={t("editor:EDITOR_PAGES_FORM_DESC_PLACEHOLDER")} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
