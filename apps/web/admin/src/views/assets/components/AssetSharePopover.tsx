import { Button, Divider, Input, InputNumber, Select, Switch, Tag } from "antd";
import { Copy, ExternalLink, Link2, Plus, Share2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAdminAssetShareLink,
  listAdminAssetShareLinks,
  revokeAdminShareLink,
  type AdminShareLink,
} from "@/api/shares";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/animate-ui/components/radix/popover";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/utils/clipboard";
import { notifyError, notifyErrorText, notifySuccessText } from "@/utils/notifications";
import { toShareableAbsoluteUrl } from "@/views/assets/utils/assetUrls";

type ExpireUnit = "minutes" | "hours" | "days";

function toExpiresInSeconds(value: number, unit: ExpireUnit): number {
  const v = Math.max(0, Math.floor(value));
  if (unit === "minutes") return v * 60;
  if (unit === "hours") return v * 3600;
  return v * 86400;
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= Date.now();
}

function formatIsoDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function resolveShareUrl(link: AdminShareLink): string {
  // 后端返回的是 path（/s/<token>），这里统一转成可复制/可访问的绝对 URL。
  return toShareableAbsoluteUrl(link.previewUrlPath);
}

export function AssetSharePopover(props: {
  assetId: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [permanent, setPermanent] = useState(true);
  const [expireValue, setExpireValue] = useState<number>(7);
  const [expireUnit, setExpireUnit] = useState<ExpireUnit>("days");

  const linksQuery = useQuery({
    queryKey: ["assets", "shareLinks", props.assetId],
    queryFn: async () => listAdminAssetShareLinks({ assetId: props.assetId, page: 1, size: 50 }),
    enabled: open && Boolean(props.assetId),
    staleTime: 5 * 1000,
    retry: 1,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const expiresInSeconds = permanent ? null : toExpiresInSeconds(expireValue, expireUnit);
      return createAdminAssetShareLink({
        assetId: props.assetId,
        payload: { expiresInSeconds },
      });
    },
    onSuccess: () => {
      notifySuccessText(t("assets:ASSET_SHARE_LINK_CREATED"));
      queryClient.invalidateQueries({ queryKey: ["assets", "shareLinks", props.assetId] });
    },
    onError: (err) => {
      notifyError(err);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (linkId: string) => revokeAdminShareLink(linkId),
    onSuccess: () => {
      notifySuccessText(t("assets:ASSET_SHARE_LINK_REVOKED"));
      queryClient.invalidateQueries({ queryKey: ["assets", "shareLinks", props.assetId] });
    },
    onError: (err) => {
      notifyError(err);
    },
  });

  const rows = useMemo(() => {
    // revoked 链接对用户没有价值：不展示在列表中（仍然可通过 API 审计/查询）。
    const raw = (linksQuery.data?.items || []).filter((x) => !x.revokedAt);
    // 新的在前，方便用户复制最新生成的链接。
    return raw.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
      return tb - ta;
    });
  }, [linksQuery.data]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="text"
          icon={<Share2 size={16} />}
          className={cn(props.triggerClassName)}
          disabled={props.disabled}
          onClick={(e) => {
            // 避免触发 Sheet 的父级 click（例如点击空白关闭/打开）。
            e.stopPropagation();
          }}
        >
          {t("assets:ASSET_ACTION_SHARE")}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className={cn("w-[440px] max-w-[calc(100vw-2rem)] p-0", props.className)}
        onInteractOutside={(e) => {
          // antd Select 的 dropdown 默认渲染在 body（Portal），Radix 会把点击视为“外部交互”并关闭 Popover，
          // 导致“无法选择 minutes/days”这类问题。这里对 antd dropdown 做一次白名单处理。
          const target = e.target as HTMLElement | null;
          if (!target) return;
          if (target.closest(".ant-select-dropdown")) {
            e.preventDefault();
          }
        }}
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{t("assets:ASSET_SHARE_POPOVER_TITLE")}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {t("assets:ASSET_SHARE_POPOVER_DESC")}
              </div>
            </div>
            <Button
              type="primary"
              icon={<Plus size={16} />}
              loading={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {t("assets:ASSET_SHARE_CREATE")}
            </Button>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">{t("assets:ASSET_SHARE_PERMANENT")}</div>
              <Switch checked={permanent} onChange={setPermanent} />
            </div>

            {!permanent ? (
              <div className="mt-3 flex items-center gap-2">
                <div className="text-sm text-muted-foreground shrink-0">
                  {t("assets:ASSET_SHARE_EXPIRES_IN")}
                </div>
                <InputNumber
                  min={1}
                  max={365 * 24 * 60}
                  value={expireValue}
                  onChange={(v) => setExpireValue(typeof v === "number" ? v : 1)}
                />
                <Select
                  value={expireUnit}
                  style={{ width: 140 }}
                  onChange={(v) => setExpireUnit(v)}
                  // 默认 Portal 到 body 在 Radix Popover 里会被当成 “outside”，导致无法选择。
                  // 这里显式把 dropdown 挂在当前触发节点附近，避免关闭/遮挡问题。
                  getPopupContainer={(triggerNode) => triggerNode.parentElement ?? document.body}
                  options={[
                    { value: "minutes", label: t("assets:ASSET_SHARE_UNIT_MINUTES") },
                    { value: "hours", label: t("assets:ASSET_SHARE_UNIT_HOURS") },
                    { value: "days", label: t("assets:ASSET_SHARE_UNIT_DAYS") },
                  ]}
                />
              </div>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground">
                {t("assets:ASSET_SHARE_PERMANENT_DESC")}
              </div>
            )}
          </div>

          <Divider className="my-4" />

          <div className="font-medium">{t("assets:ASSET_SHARE_LINKS_TITLE")}</div>
          <div className="mt-2">
            {linksQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">{t("assets:ASSET_SHARE_LOADING")}</div>
            ) : rows.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {t("assets:ASSET_SHARE_LINKS_EMPTY")}
              </div>
            ) : (
              <div
                className="max-h-80 overflow-y-auto overscroll-contain space-y-2 pr-1"
                onWheelCapture={(e) => {
                  // 在 Sheet / 页面滚动容器内，优先保证列表能滚动，不要把滚轮事件冒泡走。
                  e.stopPropagation();
                }}
              >
                {rows.map((link) => {
                  const url = resolveShareUrl(link);
                  const expired = isExpired(link.expiresAt ?? null);

                  return (
                    <div key={link.id} className="w-full bg-background">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {expired ? (
                            <Tag color="warning">{t("assets:ASSET_SHARE_STATUS_EXPIRED")}</Tag>
                          ) : (
                            <Tag color="success">{t("assets:ASSET_SHARE_STATUS_ACTIVE")}</Tag>
                          )}
                        </div>

                        <div className="shrink-0 flex items-center gap-1">
                          <Button
                            size="small"
                            type="text"
                            icon={<ExternalLink className="size-4" />}
                            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                          />
                          <Button
                            size="small"
                            type="text"
                            icon={<Copy className="size-4" />}
                            onClick={() => {
                              copyToClipboard(url)
                                .then(() => notifySuccessText(t("assets:ASSET_LINK_COPIED")))
                                .catch(() => notifyErrorText(t("assets:ASSET_COPY_LINK_FAILED")));
                            }}
                          />
                          <Button
                            size="small"
                            type="text"
                            icon={<Trash2 className="size-4" />}
                            loading={revokeMutation.isPending}
                            onClick={() => revokeMutation.mutate(link.id)}
                          />
                        </div>
                      </div>

                      <div className="mt-2 w-full">
                        <Input
                          readOnly
                          value={url}
                          className="w-full"
                          prefix={<Link2 className="size-4 text-muted-foreground" />}
                        />
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <div>
                          {t("assets:ASSET_SHARE_CREATED_AT")}: {formatIsoDateTime(link.createdAt)}
                        </div>
                        <div>
                          {t("assets:ASSET_SHARE_EXPIRES_AT")}:{" "}
                          {link.expiresAt
                            ? formatIsoDateTime(link.expiresAt)
                            : t("assets:ASSET_SHARE_NEVER_EXPIRES")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
