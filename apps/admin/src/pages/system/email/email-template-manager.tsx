import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, PencilLine, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

import {
  deleteMailTemplate,
  listMailTemplates,
  MAIL_TEMPLATES_QUERY_KEY,
  type MailTemplate,
} from "@/api/mail";
import { BaseTag } from "@/components/ui/tags";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { SystemSettingItem } from "@/pages/system/components/system-setting-item";
import { EmailTemplateEditorDialog } from "@/pages/system/email/email-template-editor-dialog";

function TemplateRow(props: {
  template: MailTemplate;
  pending: boolean;
  onEdit: (template: MailTemplate) => void;
  onDelete: (template: MailTemplate) => void;
}) {
  const { t } = useTranslation(["settings"]);
  const { template } = props;

  return (
    <div className="grid min-w-0 gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-callout font-semibold text-label-primary">
            {template.name}
          </span>
          <BaseTag color={template.isEnabled ? "green" : "default"} textStyle="footnote">
            {template.isEnabled
              ? t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ENABLED_STATUS")
              : t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DISABLED_STATUS")}
          </BaseTag>
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-footnote text-label-secondary">
          <span className="truncate font-mono">{template.key}</span>
          <span>{template.locale}</span>
          <span>
            {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_VERSION", {
              version: template.version,
            })}
          </span>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={props.pending}
        onClick={() => props.onEdit(template)}
      >
        <PencilLine className="size-4" />
        {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_EDIT_ACTION")}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={props.pending}
            aria-label={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ACTIONS_LABEL")}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuIconItem
              icon={<PencilLine className="size-4" />}
              onSelect={() => props.onEdit(template)}
            >
              {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_EDIT_ACTION")}
            </DropdownMenuIconItem>
            <DropdownMenuSeparator />
            <DropdownMenuIconItem
              icon={<Trash2 className="size-4" />}
              variant="destructive"
              onSelect={() => props.onDelete(template)}
            >
              {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DELETE_ACTION")}
            </DropdownMenuIconItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function EmailTemplateManager() {
  const { t } = useTranslation(["settings"]);
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MailTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MailTemplate | null>(null);
  const templatesQuery = useQuery({
    queryKey: MAIL_TEMPLATES_QUERY_KEY,
    queryFn: ({ signal }) => listMailTemplates(signal),
    retry: false,
  });
  const deleteMutation = useMutation({
    mutationFn: (templateId: string) => deleteMailTemplate(templateId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MAIL_TEMPLATES_QUERY_KEY });
      notifySuccessText(t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DELETED"));
    },
    onError: notifyError,
  });

  const openCreate = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };
  const openEdit = (template: MailTemplate) => {
    setEditingTemplate(template);
    setEditorOpen(true);
  };
  const refreshTemplates = async () => {
    await queryClient.invalidateQueries({ queryKey: MAIL_TEMPLATES_QUERY_KEY });
  };

  return (
    <>
      <SystemSettingItem
        id="email-templates"
        title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_DESC")}
        headerAction={
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_CREATE_ACTION")}
          </Button>
        }
        contentClassName="p-0"
      >
        {templatesQuery.isLoading ? (
          <div className="px-4 py-8 text-center text-body text-label-secondary" role="status">
            {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_LOADING")}
          </div>
        ) : templatesQuery.error ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <p className="text-body text-label-secondary">
              {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_LOAD_ERROR")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => templatesQuery.refetch()}
            >
              {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_RETRY")}
            </Button>
          </div>
        ) : templatesQuery.data?.length ? (
          <div className="divide-y">
            {templatesQuery.data.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                pending={deleteMutation.isPending}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <p className="max-w-md text-body text-label-secondary">
              {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_EMPTY")}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={openCreate}>
              <Plus className="size-4" />
              {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_CREATE_ACTION")}
            </Button>
          </div>
        )}
      </SystemSettingItem>

      <EmailTemplateEditorDialog
        open={editorOpen}
        template={editingTemplate}
        onOpenChange={setEditorOpen}
        onSaved={refreshTemplates}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-130">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DELETE_TITLE")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-body">
              {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DELETE_DESC", {
                name: deleteTarget?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline" disabled={deleteMutation.isPending}>
                {t("settings:SETTINGS_CANCEL")}
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="button"
                variant="destructive"
                loading={deleteMutation.isPending}
                onClick={async () => {
                  if (!deleteTarget) return;
                  await deleteMutation.mutateAsync(deleteTarget.id);
                  setDeleteTarget(null);
                }}
              >
                {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DELETE_CONFIRM")}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
