import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import type { AdminUIExtension } from "@/types/api";
import { listAdminUIExtensions } from "@/api/admin-extensions";
import { Button } from "@celestial/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@celestial/ui/card";
import { notifyInfoText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export type AdminExtensionsSlotProps = {
  slot: string;
  title?: string;
};

type _TFunction = (key: string, options?: { defaultValue?: string }) => string;

function buildLabel(ext: AdminUIExtension, t: _TFunction): string {
  if (ext.titleI18n) return t(ext.titleI18n, { defaultValue: ext.title || ext.id });
  return ext.title || ext.id;
}

export function AdminExtensionsSlot(props: AdminExtensionsSlotProps) {
  const { t } = useTranslation(["common"]);
  const navigate = useNavigate();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const query = useQuery({
    queryKey: ["workspace", "adminExtensions", workspaceId, props.slot],
    enabled: Boolean(workspaceId && props.slot),
    queryFn: async () => listAdminUIExtensions(String(workspaceId), { slot: props.slot }),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const items = query.data ?? [];
  if (!items.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-title4">{props.title || t("common:EXTENSIONS")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.map((ext) => {
          const label = buildLabel(ext, t);
          const kind = String(ext.kind || "action");
          const meta = ext.meta ?? {};

          if (kind === "link") {
            const to = typeof meta.to === "string" ? meta.to : null;
            return (
              <Button
                key={`${ext.pluginId}:${ext.id}`}
                variant="outline"
                className="w-full justify-start"
                disabled={!to}
                onClick={() => {
                  if (!to) return;
                  if (/^https?:\/\//.test(to)) {
                    window.open(to, "_blank", "noopener,noreferrer");
                    return;
                  }
                  void navigate({ to: to as never });
                }}
              >
                {label}
              </Button>
            );
          }

          return (
            <Button
              key={`${ext.pluginId}:${ext.id}`}
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                notifyInfoText(label);
              }}
            >
              {label}
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
