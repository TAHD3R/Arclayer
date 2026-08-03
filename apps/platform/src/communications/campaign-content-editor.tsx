import type {
  JsonValueInput,
  NotificationCampaignChannel,
  NotificationCampaignDetailOut,
  NotificationCampaignVariantInput,
  NotificationCampaignVariantOut,
  NotificationPresentation,
} from "@arclayer/platform-openapi";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingDialogField } from "@/components/setting-dialog-field";
import { Textarea } from "@/components/ui/textarea";

const DEFAULT_CAMPAIGN_LOCALE = "en-US";
const MANAGED_PRESENTATIONS: readonly NotificationPresentation[] = ["inbox", "email"];
const IN_APP_PRESENTATIONS: readonly NotificationPresentation[] = [
  "inbox",
  "toast",
  "modal",
  "banner",
];

export type CampaignContentValue = {
  sourceVariantId: string | null;
  locale: string;
  inboxTitle: string;
  inboxBody: string;
  inboxSeverity: string;
  emailTemplateKey: string;
  emailTemplateVersion: number;
  emailVariables: string;
};

export function parseCampaignEmailVariables(value: string): Record<string, JsonValueInput> {
  if (!value.trim()) return {};
  const parsed: unknown = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("CAMPAIGN_EMAIL_VARIABLES_INVALID");
  }
  return parsed as Record<string, JsonValueInput>;
}

export function campaignPresentations(
  channels: readonly NotificationCampaignChannel[],
  existing: readonly NotificationPresentation[] = [],
  variants: readonly NotificationCampaignVariantOut[] = [],
): NotificationPresentation[] {
  const existingInApp = existing.filter((presentation) => presentation !== "email");
  const restorableInApp = variants.length
    ? IN_APP_PRESENTATIONS.filter((presentation) =>
        variants.every((variant) => Boolean(variant[presentation])),
      )
    : [];
  return [
    ...(channels.includes("in_app")
      ? existingInApp.length
        ? existingInApp
        : restorableInApp.length
          ? restorableInApp
          : (["inbox"] as const)
      : []),
    ...(channels.includes("email") ? (["email"] as const) : []),
  ];
}

function fallbackVariant(campaign?: NotificationCampaignDetailOut) {
  return (
    campaign?.variants.find((variant) => variant.locale === campaign.fallbackLocale) ??
    campaign?.variants[0]
  );
}

export function campaignContentValue(
  campaign?: NotificationCampaignDetailOut,
): CampaignContentValue {
  const variant = fallbackVariant(campaign);
  return {
    sourceVariantId: variant?.id ?? null,
    locale: campaign?.fallbackLocale ?? variant?.locale ?? DEFAULT_CAMPAIGN_LOCALE,
    inboxTitle: variant?.inbox?.title ?? "",
    inboxBody: variant?.inbox?.body ?? "",
    inboxSeverity: variant?.inbox?.severity ?? "info",
    emailTemplateKey: variant?.email?.templateKey ?? "",
    emailTemplateVersion: variant?.email?.templateVersion ?? 1,
    emailVariables: JSON.stringify(variant?.email?.variables ?? {}, null, 2),
  };
}

function variantInput(variant: NotificationCampaignVariantOut): NotificationCampaignVariantInput {
  return {
    banner: variant.banner,
    email: variant.email
      ? {
          templateKey: variant.email.templateKey,
          templateVersion: variant.email.templateVersion,
          variables: variant.email.variables as Record<string, JsonValueInput>,
        }
      : undefined,
    inbox: variant.inbox,
    locale: variant.locale,
    modal: variant.modal,
    toast: variant.toast,
  };
}

export function buildCampaignVariants(
  campaign: NotificationCampaignDetailOut | undefined,
  value: CampaignContentValue,
  presentations: readonly NotificationPresentation[],
): NotificationCampaignVariantInput[] {
  const source = campaign?.variants.find((variant) => variant.id === value.sourceVariantId);
  const sourceInput = source ? variantInput(source) : undefined;
  const updated: NotificationCampaignVariantInput = {
    ...sourceInput,
    email: presentations.includes("email")
      ? {
          templateKey: value.emailTemplateKey.trim(),
          templateVersion: value.emailTemplateVersion,
          variables: parseCampaignEmailVariables(value.emailVariables),
        }
      : sourceInput?.email,
    inbox: presentations.includes("inbox")
      ? {
          body: value.inboxBody.trim() || null,
          severity: value.inboxSeverity,
          title: value.inboxTitle.trim(),
        }
      : sourceInput?.inbox,
    locale: value.locale.trim(),
  };
  if (!campaign?.variants.length) return [updated];
  if (!source) return [...campaign.variants.map(variantInput), updated];
  return campaign.variants.map((variant) =>
    variant.id === source.id ? updated : variantInput(variant),
  );
}

