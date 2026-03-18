import * as React from "react";
import { Plus } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

import { createContentItem } from "@/api/content";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import type { AdminContentItem } from "@/types/api";

const FALLBACK_SLUG_PREFIX = "content";

function buildSlug(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || `${FALLBACK_SLUG_PREFIX}-${Date.now().toString(36)}`;
}

export function ContentLibraryCreateDialog(props: {
  open: boolean;
  workspaceId: string | null;
  models: Array<{ key: string; name: string }>;
  onOpenChange: (open: boolean) => void;
  onCreated: (item: AdminContentItem) => void;
}) {
  const { t } = useTranslation(["common", "content"]);
  const [modelKey, setModelKey] = React.useState("");
  const [title, setTitle] = React.useState("");

  React.useEffect(() => {
    if (!props.open) return;
    if (props.models.length === 0) {
      setModelKey("");
      return;
    }
    setModelKey((current) =>
      props.models.some((model) => model.key === current) ? current : props.models[0]?.key || "",
    );
  }, [props.models, props.open]);

  React.useEffect(() => {
    if (props.open) return;
    setTitle("");
  }, [props.open]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!props.workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      if (!modelKey) throw new Error("CONTENT_MODEL_NOT_SELECTED");
      const nextTitle = title.trim();
      if (!nextTitle) throw new Error("CONTENT_TITLE_REQUIRED");
      return createContentItem(props.workspaceId, {
        modelKey,
        title: nextTitle,
        slug: buildSlug(nextTitle),
        status: "draft",
        visibility: "public",
      });
    },
    onSuccess: (item) => {
      notifySuccessText(t("content:CONTENT_LIBRARY_CREATE_SUCCESS"));
      props.onCreated(item);
      props.onOpenChange(false);
    },
    onError: (error) => notifyError(error),
  });

  const canCreate =
    Boolean(props.workspaceId) &&
    props.models.length > 0 &&
    Boolean(modelKey) &&
    title.trim().length > 0 &&
    !createMutation.isPending;

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("content:CONTENT_LIBRARY_CREATE_TITLE")}
      description={t("content:CONTENT_LIBRARY_CREATE_DESC")}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={createMutation.isPending}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            type="button"
            loading={createMutation.isPending}
            disabled={!canCreate}
            onClick={() => createMutation.mutate()}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("content:CONTENT_LIBRARY_ACTION_NEW_CONTENT")}
          </Button>
        </div>
      }
    >
      {props.models.length > 0 ? (
        <div className="grid gap-4 py-2">
          <label className="grid gap-1.5">
            <span className="text-callout font-semibold text-foreground">
              {t("content:CONTENT_LIBRARY_CREATE_FIELD_TYPE")}
            </span>
            <span className="text-footnote text-label-secondary">
              {t("content:CONTENT_LIBRARY_CREATE_FIELD_TYPE_HELP")}
            </span>
            <Select
              value={modelKey}
              onValueChange={setModelKey}
              disabled={createMutation.isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={t("content:CONTENT_LIBRARY_CREATE_FIELD_TYPE_PLACEHOLDER")}
                />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {props.models.map((model) => (
                  <SelectItem key={model.key} value={model.key}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-callout font-semibold text-foreground">
              {t("content:CONTENT_LIBRARY_CREATE_FIELD_TITLE")}
            </span>
            <span className="text-footnote text-label-secondary">
              {t("content:CONTENT_LIBRARY_CREATE_FIELD_TITLE_HELP")}
            </span>
            <Input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("content:CONTENT_LIBRARY_CREATE_FIELD_TITLE_PLACEHOLDER")}
              disabled={createMutation.isPending}
            />
          </label>
        </div>
      ) : (
        <div className="grid gap-1.5 py-2">
          <div className="text-callout font-semibold text-foreground">
            {t("content:CONTENT_LIBRARY_CREATE_MODEL_EMPTY_TITLE")}
          </div>
          <div className="text-footnote text-label-secondary">
            {t("content:CONTENT_LIBRARY_CREATE_MODEL_EMPTY_DESC")}
          </div>
        </div>
      )}
    </SettingDialog>
  );
}
