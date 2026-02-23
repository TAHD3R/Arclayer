import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button, Input, Tag } from "antd";
import { ImageIcon, MoreVertical, Trash2, Upload } from "lucide-react";

import {
  deleteWorkspaceTheme,
  importWorkspaceTheme,
  listWorkspaceThemes,
  type WorkspaceThemeItem,
} from "@/api/workspace-themes";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export function WorkspaceThemesView() {
  const { t } = useTranslation(["appearance", "nav", "common"]);
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const [importOpen, setImportOpen] = useState(false);
  const [assetId, setAssetId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceThemeItem | null>(null);

  const queryKey = ["workspace", "themes", workspaceId] as const;

  const listQuery = useQuery({
    queryKey,
    enabled: Boolean(workspaceId),
    queryFn: () => listWorkspaceThemes(String(workspaceId)),
    staleTime: 15_000,
  });

  const importMutation = useMutation({
    mutationFn: () => importWorkspaceTheme(String(workspaceId), assetId.trim()),
    onSuccess: async () => {
      notifySuccessText(t("appearance:THEME_CENTER_IMPORT_SUCCESS"));
      setImportOpen(false);
      setAssetId("");
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: notifyError,
  });

  const deleteMutation = useMutation({
    mutationFn: (theme: WorkspaceThemeItem) =>
      deleteWorkspaceTheme(String(workspaceId), theme.themeId, theme.version),
    onSuccess: async () => {
      notifySuccessText(t("appearance:THEME_CENTER_DELETE_SUCCESS"));
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: notifyError,
  });

  const items = listQuery.data?.items ?? [];

  return (
    <DefaultPage
      title={t("nav:NAV_APPEARANCE_THEMES")}
      description={t("appearance:THEME_CENTER_DESC")}
      action={
        <Button
          type="primary"
          icon={<Upload className="size-4" />}
          onClick={() => setImportOpen(true)}
        >
          {t("appearance:THEME_CENTER_ACTION_IMPORT")}
        </Button>
      }
    >
      <PageState
        loading={listQuery.isLoading && !listQuery.data}
        loadingVariant="masonry"
        error={listQuery.isError ? listQuery.error : null}
        onRetry={listQuery.isError ? () => void listQuery.refetch() : undefined}
        empty={!listQuery.isLoading && items.length === 0}
        emptyDescription={t("appearance:THEME_CENTER_EMPTY")}
      >
        <ThemeCardGrid items={items} onDelete={setDeleteTarget} t={t} />
      </PageState>

      {/* Import dialog */}
      <ImportThemeDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        assetId={assetId}
        onAssetIdChange={setAssetId}
        loading={importMutation.isPending}
        onConfirm={() => importMutation.mutate()}
        t={t}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("appearance:THEME_CENTER_DELETE_CONFIRM_TITLE")}
        description={t("appearance:THEME_CENTER_DELETE_CONFIRM_DESC", {
          name: deleteTarget?.name || deleteTarget?.themeId || "",
        })}
        cancelText={t("common:CANCEL")}
        confirmText={t("common:CONFIRM")}
        danger
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          if (deleteTarget) await deleteMutation.mutateAsync(deleteTarget);
        }}
      />
    </DefaultPage>
  );
}

// -- Sub-components ----------------------------------------------------------

type ThemeCardGridProps = {
  items: WorkspaceThemeItem[];
  onDelete: (theme: WorkspaceThemeItem) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

function ThemeCardGrid({ items, onDelete, t }: ThemeCardGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((theme) => (
        <ThemeCard
          key={`${theme.themeId}@${theme.version}`}
          theme={theme}
          onDelete={onDelete}
          t={t}
        />
      ))}
    </div>
  );
}

type ThemeCardProps = {
  theme: WorkspaceThemeItem;
  onDelete: (theme: WorkspaceThemeItem) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

function ThemeCard({ theme, onDelete, t }: ThemeCardProps) {
  const displayName = theme.name || theme.themeId;
  const hasPresets = Boolean(theme.presets && Object.keys(theme.presets).length > 0);
  const hasVariants = Boolean(theme.variants && Object.keys(theme.variants).length > 0);

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
      {/* Preview area */}
      <div className="flex h-28 items-center justify-center rounded-md bg-muted">
        <ImageIcon className="size-8 text-muted-foreground" />
        <span className="ml-2 text-xs text-muted-foreground">
          {t("appearance:THEME_CENTER_NO_PREVIEW")}
        </span>
      </div>

      {/* Info row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{theme.themeId}</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="text" icon={<MoreVertical className="size-4" />} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(theme)}>
              <Trash2 />
              {t("appearance:THEME_CENTER_ACTION_DELETE")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        <Tag>{theme.version}</Tag>
        {hasPresets && <Tag color="blue">presets</Tag>}
        {hasVariants && <Tag color="purple">variants</Tag>}
      </div>

      {/* Description */}
      {theme.description ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">{theme.description}</p>
      ) : null}
    </div>
  );
}

type ImportThemeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  onAssetIdChange: (v: string) => void;
  loading: boolean;
  onConfirm: () => void;
  t: (key: string) => string;
};

function ImportThemeDialog({
  open,
  onOpenChange,
  assetId,
  onAssetIdChange,
  loading,
  onConfirm,
  t,
}: ImportThemeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("appearance:THEME_CENTER_IMPORT_TITLE")}</DialogTitle>
          <DialogDescription>{t("appearance:THEME_CENTER_IMPORT_DESC")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          <label className="text-sm font-medium">
            {t("appearance:THEME_CENTER_IMPORT_ASSET_ID")}
          </label>
          <Input
            value={assetId}
            onChange={(e) => onAssetIdChange(e.target.value)}
            placeholder={t("appearance:THEME_CENTER_IMPORT_ASSET_ID_PLACEHOLDER")}
            disabled={loading}
          />
        </div>

        <DialogFooter>
          <Button type="text" onClick={() => onOpenChange(false)} disabled={loading}>
            {t("common:CANCEL")}
          </Button>
          <Button type="primary" loading={loading} disabled={!assetId.trim()} onClick={onConfirm}>
            {t("appearance:THEME_CENTER_ACTION_IMPORT")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
