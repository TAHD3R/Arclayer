import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Card, List, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { listMyWorkspaces } from "@/api/workspaces";
import { STORAGE_KEYS } from "@/constants/storage";

export const Route = createFileRoute("/")({
  component: WorkspaceSelectPage,
});

function WorkspaceSelectPage() {
  const { t } = useTranslation(["editor"]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["me", "workspaces"],
    queryFn: listMyWorkspaces,
  });

  const items = data?.items ?? [];

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <Typography.Title level={3} className="!mb-1">
          {t("editor:EDITOR_WORKSPACE_SELECT_TITLE")}
        </Typography.Title>
        <Typography.Paragraph className="!mb-4 text-label-secondary">
          {t("editor:EDITOR_WORKSPACE_SELECT_DESC")}
        </Typography.Paragraph>

        {error ? (
          <Typography.Text type="danger">{String(error)}</Typography.Text>
        ) : (
          <List
            loading={isLoading}
            dataSource={items}
            renderItem={(ws) => (
              <List.Item
                actions={[
                  <Link
                    key="open"
                    to="/w/$workspaceId/"
                    params={{ workspaceId: ws.workspaceId }}
                    onClick={() => {
                      try {
                        window.localStorage.setItem(STORAGE_KEYS.lastWorkspaceId, ws.workspaceId);
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    <Button type="primary">{t("editor:EDITOR_WORKSPACE_OPEN")}</Button>
                  </Link>,
                ]}
              >
                <List.Item.Meta title={ws.name} description={ws.slug} />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
}
