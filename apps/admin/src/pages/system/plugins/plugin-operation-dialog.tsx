import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SystemPluginCatalogItem, SystemPluginOperationKind } from "@/api/plugins";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { Button } from "@arclayer/ui/button";
import {
  AlertDialogCancel,
  AlertDialogAction,
} from "@arclayer/ui/radix-primitives/radix-alert-dialog";

export function PluginOperationDialog(props: {
  plugin: SystemPluginCatalogItem;
  kind: SystemPluginOperationKind | null;
  pending: boolean;
  error: Error | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<boolean>;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const addedPermissions = props.plugin.permissions.filter(
    (permission) => !props.plugin.approvedPermissions.includes(permission),
  );
  const requiresPermissionReview = props.kind === "install" || props.kind === "upgrade";
  const isDestructive = props.kind === "disable" || props.kind === "uninstall";

  return (
    <AlertDialog
      open={props.kind !== null}
      onOpenChange={(open) => {
        if (!props.pending) props.onOpenChange(open);
      }}
    >
      <AlertDialogContent className="sm:max-w-130">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {props.kind
              ? t(`settings:SETTINGS_SYSTEM_PLUGIN_OPERATION_${props.kind.toUpperCase()}_TITLE`)
              : null}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-body">
            {props.kind
              ? t(`settings:SETTINGS_SYSTEM_PLUGIN_OPERATION_${props.kind.toUpperCase()}_DESC`, {
                  name: props.plugin.name,
                })
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {requiresPermissionReview && addedPermissions.length ? (
          <div className="rounded-lg border border-warning/35 bg-warning/10 p-4">
            <div className="flex items-center gap-2 text-footnote font-medium text-label-primary">
              <ShieldAlert className="size-4 text-warning" aria-hidden="true" />
              {t("settings:SETTINGS_SYSTEM_PLUGIN_PERMISSION_REVIEW_TITLE")}
            </div>
            <p className="mt-2 text-footnote leading-6 text-label-secondary">
              {t("settings:SETTINGS_SYSTEM_PLUGIN_PERMISSION_REVIEW_DESC")}
            </p>
            <ul className="mt-3 space-y-1.5 font-mono text-caption text-label-primary">
              {addedPermissions.map((permission) => (
                <li key={permission}>{permission}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="rounded-lg border bg-muted/25 p-3 text-footnote leading-6 text-label-secondary">
          {t("settings:SETTINGS_SYSTEM_PLUGIN_RESTART_NOTICE")}
        </p>

        {props.error ? (
          <p role="alert" className="text-footnote text-destructive">
            {props.error.message}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={props.pending}>
              {t("common:CANCEL")}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant={isDestructive ? "destructive" : "default"}
              loading={props.pending}
              onClick={async (event) => {
                event.preventDefault();
                if (await props.onConfirm()) props.onOpenChange(false);
              }}
            >
              {props.kind
                ? t(`settings:SETTINGS_SYSTEM_PLUGIN_OPERATION_${props.kind.toUpperCase()}_CONFIRM`)
                : null}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
