import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Textarea } from "@arclayer/ui/textarea";

const baseSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string(),
  locale: z.string().trim().min(2),
});

const sourceSchema = z.object({
  displayName: z.string().trim().min(1),
  documentKey: z.string().trim(),
  locale: z.string().trim().min(2),
});

const versionSchema = z.object({
  title: z.string().trim(),
  content: z.string().trim().min(1),
});

type BaseValues = z.infer<typeof baseSchema>;
type SourceValues = z.infer<typeof sourceSchema>;
type VersionValues = z.infer<typeof versionSchema>;

type DialogProps<T> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (values: T) => Promise<void>;
};

export function KnowledgeBaseCreateDialog(props: DialogProps<BaseValues>) {
  const { t } = useTranslation(["settings", "common"]);
  const form = useForm<BaseValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: { name: "", description: "", locale: "en-US" },
  });

  useEffect(() => {
    if (props.open) form.reset({ name: "", description: "", locale: "en-US" });
  }, [form, props.open]);

  const submit = form.handleSubmit(async (values) => {
    await props.onSubmit(values);
    props.onOpenChange(false);
  });

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_CREATE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_CREATE_DESC")}
      footer={
        <>
          <Button
            variant="ghost"
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button loading={props.pending} onClick={() => void submit()}>
            {t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_CREATE_ACTION")}
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <SettingDialogFields>
          <SettingDialogField
            title={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_NAME_LABEL")}
            description={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_NAME_HELP")}
            error={
              form.formState.errors.name
                ? t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_ACTION_REQUIRED")
                : undefined
            }
          >
            <Input
              autoFocus
              aria-invalid={Boolean(form.formState.errors.name)}
              {...form.register("name")}
            />
          </SettingDialogField>
          <SettingDialogField title={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_DESCRIPTION_LABEL")}>
            <Textarea className="min-h-24" {...form.register("description")} />
          </SettingDialogField>
          <SettingDialogField title={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_LOCALE_LABEL")}>
            <Input
              aria-invalid={Boolean(form.formState.errors.locale)}
              {...form.register("locale")}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

export function KnowledgeSourceCreateDialog(props: DialogProps<SourceValues>) {
  const { t } = useTranslation(["settings", "common"]);
  const form = useForm<SourceValues>({
    resolver: zodResolver(sourceSchema),
    defaultValues: { displayName: "", documentKey: "", locale: "en-US" },
  });

  useEffect(() => {
    if (props.open) form.reset({ displayName: "", documentKey: "", locale: "en-US" });
  }, [form, props.open]);

  const submit = form.handleSubmit(async (values) => {
    await props.onSubmit(values);
    props.onOpenChange(false);
  });

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_SOURCE_CREATE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_SOURCE_CREATE_DESC")}
      footer={
        <>
          <Button
            variant="ghost"
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button loading={props.pending} onClick={() => void submit()}>
            {t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_SOURCE_CREATE_ACTION")}
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <SettingDialogFields>
          <SettingDialogField title={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_SOURCE_NAME_LABEL")}>
            <Input
              autoFocus
              aria-invalid={Boolean(form.formState.errors.displayName)}
              {...form.register("displayName")}
            />
          </SettingDialogField>
          <SettingDialogField title={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_LOCALE_LABEL")}>
            <Input
              aria-invalid={Boolean(form.formState.errors.locale)}
              {...form.register("locale")}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

export function KnowledgeVersionCreateDialog(props: DialogProps<VersionValues>) {
  const { t } = useTranslation(["settings", "common"]);
  const form = useForm<VersionValues>({
    resolver: zodResolver(versionSchema),
    defaultValues: { title: "", content: "" },
  });

  useEffect(() => {
    if (props.open) form.reset({ title: "", content: "" });
  }, [form, props.open]);

  const submit = form.handleSubmit(async (values) => {
    await props.onSubmit(values);
    props.onOpenChange(false);
  });

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_VERSION_CREATE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_VERSION_CREATE_DESC")}
      footer={
        <>
          <Button
            variant="ghost"
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button loading={props.pending} onClick={() => void submit()}>
            {t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_VERSION_CREATE_ACTION")}
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <SettingDialogFields>
          <SettingDialogField
            title={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_VERSION_TITLE_LABEL")}
          >
            <Input autoFocus {...form.register("title")} />
          </SettingDialogField>
          <SettingDialogField
            title={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_VERSION_CONTENT_LABEL")}
            description={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_VERSION_CONTENT_HELP")}
            error={
              form.formState.errors.content
                ? t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_ACTION_REQUIRED")
                : undefined
            }
          >
            <Textarea
              className="min-h-64"
              aria-invalid={Boolean(form.formState.errors.content)}
              {...form.register("content")}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
