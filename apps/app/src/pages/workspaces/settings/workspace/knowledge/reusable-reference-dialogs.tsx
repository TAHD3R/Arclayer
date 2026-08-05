import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { zodResolver } from "@/lib/forms/zod-resolver";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Textarea } from "@arclayer/ui/textarea";

const baseSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string(),
  locale: z.string().trim().min(2),
});

const sourceSchema = z
  .object({
    sourceKind: z.enum(["manual", "url"]),
    displayName: z.string().trim().min(1),
    documentKey: z.string().trim(),
    locale: z.string().trim().min(2),
    url: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (values.sourceKind !== "url") return;
    if (!z.string().url().safeParse(values.url).success) {
      context.addIssue({ code: "custom", message: "url", path: ["url"] });
    }
  });

const versionSchema = z.object({
  title: z.string().trim(),
  content: z.string().trim().min(1),
});

export type ReferenceBaseValues = z.infer<typeof baseSchema>;
export type ReferenceSourceValues = z.infer<typeof sourceSchema>;
export type ReferenceVersionValues = z.infer<typeof versionSchema>;

type DialogProps<T> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (values: T) => Promise<void>;
};

export function ReferenceBaseCreateDialog(props: DialogProps<ReferenceBaseValues>) {
  const { t } = useTranslation(["knowledge", "common"]);
  const form = useForm<ReferenceBaseValues>({
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
      title={t("knowledge:REFERENCE_CREATE_TITLE")}
      description={t("knowledge:REFERENCE_CREATE_DESCRIPTION")}
      footer={
        <DialogFooter
          pending={props.pending}
          onCancel={() => props.onOpenChange(false)}
          onSubmit={submit}
        />
      }
    >
      <form onSubmit={submit}>
        <SettingDialogFields>
          <SettingDialogField
            title={t("knowledge:REFERENCE_NAME_LABEL")}
            description={t("knowledge:REFERENCE_NAME_HELP")}
            error={form.formState.errors.name ? t("knowledge:REFERENCE_REQUIRED") : undefined}
          >
            <Input
              autoFocus
              aria-invalid={Boolean(form.formState.errors.name)}
              {...form.register("name")}
            />
          </SettingDialogField>
          <SettingDialogField title={t("knowledge:REFERENCE_DESCRIPTION_LABEL")}>
            <Textarea className="min-h-24" {...form.register("description")} />
          </SettingDialogField>
          <SettingDialogField title={t("knowledge:REFERENCE_LOCALE_LABEL")}>
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

export function ReferenceSourceCreateDialog(
  props: DialogProps<ReferenceSourceValues> & { supportsUrl: boolean },
) {
  const { t } = useTranslation(["knowledge", "common"]);
  const form = useForm<ReferenceSourceValues>({
    resolver: zodResolver(sourceSchema),
    defaultValues: {
      sourceKind: "manual",
      displayName: "",
      documentKey: "",
      locale: "en-US",
      url: "",
    },
  });
  const sourceKind = form.watch("sourceKind");

  useEffect(() => {
    if (props.open) {
      form.reset({
        sourceKind: "manual",
        displayName: "",
        documentKey: "",
        locale: "en-US",
        url: "",
      });
    }
  }, [form, props.open]);

  const submit = form.handleSubmit(async (values) => {
    await props.onSubmit(values);
    props.onOpenChange(false);
  });

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("knowledge:REFERENCE_SOURCE_CREATE_TITLE")}
      description={t("knowledge:REFERENCE_SOURCE_CREATE_DESCRIPTION")}
      footer={
        <DialogFooter
          pending={props.pending}
          onCancel={() => props.onOpenChange(false)}
          onSubmit={submit}
        />
      }
    >
      <form onSubmit={submit}>
        <SettingDialogFields>
          <SettingDialogField title={t("knowledge:REFERENCE_SOURCE_TYPE_LABEL")}>
            <Select
              value={sourceKind}
              onValueChange={(value) =>
                form.setValue("sourceKind", value as ReferenceSourceValues["sourceKind"], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger aria-label={t("knowledge:REFERENCE_SOURCE_TYPE_LABEL")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">
                  {t("knowledge:REFERENCE_SOURCE_TYPE_MANUAL")}
                </SelectItem>
                {props.supportsUrl ? (
                  <SelectItem value="url">{t("knowledge:REFERENCE_SOURCE_TYPE_URL")}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </SettingDialogField>
          <SettingDialogField
            title={t("knowledge:REFERENCE_SOURCE_NAME_LABEL")}
            error={
              form.formState.errors.displayName ? t("knowledge:REFERENCE_REQUIRED") : undefined
            }
          >
            <Input
              autoFocus
              aria-invalid={Boolean(form.formState.errors.displayName)}
              {...form.register("displayName")}
            />
          </SettingDialogField>
          {sourceKind === "url" ? (
            <SettingDialogField
              title={t("knowledge:REFERENCE_SOURCE_URL_LABEL")}
              description={t("knowledge:REFERENCE_SOURCE_URL_HELP")}
              error={
                form.formState.errors.url ? t("knowledge:REFERENCE_SOURCE_URL_INVALID") : undefined
              }
            >
              <Input
                type="url"
                aria-invalid={Boolean(form.formState.errors.url)}
                {...form.register("url")}
              />
            </SettingDialogField>
          ) : (
            <SettingDialogField
              title={t("knowledge:REFERENCE_SOURCE_KEY_LABEL")}
              description={t("knowledge:REFERENCE_SOURCE_KEY_HELP")}
            >
              <Input {...form.register("documentKey")} />
            </SettingDialogField>
          )}
          <SettingDialogField title={t("knowledge:REFERENCE_LOCALE_LABEL")}>
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

export function ReferenceVersionCreateDialog(props: DialogProps<ReferenceVersionValues>) {
  const { t } = useTranslation(["knowledge", "common"]);
  const form = useForm<ReferenceVersionValues>({
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
      title={t("knowledge:REFERENCE_VERSION_CREATE_TITLE")}
      description={t("knowledge:REFERENCE_VERSION_CREATE_DESCRIPTION")}
      footer={
        <DialogFooter
          pending={props.pending}
          onCancel={() => props.onOpenChange(false)}
          onSubmit={submit}
        />
      }
    >
      <form onSubmit={submit}>
        <SettingDialogFields>
          <SettingDialogField title={t("knowledge:REFERENCE_VERSION_TITLE_LABEL")}>
            <Input autoFocus {...form.register("title")} />
          </SettingDialogField>
          <SettingDialogField
            title={t("knowledge:REFERENCE_VERSION_CONTENT_LABEL")}
            description={t("knowledge:REFERENCE_VERSION_CONTENT_HELP")}
            error={form.formState.errors.content ? t("knowledge:REFERENCE_REQUIRED") : undefined}
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

function DialogFooter(props: { pending: boolean; onCancel: () => void; onSubmit: () => void }) {
  const { t } = useTranslation(["knowledge", "common"]);
  return (
    <>
      <Button variant="ghost" disabled={props.pending} onClick={props.onCancel}>
        {t("common:CANCEL")}
      </Button>
      <Button loading={props.pending} onClick={props.onSubmit}>
        {t("knowledge:REFERENCE_SUBMIT_ACTION")}
      </Button>
    </>
  );
}