type Props = Readonly<{
  campaign?: NotificationCampaignDetailOut;
  presentations: readonly NotificationPresentation[];
  value: CampaignContentValue;
  onChange: (value: CampaignContentValue) => void;
}>;

export function CampaignContentEditor({ campaign, presentations, value, onChange }: Props) {
  const { t } = useTranslation("communications");
  const update = <K extends keyof CampaignContentValue>(key: K, next: CampaignContentValue[K]) => {
    onChange({ ...value, [key]: next });
  };
  const advancedPresentations = presentations.filter(
    (presentation) => !MANAGED_PRESENTATIONS.includes(presentation),
  );

  return (
    <div className="space-y-5">
      <SettingDialogField
        title={<label htmlFor="campaign-locale">{t("CAMPAIGN_LANGUAGE")}</label>}
        description={t("CAMPAIGN_LANGUAGE_DESCRIPTION")}
      >
        <Input
          id="campaign-locale"
          onChange={(event) => update("locale", event.target.value)}
          pattern="[a-z]{2}(-[A-Z]{2})?"
          required
          value={value.locale}
        />
      </SettingDialogField>
      {campaign && campaign.variants.length > 1 ? (
        <Alert>
          <AlertTitle>{t("CAMPAIGN_OTHER_LANGUAGES_TITLE")}</AlertTitle>
          <AlertDescription>{t("CAMPAIGN_OTHER_LANGUAGES_DESCRIPTION")}</AlertDescription>
        </Alert>
      ) : null}
      {advancedPresentations.length ? (
        <Alert>
          <AlertTitle>{t("CAMPAIGN_ADVANCED_CONTENT_TITLE")}</AlertTitle>
          <AlertDescription>
            {t("CAMPAIGN_ADVANCED_CONTENT_DESCRIPTION", {
              types: advancedPresentations.join(", "),
            })}
          </AlertDescription>
        </Alert>
      ) : null}
      {presentations.includes("inbox") ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("CAMPAIGN_INBOX_CONTENT")}</CardTitle>
            <CardDescription>{t("CAMPAIGN_INBOX_CONTENT_DESCRIPTION")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <SettingDialogField
              title={<label htmlFor="campaign-inbox-title">{t("MESSAGE_TITLE")}</label>}
            >
              <Input
                id="campaign-inbox-title"
                maxLength={256}
                onChange={(event) => update("inboxTitle", event.target.value)}
                required
                value={value.inboxTitle}
              />
            </SettingDialogField>
            <SettingDialogField
              title={<label htmlFor="campaign-inbox-body">{t("MESSAGE_BODY")}</label>}
            >
              <Textarea
                id="campaign-inbox-body"
                maxLength={512}
                onChange={(event) => update("inboxBody", event.target.value)}
                value={value.inboxBody}
              />
            </SettingDialogField>
            <SettingDialogField title={t("MESSAGE_TONE")}>
              <Select
                value={value.inboxSeverity}
                onValueChange={(next) => update("inboxSeverity", next)}
              >
                <SelectTrigger aria-label={t("MESSAGE_TONE")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["info", "success", "warning", "error"] as const).map((severity) => (
                    <SelectItem key={severity} value={severity}>
                      {t(`MESSAGE_TONE_${severity.toUpperCase()}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingDialogField>
          </CardContent>
        </Card>
      ) : null}
      {presentations.includes("email") ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("CAMPAIGN_EMAIL_CONTENT")}</CardTitle>
            <CardDescription>{t("CAMPAIGN_EMAIL_CONTENT_DESCRIPTION")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <SettingDialogField
                title={<label htmlFor="campaign-email-template">{t("TEMPLATE_KEY")}</label>}
              >
                <Input
                  id="campaign-email-template"
                  onChange={(event) => update("emailTemplateKey", event.target.value)}
                  required
                  value={value.emailTemplateKey}
                />
              </SettingDialogField>
              <SettingDialogField
                title={<label htmlFor="campaign-email-version">{t("TEMPLATE_VERSION")}</label>}
              >
                <Input
                  id="campaign-email-version"
                  min={1}
                  onChange={(event) => update("emailTemplateVersion", Number(event.target.value))}
                  required
                  type="number"
                  value={value.emailTemplateVersion}
                />
              </SettingDialogField>
            </div>
            <SettingDialogField
              title={<label htmlFor="campaign-email-variables">{t("EMAIL_VARIABLE_VALUES")}</label>}
              description={t("EMAIL_VARIABLE_VALUES_DESCRIPTION")}
            >
              <Textarea
                className="min-h-32 font-mono"
                id="campaign-email-variables"
                onChange={(event) => update("emailVariables", event.target.value)}
                value={value.emailVariables}
              />
            </SettingDialogField>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
