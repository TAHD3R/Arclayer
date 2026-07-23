import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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
  DataTableToolbarTools,
  useDataTable,
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
} from "@arclayer/ui/data-table";

import {
  deleteMailTemplate,
  getMailTemplate,
  listMailTemplates,
  MAIL_TEMPLATES_QUERY_KEY,
  previewMailTemplate,
  restoreDefaultMailTemplate,
  type MailTemplate,
  type MailTemplateFilters,
  type MailTemplateGroup,
  type MailTemplateOrdering,
  updateMailTemplate,
} from "@/api/mail";
import { DataPaginationControls } from "@/components/common/data-pagination-controls";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { SystemSettingItem } from "@/pages/system/components/system-setting-item";
import { EmailTemplateEditorDialog } from "@/pages/system/email/email-template-editor-dialog";
import { EmailTemplateFilterPopover } from "@/pages/system/email/email-template-filter-popover";
import { EmailTemplateHistoryDrawer } from "@/pages/system/email/email-template-history-drawer";
import { EmailTemplatePreviewDialog } from "@/pages/system/email/email-template-preview-dialog";
import { EmailTemplateTestSendDialog } from "@/pages/system/email/email-template-test-send-dialog";
import {
  buildEmailTemplateColumns,
  type EmailTemplateTableActions,
} from "@/pages/system/email/email-template-table-columns";

type TemplateLocale = MailTemplateGroup["locales"][number];
type EditorMode = "create" | "edit" | "add-locale" | "duplicate";

type EditorState = {
  open: boolean;
  mode: EditorMode;
  template: MailTemplate | null;
};

type DeleteTarget = {
  id: string;
  name: string;
  locale: string;
  version: number;
};

const TABLE_ID = "system-email-templates";
const DETAIL_QUERY_KEY = [...MAIL_TEMPLATES_QUERY_KEY, "detail"] as const;

