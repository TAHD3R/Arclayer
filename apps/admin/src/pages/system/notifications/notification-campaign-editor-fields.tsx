import type { UseFormReturn } from "react-hook-form";
import { Bell, Mail, MessageSquareText, PanelTop, PanelsTopLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  NotificationAudienceEstimate,
  NotificationCampaignPreview,
  NotificationPresentation,
} from "@/api/notification-campaigns";
import { BaseTag } from "@/components/ui/tags";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Textarea } from "@arclayer/ui/textarea";

import type { NotificationCampaignFormValues } from "./notification-campaign-form";
import { CampaignPresentationTags } from "./notification-campaign-ui";

type CampaignForm = UseFormReturn<NotificationCampaignFormValues>;

const PRESENTATION_OPTIONS = [
  { value: "inbox", icon: Bell },
  { value: "toast", icon: MessageSquareText },
  { value: "modal", icon: PanelsTopLeft },
  { value: "banner", icon: PanelTop },
  { value: "email", icon: Mail },
] as const;

function FieldError(props: { message?: string }) {
  return props.message ? (
    <span className="text-footnote text-destructive" role="alert">
      {props.message}
    </span>
  ) : null;
}

export function CampaignAudienceFields(props: { form: CampaignForm }) {
  const { t } = useTranslation("settings");
  const kind = props.form.watch("audienceKind");
  return (
    <SettingDialogFields>
      <SettingDialogField
        title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_NAME")}
        description={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_NAME_DESC")}
      >
        <Input
          {...props.form.register("name", {
            required: t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ERROR_NAME_REQUIRED"),
            maxLength: 160,
          })}
          maxLength={160}
          aria-invalid={Boolean(props.form.formState.errors.name)}
        />
        <FieldError message={props.form.formState.errors.name?.message} />
      </SettingDialogField>
      <SettingDialogField title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_DESCRIPTION")}>
        <Textarea
          {...props.form.register("internalDescription", { maxLength: 4000 })}
          rows={3}
          maxLength={4000}
        />
      </SettingDialogField>
      <SettingDialogField
        title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_AUDIENCE")}
        description={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_AUDIENCE_DESC")}
      >
        <Select
          value={kind}
          onValueChange={(value) =>
            props.form.setValue(
              "audienceKind",
              value as NotificationCampaignFormValues["audienceKind"],
              { shouldDirty: true },
            )
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["all_active_users", "explicit_users", "workspace_members"] as const).map((value) => (
              <SelectItem key={value} value={value}>
                {t(`SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_AUDIENCE_${value.toUpperCase()}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingDialogField>
      {kind !== "all_active_users" ? (
        <SettingDialogField
          title={t(
            kind === "explicit_users"
              ? "SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_USER_IDS"
              : "SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_WORKSPACE_IDS",
          )}
          description={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_IDS_DESC")}
        >
          <Textarea {...props.form.register("audienceIds")} rows={5} className="font-mono" />
        </SettingDialogField>
      ) : null}
    </SettingDialogFields>
  );
}

export function CampaignChannelFields(props: { form: CampaignForm }) {
  const { t } = useTranslation("settings");
  const presentations = props.form.watch("presentations");
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {PRESENTATION_OPTIONS.map(({ value, icon: Icon }) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/35 has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/[0.04]"
          >
            <Checkbox
              checked={presentations[value]}
              onCheckedChange={(checked) =>
                props.form.setValue(
                  "presentations",
                  { ...presentations, [value]: Boolean(checked) },
                  { shouldDirty: true },
                )
              }
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-semibold text-label-primary">
                <Icon className="size-4" />
                {t(`SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PRESENTATION_${value.toUpperCase()}`)}
              </span>
              <span className="mt-1 block text-footnote text-label-secondary">
                {t(
                  `SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PRESENTATION_${value.toUpperCase()}_DESC`,
                )}
              </span>
            </span>
          </label>
        ))}
      </div>
      <SettingDialogFields>
        <SettingDialogField title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_LOCALE")}>
          <Input
            {...props.form.register("locale", {
              required: true,
              pattern: /^[a-z]{2}(?:-[A-Z]{2})?$/,
            })}
            placeholder="zh-CN"
          />
        </SettingDialogField>
        <SettingDialogField title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_CONFLICT")}>
          <Select
            value={props.form.watch("conflictPolicy")}
            onValueChange={(value) =>
              props.form.setValue(
                "conflictPolicy",
                value as NotificationCampaignFormValues["conflictPolicy"],
                { shouldDirty: true },
              )
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="queue">
                {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_CONFLICT_QUEUE")}
              </SelectItem>
              <SelectItem value="replace_lower_priority">
                {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_CONFLICT_REPLACE")}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingDialogField>
      </SettingDialogFields>
    </div>
  );
}

function ActionFields(props: {
  form: CampaignForm;
  prefix:
    | "inboxAction"
    | "toastAction"
    | "bannerAction"
    | "modalPrimaryAction"
    | "modalSecondaryAction";
  title: string;
  required?: boolean;
}) {
  const { t } = useTranslation("settings");
  const kindName = `${props.prefix}Kind` as const;
  const labelName = `${props.prefix}Label` as const;
  const targetName = `${props.prefix}Target` as const;
  return (
    <div className="grid gap-3 rounded-md bg-muted/35 p-3 sm:grid-cols-[10rem_1fr_1.4fr]">
      <Select
        value={props.form.watch(kindName)}
        onValueChange={(value) =>
          props.form.setValue(kindName, value as "internal_route" | "external_https", {
            shouldDirty: true,
          })
        }
      >
        <SelectTrigger aria-label={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_ACTION_KIND")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="internal_route">
            {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_KIND_INTERNAL")}
          </SelectItem>
          <SelectItem value="external_https">
            {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ACTION_KIND_EXTERNAL")}
          </SelectItem>
        </SelectContent>
      </Select>
      <Input
        {...props.form.register(labelName, { required: props.required })}
        placeholder={props.title}
        aria-label={props.title}
      />
      <Input
        {...props.form.register(targetName, { required: props.required })}
        placeholder={
          props.form.watch(kindName) === "internal_route"
            ? "/system/overview"
            : "https://example.com"
        }
        aria-label={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_ACTION_TARGET")}
      />
    </div>
  );
}

function ContentPanel(props: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="border-b px-4 py-3">
        <h3 className="font-semibold text-label-primary">{props.title}</h3>
        <p className="mt-0.5 text-footnote text-label-secondary">{props.description}</p>
      </header>
      <div className="space-y-4 p-4">{props.children}</div>
    </section>
  );
}

export function CampaignContentFields(props: { form: CampaignForm }) {
  const { t } = useTranslation("settings");
  const presentations = props.form.watch("presentations");
  return (
    <div className="space-y-4">
      {presentations.inbox ? (
        <ContentPanel
          title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PRESENTATION_INBOX")}
          description={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PRESENTATION_INBOX_DESC")}
        >
          <Input
            {...props.form.register("inboxTitle", { required: true, maxLength: 256 })}
            maxLength={256}
            placeholder={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_TITLE")}
          />
          <Textarea {...props.form.register("inboxBody", { maxLength: 512 })} maxLength={512} />
          <Select
            value={props.form.watch("inboxSeverity")}
            onValueChange={(value) =>
              props.form.setValue(
                "inboxSeverity",
                value as NotificationCampaignFormValues["inboxSeverity"],
                {
                  shouldDirty: true,
                },
              )
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["info", "success", "warning", "error"] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`SETTINGS_SYSTEM_NOTIFICATIONS_BROADCAST_SEVERITY_${value.toUpperCase()}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ActionFields
            form={props.form}
            prefix="inboxAction"
            title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_ACTION_LABEL")}
          />
        </ContentPanel>
      ) : null}
      {presentations.toast ? (
        <ContentPanel
          title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PRESENTATION_TOAST")}
          description={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PRESENTATION_TOAST_DESC")}
        >
          <Input {...props.form.register("toastTitle", { required: true, maxLength: 160 })} />
          <Textarea {...props.form.register("toastBody", { maxLength: 320 })} rows={3} />
          <ActionFields
            form={props.form}
            prefix="toastAction"
            title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_ACTION_LABEL")}
          />
        </ContentPanel>
      ) : null}
      {presentations.banner ? (
        <ContentPanel
          title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PRESENTATION_BANNER")}
          description={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PRESENTATION_BANNER_DESC")}
        >
          <Input {...props.form.register("bannerTitle", { required: true, maxLength: 160 })} />
          <Textarea {...props.form.register("bannerBody", { maxLength: 320 })} rows={3} />
          <ActionFields
            form={props.form}
            prefix="bannerAction"
            title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_ACTION_LABEL")}
          />
          <label className="flex items-center gap-2 text-footnote text-label-primary">
            <Checkbox
              checked={props.form.watch("bannerDismissible")}
              onCheckedChange={(value) =>
                props.form.setValue("bannerDismissible", Boolean(value), { shouldDirty: true })
              }
            />
            {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_DISMISSIBLE")}
          </label>
        </ContentPanel>
      ) : null}
      {presentations.modal ? (
        <ContentPanel
          title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PRESENTATION_MODAL")}
          description={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PRESENTATION_MODAL_DESC")}
        >
          <Input {...props.form.register("modalTitle", { required: true, maxLength: 256 })} />
          <Textarea
            {...props.form.register("modalBody", { required: true, maxLength: 4000 })}
            rows={6}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={props.form.watch("modalMediaKind")}
              onValueChange={(value) =>
                props.form.setValue("modalMediaKind", value as "image" | "video", {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image">
                  {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_MEDIA_IMAGE")}
                </SelectItem>
                <SelectItem value="video">
                  {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_MEDIA_VIDEO")}
                </SelectItem>
              </SelectContent>
            </Select>
            <Input
              {...props.form.register("modalMediaAssetId")}
              placeholder={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_MEDIA_ASSET_ID")}
            />
            <Input
              {...props.form.register("modalMediaAltText")}
              placeholder={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_MEDIA_ALT")}
            />
            {props.form.watch("modalMediaKind") === "video" ? (
              <>
                <Input
                  {...props.form.register("modalPosterAssetId")}
                  placeholder={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_POSTER_ASSET_ID")}
                />
                <Input
                  {...props.form.register("modalCaptionsAssetId")}
                  placeholder={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_CAPTIONS_ASSET_ID")}
                />
              </>
            ) : null}
          </div>
          <ActionFields
            form={props.form}
            prefix="modalPrimaryAction"
            title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_PRIMARY_ACTION")}
            required
          />
          <ActionFields
            form={props.form}
            prefix="modalSecondaryAction"
            title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_SECONDARY_ACTION")}
          />
          <Select
            value={props.form.watch("modalDismissPolicy")}
            onValueChange={(value) =>
              props.form.setValue(
                "modalDismissPolicy",
                value as "dismissible" | "action_required",
                {
                  shouldDirty: true,
                },
              )
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dismissible">
                {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DISMISS_DISMISSIBLE")}
              </SelectItem>
              <SelectItem value="action_required">
                {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_DISMISS_ACTION_REQUIRED")}
              </SelectItem>
            </SelectContent>
          </Select>
        </ContentPanel>
      ) : null}
      {presentations.email ? (
        <ContentPanel
          title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PRESENTATION_EMAIL")}
          description={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PRESENTATION_EMAIL_DESC")}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <Input
              {...props.form.register("emailTemplateKey", { required: true })}
              placeholder={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_TEMPLATE_KEY")}
            />
            <Input
              type="number"
              min={1}
              {...props.form.register("emailTemplateVersion", { valueAsNumber: true, min: 1 })}
            />
          </div>
          <Textarea
            {...props.form.register("emailVariables")}
            rows={7}
            className="font-mono text-footnote"
          />
        </ContentPanel>
      ) : null}
    </div>
  );
}

function previewText(payload: Record<string, unknown>, field: "title" | "body") {
  const value = payload[field];
  return typeof value === "string" ? value : null;
}

export function CampaignPreviewFields(props: {
  estimate: NotificationAudienceEstimate | undefined;
  preview: NotificationCampaignPreview | undefined;
  loading: boolean;
  error: unknown;
}) {
  const { t } = useTranslation("settings");
  if (props.loading) {
    return (
      <p className="py-10 text-center text-footnote text-label-secondary">
        {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PREVIEW_LOADING")}
      </p>
    );
  }
  if (props.error) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-footnote text-destructive">
        {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PREVIEW_ERROR")}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-caption text-label-tertiary">
            {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PREVIEW_AUDIENCE")}
          </p>
          <p className="mt-1 text-title3 font-semibold tabular-nums">
            {props.estimate?.estimatedRecipients ?? 0}
          </p>
        </div>
        <div className="rounded-lg border p-4 sm:col-span-2">
          <p className="text-caption text-label-tertiary">
            {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PREVIEW_BREAKDOWN")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(props.estimate?.breakdown ?? {}).map(([key, value]) => (
              <BaseTag key={key}>
                {key} · {value}
              </BaseTag>
            ))}
          </div>
        </div>
      </div>
      {props.preview?.variants.flatMap((variant) =>
        Object.entries(variant.presentations).map(([presentation, payload]) => (
          <section key={`${variant.locale}:${presentation}`} className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <CampaignPresentationTags
                presentations={[presentation as NotificationPresentation]}
              />
              <BaseTag>{variant.locale}</BaseTag>
            </div>
            <h3 className="font-semibold text-label-primary">
              {previewText(payload, "title") ?? presentation}
            </h3>
            {previewText(payload, "body") ? (
              <p className="mt-2 whitespace-pre-wrap text-footnote leading-6 text-label-secondary">
                {previewText(payload, "body")}
              </p>
            ) : null}
          </section>
        )),
      )}
      {props.preview?.warnings.length ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-footnote">
          {props.preview.warnings.join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

export function CampaignReviewFields(props: {
  form: CampaignForm;
  estimate?: NotificationAudienceEstimate;
}) {
  const { t } = useTranslation("settings");
  const values = props.form.watch();
  const presentations = (
    Object.entries(values.presentations) as Array<[NotificationPresentation, boolean]>
  )
    .filter(([, enabled]) => enabled)
    .map(([presentation]) => presentation);
  return (
    <div className="space-y-4">
      <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <div>
          <p className="text-caption text-label-tertiary">
            {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_NAME")}
          </p>
          <p className="mt-1 font-semibold">{values.name}</p>
        </div>
        <div>
          <p className="text-caption text-label-tertiary">
            {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_PREVIEW_AUDIENCE")}
          </p>
          <p className="mt-1 font-semibold tabular-nums">
            {props.estimate?.estimatedRecipients ?? "—"}
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="mb-2 text-caption text-label-tertiary">
            {t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_COLUMN_CHANNELS")}
          </p>
          <CampaignPresentationTags presentations={presentations} />
        </div>
      </section>
      <SettingDialogFields>
        <SettingDialogField
          title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_SCHEDULE_AT")}
          description={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_SCHEDULE_AT_DESC")}
        >
          <Input type="datetime-local" {...props.form.register("scheduleAt")} />
        </SettingDialogField>
        <SettingDialogField
          title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_DISPLAY_WINDOW")}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Input type="datetime-local" {...props.form.register("displayStartAt")} />
            <Input type="datetime-local" {...props.form.register("displayEndAt")} />
          </div>
        </SettingDialogField>
        <SettingDialogField title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_PRIORITY")}>
          <Input
            type="number"
            min={-100}
            max={100}
            {...props.form.register("priority", { valueAsNumber: true, min: -100, max: 100 })}
          />
        </SettingDialogField>
        <SettingDialogField title={t("SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_FIELD_TIMEZONE")}>
          <Input {...props.form.register("timezone", { required: true, maxLength: 64 })} />
        </SettingDialogField>
      </SettingDialogFields>
    </div>
  );
}
