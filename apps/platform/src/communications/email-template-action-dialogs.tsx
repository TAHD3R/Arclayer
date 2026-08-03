import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  MailTemplateOut,
  MailTemplateRevisionDetailOut,
  PageDataMailTemplateRevisionOut,
} from "@arclayer/platform-openapi";

import {
  deleteTemplate,
  getTemplateRevision,
  listTemplateHistory,
  restoreTemplate,
  testSendTemplate,
} from "@/communications/communications-api";
import { parseTemplateVariableValues } from "@/communications/email-template-editor-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type DialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string) => void;
}>;

type TemplateDialogProps = DialogProps & Readonly<{ template: MailTemplateOut }>;

function MutationError() {
  const { t } = useTranslation("communications");
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("OPERATION_FAILED")}</AlertTitle>
      <AlertDescription>{t("OPERATION_FAILED")}</AlertDescription>
    </Alert>
  );
}

export function EmailTemplateTestDialog(props: TemplateDialogProps) {
  const { t } = useTranslation("communications");
  const [recipient, setRecipient] = useState("");
  const [variables, setVariables] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setRecipient("");
    setVariables(
      JSON.stringify(
        Object.fromEntries(props.template.variables.map((item) => [item, ""])),
        null,
        2,
      ),
    );
    setPending(false);
    setError(null);
  }, [props.open, props.template]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let parsedVariables;
    try {
      parsedVariables = parseTemplateVariableValues(variables);
    } catch {
      setError("SAMPLE_VARIABLES_INVALID");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await testSendTemplate(props.template.id, {
        recipient: recipient.trim(),
        variables: parsedVariables,
      });
      props.onCompleted("OPERATION_ACCEPTED");
      props.onOpenChange(false);
    } catch {
      setError("OPERATION_FAILED");
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t("TEST_TEMPLATE_TITLE")}
      description={t("TEST_TEMPLATE_DESCRIPTION", {
        locale: props.template.locale,
        name: props.template.name,
      })}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} form="email-template-test" loading={pending} type="submit">
            {t("SEND_TEST")}
          </Button>
        </>
      }
    >
      <form id="email-template-test" onSubmit={submit}>
        <SettingDialogFields>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{t("OPERATION_FAILED")}</AlertTitle>
              <AlertDescription>{t(error)}</AlertDescription>
            </Alert>
          ) : null}
          <SettingDialogField
            title={<label htmlFor="template-test-recipient">{t("TEST_RECIPIENT")}</label>}
          >
            <Input
              autoComplete="email"
              id="template-test-recipient"
              onChange={(event) => setRecipient(event.target.value)}
              required
              type="email"
              value={recipient}
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="template-test-variables">{t("SAMPLE_VARIABLES")}</label>}
            description={t("SAMPLE_VARIABLES_DESCRIPTION")}
          >
            <Textarea
              className="font-mono"
              id="template-test-variables"
              onChange={(event) => setVariables(event.target.value)}
              value={variables}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