export function EmailTemplateManager() {
  const { t, i18n } = useTranslation(["settings", "common", "account"]);
  const queryClient = useQueryClient();
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const [filters, setFilters] = useState<MailTemplateFilters>({});
  const [ordering, setOrdering] = useState<MailTemplateOrdering>("key");
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>({
    open: false,
    mode: "create",
    template: null,
  });
  const [previewState, setPreviewState] = useState<{
    template: MailTemplate | null;
    output: Awaited<ReturnType<typeof previewMailTemplate>> | null;
  }>({ template: null, output: null });
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [historyGroup, setHistoryGroup] = useState<MailTemplateGroup | null>(null);
  const [testSendTemplate, setTestSendTemplate] = useState<MailTemplate | null>(null);

  const reconcileTemplates = useCallback(
    async (templateId?: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dataTable", TABLE_ID] }),
        queryClient.invalidateQueries({ queryKey: MAIL_TEMPLATES_QUERY_KEY }),
        templateId
          ? queryClient.invalidateQueries({ queryKey: [...DETAIL_QUERY_KEY, templateId] })
          : Promise.resolve(),
      ]);
    },
    [queryClient],
  );

  const toggleMutation = useMutation({
    mutationFn: (locale: TemplateLocale) =>
      updateMailTemplate(locale.id, {
        expectedVersion: locale.version,
        isEnabled: !locale.isEnabled,
      }),
    onSuccess: async (template) => {
      await reconcileTemplates(template.id);
      notifySuccessText(t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_STATUS_UPDATED"));
    },
    onError: notifyError,
  });
  const restoreMutation = useMutation({
    mutationFn: (locale: TemplateLocale) => restoreDefaultMailTemplate(locale.id, locale.version),
    onSuccess: async (template) => {
      await reconcileTemplates(template.id);
      notifySuccessText(t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_RESTORED"));
    },
    onError: notifyError,
  });
  const deleteMutation = useMutation({
    mutationFn: (target: DeleteTarget) => deleteMailTemplate(target.id, target.version),
    onSuccess: async (_result, target) => {
      await reconcileTemplates(target.id);
      setDeleteTarget(null);
      notifySuccessText(t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DELETED"));
    },
    onError: notifyError,
  });

  const loadTemplate = useCallback(
    async (locale: TemplateLocale): Promise<MailTemplate | null> => {
      setLoadingTemplateId(locale.id);
      try {
        return await queryClient.fetchQuery({
          queryKey: [...DETAIL_QUERY_KEY, locale.id],
          queryFn: () => getMailTemplate(locale.id),
          staleTime: 30_000,
        });
      } catch (error) {
        notifyError(error);
        return null;
      } finally {
        setLoadingTemplateId(null);
      }
    },
    [queryClient],
  );

  const openEditorForLocale = useCallback(
    async (mode: Exclude<EditorMode, "create">, locale: TemplateLocale) => {
      const template = await loadTemplate(locale);
      if (!template) return;
      setEditor({ open: true, mode, template });
    },
    [loadTemplate],
  );

  const reloadEditorTemplate = useCallback(async () => {
    const templateId = editor.template?.id;
    if (!templateId) return;
    await queryClient.invalidateQueries({ queryKey: [...DETAIL_QUERY_KEY, templateId] });
    const template = await queryClient.fetchQuery({
      queryKey: [...DETAIL_QUERY_KEY, templateId],
      queryFn: () => getMailTemplate(templateId),
    });
    setEditor((current) => ({ ...current, template }));
  }, [editor.template?.id, queryClient]);

  const openPreview = useCallback(
    async (locale: TemplateLocale) => {
      const template = await loadTemplate(locale);
      if (!template) return;
      try {
        const output = await previewMailTemplate({
          subjectTemplate: template.subjectTemplate,
          htmlTemplate: template.htmlTemplate,
          textTemplate: template.textTemplate,
          variables: Object.fromEntries(
            template.variables.map((variable) => [variable, `${variable} sample`]),
          ),
        });
        setPreviewState({ template, output });
      } catch (error) {
        notifyError(error);
      }
    },
    [loadTemplate],
  );

  const openTestSend = useCallback(
    async (locale: TemplateLocale) => {
      const template = await loadTemplate(locale);
      if (template) setTestSendTemplate(template);
    },
    [loadTemplate],
  );

  const preferredLocale = useCallback(
    (group: MailTemplateGroup) => {
      const current = i18n.resolvedLanguage ?? i18n.language;
      const locale =
        group.locales.find((locale) => locale.locale === current) ??
        group.locales.find((locale) => locale.locale === group.fallbackLocale) ??
        group.locales[0];
      if (!locale) throw new Error("MAIL_TEMPLATE_LOCALES_EMPTY");
      return locale;
    },
    [i18n.language, i18n.resolvedLanguage],
  );

  const pendingId =
    loadingTemplateId ??
    (toggleMutation.isPending ? toggleMutation.variables?.id : null) ??
    (restoreMutation.isPending ? restoreMutation.variables?.id : null) ??
    (deleteMutation.isPending ? deleteTarget?.id : null) ??
    null;
  const tableActions = useMemo<EmailTemplateTableActions>(
    () => ({
      preferredLocale,
      onEdit: (locale) => void openEditorForLocale("edit", locale),
      onPreview: (locale) => void openPreview(locale),
      onTestSend: (locale) => void openTestSend(locale),
      onAddLanguage: (locale) => void openEditorForLocale("add-locale", locale),
      onDuplicate: (locale) => void openEditorForLocale("duplicate", locale),
      onHistory: setHistoryGroup,
      onToggle: (locale) => toggleMutation.mutate(locale),
      onRestore: (locale) => restoreMutation.mutate(locale),
      onDelete: (group, locale) =>
        setDeleteTarget({
          id: locale.id,
          name: group.name,
          locale: locale.locale,
          version: locale.version,
        }),
      pendingId,
    }),
    [
      openEditorForLocale,
      openPreview,
      openTestSend,
      pendingId,
      preferredLocale,
      restoreMutation,
      toggleMutation,
    ],
  );
  const columns = useMemo(
    () =>
      buildEmailTemplateColumns({
        t,
        formatDateTime: dateTime.formatDateTime,
        actions: tableActions,
      }),
    [dateTime.formatDateTime, t, tableActions],
  );
  const tableHook = useDataTable<MailTemplateGroup, MailTemplateFilters>({
    tableId: TABLE_ID,
    columns,
    initialState: { pageSize: 20 },
    orderingOverride: ordering,
    extraQuery: filters,
    fetcher: (params) => listMailTemplates(params),
    queryOptions: { retry: false, staleTime: 30_000, meta: { silent: true } },
  });
  const [rowHeight, setRowHeight] = useDataTableRowHeightPreference({ tableId: TABLE_ID });
  const [wrapHeaders, setWrapHeaders] = useDataTableWrapHeadersPreference({ tableId: TABLE_ID });
  const toolsLabels = useMemo(() => buildDataTableToolsLabels(t), [t]);
  const hasActiveCriteria =
    tableHook.searchInput.trim().length > 0 || Object.keys(filters).length > 0;
  const emptyTitle = hasActiveCriteria
    ? t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_NO_RESULTS_TITLE")
    : t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_EMPTY_TITLE");
  const emptyDescription = hasActiveCriteria
    ? t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_NO_RESULTS_DESC")
    : t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_EMPTY");
  const toolbar = (
    <PageExtraToolbar
      leading={
        <>
          <DataTableSearchInput
            value={tableHook.searchInput}
            onChange={tableHook.setSearchInput}
            placeholder={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_SEARCH_PLACEHOLDER")}
            clearLabel={t("common:CLEAR")}
            className="w-full max-w-sm"
          />
          <EmailTemplateFilterPopover
            value={filters}
            onChange={setFilters}
            ordering={ordering}
            onOrderingChange={setOrdering}
          />
        </>
      }
      trailing={
        <DataTableToolbarTools
          table={tableHook.table}
          rowHeight={rowHeight}
          onRowHeightChange={setRowHeight}
          wrapHeaders={wrapHeaders}
          onWrapHeadersChange={setWrapHeaders}
          onRefresh={() => void tableHook.refetch()}
          refreshing={tableHook.isFetching && !tableHook.isLoading}
          onResetColumnVisibility={tableHook.resetColumnVisibility}
          labels={toolsLabels}
        />
      }
    />
  );
  const pagination = tableHook.table.getState().pagination;

  return (
    <>
      <SystemSettingItem
        id="email-templates"
        title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_DESC")}
        headerAction={
          <Button
            type="button"
            size="sm"
            onClick={() => setEditor({ open: true, mode: "create", template: null })}
          >
            <Plus className="size-4" />
            {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_CREATE_ACTION")}
          </Button>
        }
        contentClassName="p-0"
      >
        <div className="min-h-[32rem] px-4 pb-4">
          <AdminDataTableSection
            table={tableHook.table}
            emptyText={emptyDescription}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            emptyExtra={
              hasActiveCriteria ? undefined : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditor({ open: true, mode: "create", template: null })}
                >
                  <Plus className="size-4" />
                  {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_CREATE_ACTION")}
                </Button>
              )
            }
            loading={tableHook.isLoading}
            error={tableHook.error}
            onRetry={() => void tableHook.refetch()}
            t={t}
            rowHeight={rowHeight}
            wrapHeaders={wrapHeaders}
            refreshing={tableHook.isFetching && !tableHook.isLoading}
            toolbar={toolbar}
            footerSlot={
              <DataPaginationControls
                page={pagination.pageIndex + 1}
                size={pagination.pageSize}
                total={tableHook.total}
                onChange={(page, size) => {
                  tableHook.table.setPageSize(size);
                  tableHook.table.setPageIndex(page - 1);
                }}
                t={t}
              />
            }
          />
        </div>
      </SystemSettingItem>

      <EmailTemplateEditorDialog
        open={editor.open}
        mode={editor.mode}
        template={editor.template}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        onSaved={() => reconcileTemplates(editor.template?.id)}
        onReloadTemplate={reloadEditorTemplate}
      />
      <EmailTemplateHistoryDrawer
        open={Boolean(historyGroup)}
        group={historyGroup}
        onOpenChange={(open) => {
          if (!open) setHistoryGroup(null);
        }}
      />
      <EmailTemplatePreviewDialog
        open={Boolean(previewState.template && previewState.output)}
        template={previewState.template}
        preview={previewState.output}
        onOpenChange={(open) => {
          if (!open) setPreviewState({ template: null, output: null });
        }}
      />
      <EmailTemplateTestSendDialog
        open={Boolean(testSendTemplate)}
        template={testSendTemplate}
        onOpenChange={(open) => {
          if (!open) setTestSendTemplate(null);
        }}
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
              {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DELETE_LOCALE_DESC", {
                name: deleteTarget?.name ?? "",
                locale: deleteTarget?.locale ?? "",
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
                onClick={() => {
                  if (deleteTarget) deleteMutation.mutate(deleteTarget);
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
