import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MailTemplateOut, PageDataMailTemplateGroupOut } from "@arclayer/platform-openapi";

import { getTemplate, listTemplates } from "@/communications/communications-api";
import {
  DeleteEmailTemplateDialog,
  EmailTemplateHistoryDialog,
  EmailTemplateTestDialog,
  RestoreEmailTemplateDialog,
} from "@/communications/email-template-action-dialogs";
import { EmailTemplateEditorDialog } from "@/communications/email-template-editor-dialog";
import { MessagesPage, MessagesState } from "@/communications/messages-page-state";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TemplateDialogState =
  | Readonly<{ kind: "create" }>
  | Readonly<{
      kind: "delete" | "edit" | "restore" | "test";
      template: MailTemplateOut;
    }>
  | Readonly<{ kind: "history"; templateKey: string; templateName: string }>;

export function CommunicationsTemplatesPage() {
  const { t } = useTranslation("communications");
  const load = useCallback(() => listTemplates({ page: 1, size: 50 }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [dialog, setDialog] = useState<TemplateDialogState | null>(null);
  const templateRequest = useRef(0);
  const openDialog = (nextDialog: TemplateDialogState) => {
    templateRequest.current += 1;
    setPending(null);
    setDialog(nextDialog);
  };
  const openTemplateDialog = async (
    templateId: string,
    kind: "delete" | "edit" | "restore" | "test",
  ) => {
    const requestId = ++templateRequest.current;
    const operationId = `${templateId}:${kind}`;
    setPending(operationId);
    setNotice(null);
    try {
      const template = await getTemplate(templateId);
      if (templateRequest.current !== requestId) return;
      setDialog({ kind, template });
    } catch {
      if (templateRequest.current === requestId) setNotice(t("OPERATION_FAILED"));
    } finally {
      if (templateRequest.current === requestId) setPending(null);
    }
  };
  const completed = (messageKey: string) => {
    setNotice(t(messageKey));
    retry();
  };
  return (
    <MessagesPage title={t("TEMPLATES_TITLE")} description={t("TEMPLATES_DESCRIPTION")}>
      <div className="flex justify-end">
        <Button onClick={() => openDialog({ kind: "create" })}>{t("CREATE_TEMPLATE")}</Button>
      </div>
      <MessagesState
        empty={(data: PageDataMailTemplateGroupOut) => !data.items?.length}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("NAME")}</TableHead>
                    <TableHead>{t("CATEGORY")}</TableHead>
                    <TableHead>{t("HEALTH")}</TableHead>
                    <TableHead>{t("LOCALES")}</TableHead>
                    <TableHead>{t("ACTIONS")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items?.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell>
                        <p>{item.name}</p>
                        <p className="text-sm text-muted-foreground">{item.key}</p>
                      </TableCell>
                      <TableCell>{t(`CATEGORY_${item.category.toUpperCase()}`)}</TableCell>
                      <TableCell>{t(`TEMPLATE_HEALTH_${item.health.toUpperCase()}`)}</TableCell>
                      <TableCell>
                        {item.locales.map((locale) => (
                          <div className="mb-1 flex flex-wrap items-center gap-2" key={locale.id}>
                            <Badge
                              variant={
                                locale.validationState === "valid" ? "secondary" : "destructive"
                              }
                            >
                              {locale.locale} · v{locale.version}
                            </Badge>
                            <span className="text-sm">{locale.subjectPreview}</span>
                            <Button
                              loading={pending === `${locale.id}:edit`}
                              onClick={() => void openTemplateDialog(locale.id, "edit")}
                              size="sm"
                              variant="ghost"
                            >
                              {t("EDIT")}
                            </Button>
                            <Button
                              loading={pending === `${locale.id}:test`}
                              onClick={() => void openTemplateDialog(locale.id, "test")}
                              size="sm"
                              variant="ghost"
                            >
                              {t("TEST_SEND")}
                            </Button>
                            {locale.sourceState === "overridden" ? (
                              <Button
                                loading={pending === `${locale.id}:restore`}
                                onClick={() => void openTemplateDialog(locale.id, "restore")}
                                size="sm"
                                variant="ghost"
                              >
                                {t("RESTORE_DEFAULT")}
                              </Button>
                            ) : null}
                            {locale.sourceState === "custom" ? (
                              <Button
                                loading={pending === `${locale.id}:delete`}
                                onClick={() => void openTemplateDialog(locale.id, "delete")}
                                size="sm"
                                variant="ghost"
                              >
                                {t("DELETE")}
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() =>
                            openDialog({
                              kind: "history",
                              templateKey: item.key,
                              templateName: item.name,
                            })
                          }
                          size="sm"
                          variant="outline"
                        >
                          {t("HISTORY")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </MessagesState>
      {notice ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {dialog?.kind === "create" ? (
        <EmailTemplateEditorDialog
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
        />
      ) : null}
      {dialog?.kind === "edit" ? (
        <EmailTemplateEditorDialog
          key={dialog.template.id}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          template={dialog.template}
        />
      ) : null}
      {dialog?.kind === "test" ? (
        <EmailTemplateTestDialog
          key={dialog.template.id}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          template={dialog.template}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <DeleteEmailTemplateDialog
          key={dialog.template.id}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          template={dialog.template}
        />
      ) : null}
      {dialog?.kind === "restore" ? (
        <RestoreEmailTemplateDialog
          key={dialog.template.id}
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          template={dialog.template}
        />
      ) : null}
      {dialog?.kind === "history" ? (
        <EmailTemplateHistoryDialog
          onCompleted={completed}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          templateKey={dialog.templateKey}
          templateName={dialog.templateName}
        />
      ) : null}
    </MessagesPage>
  );
}
