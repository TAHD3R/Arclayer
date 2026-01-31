import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Card, List, Segmented, Space, Typography } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/api/notifications";
import { DefaultPage } from "@/components/app/defaultPage";
import { formatRelativeTime } from "@/lib/time/relativeTime";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});

type ListStatus = "unread" | "all";

function NotificationsPage() {
  const { t, i18n } = useTranslation("notifications");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<ListStatus>("unread");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const listQuery = useQuery({
    queryKey: ["notifications", "list", status, page, pageSize],
    queryFn: async () =>
      listNotifications({
        status,
        page,
        size: pageSize,
      }),
    staleTime: 10 * 1000,
    meta: { silent: true },
  });

  const items = useMemo(() => listQuery.data?.items ?? [], [listQuery.data?.items]);
  const total = listQuery.data?.total ?? 0;

  const markRead = async (n: NotificationItem) => {
    await markNotificationRead(n.id);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications", "preview"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications", "list"] }),
    ]);
  };

  const markAllRead = async () => {
    await markAllNotificationsRead();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications", "preview"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications", "list"] }),
    ]);
  };

  return (
    <DefaultPage
      title={t("NOTIFICATIONS_PAGE_TITLE")}
      description={t("NOTIFICATIONS_PAGE_DESC")}
      action={
        status === "unread" ? (
          <Button
            type="primary"
            disabled={!items.length || listQuery.isFetching}
            loading={listQuery.isFetching && !listQuery.isRefetching}
            onClick={() => void markAllRead()}
          >
            {t("NOTIFICATIONS_MARK_ALL_AS_READ")}
          </Button>
        ) : null
      }
      extra={
        <Segmented<ListStatus>
          value={status}
          options={[
            { label: t("NOTIFICATIONS_TAB_UNREAD"), value: "unread" },
            { label: t("NOTIFICATIONS_TAB_ALL"), value: "all" },
          ]}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      }
    >
      <Card>
        <List
          dataSource={items}
          loading={listQuery.isLoading}
          renderItem={(n) => (
            <List.Item
              style={{ cursor: "pointer" }}
              onClick={() => {
                void markRead(n).finally(() => {
                  void navigate({ to: n.targetTo as never });
                });
              }}
              actions={[
                <Button
                  key="read"
                  type="text"
                  onClick={(e) => {
                    e.stopPropagation();
                    void markRead(n);
                  }}
                >
                  {t("NOTIFICATIONS_MARK_AS_READ")}
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={8}>
                    <Typography.Text strong ellipsis style={{ maxWidth: 520 }}>
                      {n.title}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      {formatRelativeTime(n.createdAt, i18n.language)}
                    </Typography.Text>
                  </Space>
                }
                description={n.body ? <Typography.Text>{n.body}</Typography.Text> : null}
              />
            </List.Item>
          )}
        />

        {total > pageSize ? (
          <div className="pt-4 flex justify-end">
            <Space>
              <Button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                {t("NOTIFICATIONS_PAGE_PREV")}
              </Button>
              <Typography.Text type="secondary">
                {t("NOTIFICATIONS_PAGE_PAGINATION", { page, pages: listQuery.data?.pages ?? 1 })}
              </Typography.Text>
              <Button
                disabled={page >= (listQuery.data?.pages ?? 1)}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("NOTIFICATIONS_PAGE_NEXT")}
              </Button>
            </Space>
          </div>
        ) : null}
      </Card>
    </DefaultPage>
  );
}