export function EmailTemplateHistoryDialog(
  props: DialogProps & Readonly<{ templateKey: string; templateName: string }>,
) {
  const { t } = useTranslation("communications");
  const [history, setHistory] = useState<PageDataMailTemplateRevisionOut | null>(null);
  const [detail, setDetail] = useState<MailTemplateRevisionDetailOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const historyRequest = useRef(0);
  const detailRequest = useRef(0);

  const loadHistory = useCallback(async () => {
    const requestId = ++historyRequest.current;
    detailRequest.current += 1;
    setLoading(true);
    setError(false);
    setDetail(null);
    setDetailLoading(null);
    try {
      const nextHistory = await listTemplateHistory(props.templateKey, { page: 1, size: 50 });
      if (historyRequest.current !== requestId) return;
      setHistory(nextHistory);
    } catch {
      if (historyRequest.current !== requestId) return;
      setHistory(null);
      setError(true);
    } finally {
      if (historyRequest.current === requestId) setLoading(false);
    }
  }, [props.templateKey]);

  useEffect(() => {
    if (props.open) void loadHistory();
    return () => {
      historyRequest.current += 1;
      detailRequest.current += 1;
    };
  }, [loadHistory, props.open]);

  const loadDetail = async (revisionId: string) => {
    const requestId = ++detailRequest.current;
    setDetailLoading(revisionId);
    setError(false);
    try {
      const nextDetail = await getTemplateRevision(revisionId);
      if (detailRequest.current !== requestId) return;
      setDetail(nextDetail);
    } catch {
      if (detailRequest.current !== requestId) return;
      setDetail(null);
      setError(true);
    } finally {
      if (detailRequest.current === requestId) setDetailLoading(null);
    }
  };

  return (
    <SettingDialog
      contentClassName="sm:max-w-4xl"
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("TEMPLATE_HISTORY_TITLE")}
      description={t("TEMPLATE_HISTORY_DESCRIPTION", { name: props.templateName })}
      footer={
        <Button onClick={() => props.onOpenChange(false)} variant="outline">
          {t("CANCEL")}
        </Button>
      }
    >
      <div className="space-y-5">
        {error ? <MutationError /> : null}
        {loading ? (
          <div aria-busy="true" className="space-y-3" role="status">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("REVISION")}</TableHead>
                <TableHead>{t("LOCALE")}</TableHead>
                <TableHead>{t("REVISION_ACTION")}</TableHead>
                <TableHead>{t("ACTOR")}</TableHead>
                <TableHead>{t("UPDATED")}</TableHead>
                <TableHead>{t("ACTIONS")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history?.items?.map((revision) => (
                <TableRow key={revision.id}>
                  <TableCell>v{revision.version}</TableCell>
                  <TableCell>{revision.locale}</TableCell>
                  <TableCell>{t(`REVISION_ACTION_${revision.action.toUpperCase()}`)}</TableCell>
                  <TableCell>
                    {revision.actor?.displayName ?? revision.actor?.username ?? t("NONE")}
                  </TableCell>
                  <TableCell>{new Date(revision.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button
                      loading={detailLoading === revision.id}
                      onClick={() => void loadDetail(revision.id)}
                      size="sm"
                      variant="outline"
                    >
                      {t("VIEW_REVISION")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {detail ? <RevisionDetail detail={detail} /> : null}
      </div>
    </SettingDialog>
  );
}

function RevisionDetail({ detail }: Readonly<{ detail: MailTemplateRevisionDetailOut }>) {
  const { t } = useTranslation("communications");
  return (
    <div className="space-y-4 rounded-md border p-4">
      <div>
        <h3 className="text-base">{t("REVISION_DETAIL")}</h3>
        <p className="text-sm text-muted-foreground">
          v{detail.version} · {detail.locale} ·{" "}
          {t(`REVISION_ACTION_${detail.action.toUpperCase()}`)}
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{t("CHANGED_FIELDS")}</p>
        <p>{detail.changedFields.join(", ") || t("NONE")}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{t("SUBJECT_TEMPLATE")}</p>
        <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
          {detail.subjectTemplate}
        </pre>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-sm text-muted-foreground">{t("TEXT_TEMPLATE")}</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
            {detail.textTemplate}
          </pre>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{t("HTML_TEMPLATE")}</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
            {detail.htmlTemplate}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function DeleteEmailTemplateDialog(props: TemplateDialogProps) {
  return <TemplateMutationDialog {...props} kind="delete" />;
}

export function RestoreEmailTemplateDialog(props: TemplateDialogProps) {
  return <TemplateMutationDialog {...props} kind="restore" />;
}

function TemplateMutationDialog(
  props: TemplateDialogProps & Readonly<{ kind: "delete" | "restore" }>,
) {
  const { t } = useTranslation("communications");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const isDelete = props.kind === "delete";

  useEffect(() => {
    if (!props.open) return;
    setPending(false);
    setError(false);
  }, [props.open]);

  const confirm = async () => {
    setPending(true);
    setError(false);
    try {
      if (isDelete) {
        await deleteTemplate(props.template.id, props.template.version);
      } else {
        await restoreTemplate(props.template.id, { expectedVersion: props.template.version });
      }
      props.onCompleted("OPERATION_ACCEPTED");
      props.onOpenChange(false);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t(isDelete ? "DELETE_TEMPLATE_TITLE" : "RESTORE_TEMPLATE_TITLE")}
      description={t(isDelete ? "DELETE_TEMPLATE_DESCRIPTION" : "RESTORE_TEMPLATE_DESCRIPTION", {
        locale: props.template.locale,
        name: props.template.name,
      })}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button
            disabled={pending}
            loading={pending}
            onClick={() => void confirm()}
            variant={isDelete ? "destructive" : "default"}
          >
            {t(isDelete ? "CONFIRM_DELETE_TEMPLATE" : "CONFIRM_RESTORE_TEMPLATE")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <MutationError /> : null}
        <p className="text-sm text-muted-foreground">
          {t(isDelete ? "DELETE_TEMPLATE_CONSEQUENCE" : "RESTORE_TEMPLATE_CONSEQUENCE")}
        </p>
      </div>
    </SettingDialog>
  );
}
