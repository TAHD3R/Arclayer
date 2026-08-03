import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  NotificationAudienceKind,
  NotificationAudienceRule,
  NotificationCampaignChannel,
  NotificationCampaignConflictPolicy,
  NotificationCampaignDetailOut,
  NotificationCampaignVariantOut,
  NotificationPresentation,
} from "@arclayer/platform-openapi";

import {
  buildCampaignVariants,
  campaignContentValue,
  campaignPresentations,
  CampaignContentEditor,
} from "@/communications/campaign-content-editor";
import { createCampaign, updateCampaign } from "@/communications/communications-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";
import { Textarea } from "@/components/ui/textarea";

const AUDIENCE_KINDS: readonly NotificationAudienceKind[] = [
  "all_active_users",
  "explicit_users",
  "workspace_members",
];
const CHANNELS: readonly NotificationCampaignChannel[] = ["in_app", "email"];
const CONFLICT_POLICIES: readonly NotificationCampaignConflictPolicy[] = [
  "queue",
  "replace_lower_priority",
];

type Props = Readonly<{
  campaign?: NotificationCampaignDetailOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string) => void;
}>;

export function parseCampaignAudienceIds(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function audienceIds(campaign?: NotificationCampaignDetailOut): string {
  const ids =
    campaign?.audience.kind === "explicit_users"
      ? campaign.audience.userIds
      : campaign?.audience.kind === "workspace_members"
        ? campaign.audience.workspaceIds
        : [];
  return ids?.join("\n") ?? "";
}

function variantHasPresentation(
  variant: NotificationCampaignVariantOut,
  presentation: NotificationPresentation,
): boolean {
  return Boolean(variant[presentation]);
}

function hasIncompletePresentationAddition(
  campaign: NotificationCampaignDetailOut | undefined,
  presentations: readonly NotificationPresentation[],
  sourceVariantId: string | null,
): boolean {
  if (!campaign) return false;
  const additions = presentations.filter(
    (presentation) => !campaign.presentations.includes(presentation),
  );
  return additions.some((presentation) =>
    campaign.variants.some(
      (variant) => variant.id !== sourceVariantId && !variantHasPresentation(variant, presentation),
    ),
  );
}

export function CampaignDraftDialog(props: Props) {
  const { t } = useTranslation("communications");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [audienceKind, setAudienceKind] = useState<NotificationAudienceKind>("all_active_users");
  const [ids, setIds] = useState("");
  const [channels, setChannels] = useState<NotificationCampaignChannel[]>(["in_app"]);
  const [conflictPolicy, setConflictPolicy] = useState<NotificationCampaignConflictPolicy>("queue");
  const [timezone, setTimezone] = useState("UTC");
  const [priority, setPriority] = useState(0);
  const [content, setContent] = useState(() => campaignContentValue(props.campaign));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setName(props.campaign?.name ?? "");
    setDescription(props.campaign?.internalDescription ?? "");
    setAudienceKind(props.campaign?.audience.kind ?? "all_active_users");
    setIds(audienceIds(props.campaign));
    setChannels(props.campaign?.channels ?? ["in_app"]);
    setConflictPolicy(props.campaign?.conflictPolicy ?? "queue");
    setTimezone(props.campaign?.timezone ?? "UTC");
    setPriority(props.campaign?.priority ?? 0);
    setContent(campaignContentValue(props.campaign));
    setPending(false);
    setError(null);
  }, [props.campaign, props.open]);

  const audience = (): NotificationAudienceRule => {
    const parsedIds = parseCampaignAudienceIds(ids);
    if (audienceKind !== "all_active_users" && !parsedIds.length) {
      throw new Error("AUDIENCE_IDS_REQUIRED");
    }
    const existingFilters = props.campaign?.audience;
    const filters = {
      createdFrom: existingFilters?.createdFrom,
      createdTo: existingFilters?.createdTo,
      lastActiveFrom: existingFilters?.lastActiveFrom,
      lastActiveTo: existingFilters?.lastActiveTo,
    };
    if (audienceKind === "explicit_users") {
      return { ...filters, kind: audienceKind, userIds: parsedIds };
    }
    if (audienceKind === "workspace_members") {
      return { ...filters, kind: audienceKind, workspaceIds: parsedIds };
    }
    return { ...filters, kind: audienceKind };
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let audienceRule: NotificationAudienceRule;
    try {
      audienceRule = audience();
    } catch {
      setError("AUDIENCE_IDS_REQUIRED");
      return;
    }
    if (!channels.length) {
      setError("CAMPAIGN_CHANNEL_REQUIRED");
      return;
    }
    const presentations = campaignPresentations(
      channels,
      props.campaign?.presentations,
      props.campaign?.variants,
    );
    if (
      props.campaign &&
      props.campaign.variants.length > 1 &&
      hasIncompletePresentationAddition(props.campaign, presentations, content.sourceVariantId)
    ) {
      setError("CAMPAIGN_MULTI_LANGUAGE_PRESENTATION_CHANGE");
      return;
    }
    const locale = content.locale.trim();
    const duplicateLocale = props.campaign?.variants.some(
      (variant) => variant.id !== content.sourceVariantId && variant.locale === locale,
    );
    if (duplicateLocale) {
      setError("CAMPAIGN_LANGUAGE_DUPLICATE");
      return;
    }
    let variants;
    try {
      variants = buildCampaignVariants(props.campaign, content, presentations);
    } catch {
      setError("CAMPAIGN_EMAIL_VARIABLES_INVALID");
      return;
    }
    const body = {
      audience: audienceRule,
      channels,
      conflictPolicy,
      fallbackLocale: locale,
      internalDescription: description.trim() || null,
      name: name.trim(),
      presentations,
      priority,
      timezone: timezone.trim(),
      variants,
    };
    setPending(true);
    setError(null);
    try {
      if (props.campaign) {
        await updateCampaign(props.campaign.id, {
          ...body,
          expectedRevision: props.campaign.revision,
        });
      } else {
        await createCampaign(body);
      }
      props.onCompleted("OPERATION_ACCEPTED");
      props.onOpenChange(false);
    } catch {
      setError("OPERATION_FAILED");
    } finally {
      setPending(false);
    }
  };

  const toggleChannel = (channel: NotificationCampaignChannel, checked: boolean) => {
    setChannels((current) =>
      checked ? [...new Set([...current, channel])] : current.filter((item) => item !== channel),
    );
  };
  const channelAddsIncompletePresentation = (channel: NotificationCampaignChannel) => {
    if (!props.campaign || props.campaign.variants.length < 2 || channels.includes(channel)) {
      return false;
    }
    const presentations = campaignPresentations(
      [...channels, channel],
      props.campaign.presentations,
      props.campaign.variants,
    );
    return hasIncompletePresentationAddition(
      props.campaign,
      presentations,
      content.sourceVariantId,
    );
  };

  return (
    <SettingDialog
      contentClassName="sm:max-w-4xl"
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t(props.campaign ? "EDIT_CAMPAIGN" : "CREATE_CAMPAIGN")}
      description={t(props.campaign ? "EDIT_CAMPAIGN_DESCRIPTION" : "CREATE_CAMPAIGN_DESCRIPTION")}
      footer={
        <>
          <Button disabled={pending} onClick={() => props.onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} form="campaign-draft-editor" loading={pending} type="submit">
            {t(props.campaign ? "SAVE_CAMPAIGN" : "CREATE_DRAFT")}
          </Button>
        </>
      }
    >
      <form id="campaign-draft-editor" onSubmit={submit}>
        <SettingDialogFields>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{t("OPERATION_FAILED")}</AlertTitle>
              <AlertDescription>{t(error)}</AlertDescription>
            </Alert>
          ) : null}
          <SettingDialogField title={<label htmlFor="campaign-name">{t("CAMPAIGN_NAME")}</label>}>
            <Input
              id="campaign-name"
              maxLength={160}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </SettingDialogField>
          <SettingDialogField
            title={
              <label htmlFor="campaign-description">{t("CAMPAIGN_INTERNAL_DESCRIPTION")}</label>
            }
          >
            <Textarea
              id="campaign-description"
              maxLength={4000}
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </SettingDialogField>
          <SettingDialogField title={t("AUDIENCE_KIND")}>
            <Select
              value={audienceKind}
              onValueChange={(value) => setAudienceKind(value as NotificationAudienceKind)}
            >
              <SelectTrigger aria-label={t("AUDIENCE_KIND")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCE_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {t(`AUDIENCE_KIND_${kind.toUpperCase()}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingDialogField>
          {audienceKind !== "all_active_users" ? (
            <SettingDialogField
              title={
                <label htmlFor="campaign-audience-ids">
                  {t(
                    audienceKind === "explicit_users"
                      ? "AUDIENCE_USER_IDS"
                      : "AUDIENCE_WORKSPACE_IDS",
                  )}
                </label>
              }
              description={t("AUDIENCE_IDS_DESCRIPTION")}
            >
              <Textarea
                className="font-mono"
                id="campaign-audience-ids"
                onChange={(event) => setIds(event.target.value)}
                required
                value={ids}
              />
            </SettingDialogField>
          ) : null}
          <SettingDialogField title={t("CAMPAIGN_CHANNELS")}>
            <div className="flex flex-wrap gap-4">
              {CHANNELS.map((channel) => (
                <label className="flex items-center gap-2 text-sm" key={channel}>
                  <Checkbox
                    checked={channels.includes(channel)}
                    disabled={channelAddsIncompletePresentation(channel)}
                    onCheckedChange={(checked) => toggleChannel(channel, checked === true)}
                  />
                  {t(`CHANNEL_${channel.toUpperCase()}`)}
                </label>
              ))}
            </div>
          </SettingDialogField>
          {props.campaign && props.campaign.variants.length > 1 ? (
            <Alert>
              <AlertTitle>{t("CAMPAIGN_MULTI_LANGUAGE_LIMIT_TITLE")}</AlertTitle>
              <AlertDescription>{t("CAMPAIGN_MULTI_LANGUAGE_LIMIT_DESCRIPTION")}</AlertDescription>
            </Alert>
          ) : null}
          <SettingDialogField title={t("CAMPAIGN_CONFLICT_POLICY")}>
            <Select
              value={conflictPolicy}
              onValueChange={(value) =>
                setConflictPolicy(value as NotificationCampaignConflictPolicy)
              }
            >
              <SelectTrigger aria-label={t("CAMPAIGN_CONFLICT_POLICY")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONFLICT_POLICIES.map((policy) => (
                  <SelectItem key={policy} value={policy}>
                    {t(`CONFLICT_POLICY_${policy.toUpperCase()}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingDialogField>
          <div className="grid gap-5 md:grid-cols-2">
            <SettingDialogField title={<label htmlFor="campaign-timezone">{t("TIMEZONE")}</label>}>
              <Input
                id="campaign-timezone"
                maxLength={64}
                onChange={(event) => setTimezone(event.target.value)}
                required
                value={timezone}
              />
            </SettingDialogField>
            <SettingDialogField
              title={<label htmlFor="campaign-priority">{t("CAMPAIGN_PRIORITY")}</label>}
            >
              <Input
                id="campaign-priority"
                max={100}
                min={-100}
                onChange={(event) => setPriority(Number(event.target.value))}
                type="number"
                value={priority}
              />
            </SettingDialogField>
          </div>
          <CampaignContentEditor
            campaign={props.campaign}
            onChange={setContent}
            presentations={campaignPresentations(
              channels,
              props.campaign?.presentations,
              props.campaign?.variants,
            )}
            value={content}
          />
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
