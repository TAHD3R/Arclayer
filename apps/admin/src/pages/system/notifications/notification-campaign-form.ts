import type {
  NotificationAction,
  NotificationActionKind,
  NotificationAudienceKind,
  NotificationCampaignConflictPolicy,
  NotificationCampaignDetail,
  NotificationCampaignEditableFields,
  NotificationDismissPolicy,
  NotificationMediaKind,
  NotificationPresentation,
  NotificationSeverity,
} from "@/api/notification-campaigns";

export type NotificationCampaignFormValues = {
  name: string;
  internalDescription: string;
  audienceKind: NotificationAudienceKind;
  audienceIds: string;
  timezone: string;
  priority: number;
  conflictPolicy: NotificationCampaignConflictPolicy;
  displayStartAt: string;
  displayEndAt: string;
  scheduleAt: string;
  locale: string;
  presentations: Record<NotificationPresentation, boolean>;
  inboxTitle: string;
  inboxBody: string;
  inboxSeverity: NotificationSeverity;
  inboxActionKind: NotificationActionKind;
  inboxActionLabel: string;
  inboxActionTarget: string;
  toastTitle: string;
  toastBody: string;
  toastActionKind: NotificationActionKind;
  toastActionLabel: string;
  toastActionTarget: string;
  bannerTitle: string;
  bannerBody: string;
  bannerActionKind: NotificationActionKind;
  bannerActionLabel: string;
  bannerActionTarget: string;
  bannerDismissible: boolean;
  modalTitle: string;
  modalBody: string;
  modalMediaKind: NotificationMediaKind;
  modalMediaAssetId: string;
  modalMediaAltText: string;
  modalPosterAssetId: string;
  modalCaptionsAssetId: string;
  modalPrimaryActionKind: NotificationActionKind;
  modalPrimaryActionLabel: string;
  modalPrimaryActionTarget: string;
  modalSecondaryActionKind: NotificationActionKind;
  modalSecondaryActionLabel: string;
  modalSecondaryActionTarget: string;
  modalDismissPolicy: NotificationDismissPolicy;
  emailTemplateKey: string;
  emailTemplateVersion: number;
  emailVariables: string;
};

export const NOTIFICATION_CAMPAIGN_DEFAULTS: NotificationCampaignFormValues = {
  name: "",
  internalDescription: "",
  audienceKind: "all_active_users",
  audienceIds: "",
  timezone: "UTC",
  priority: 0,
  conflictPolicy: "queue",
  displayStartAt: "",
  displayEndAt: "",
  scheduleAt: "",
  locale: "zh-CN",
  presentations: { inbox: true, toast: false, modal: false, banner: false, email: false },
  inboxTitle: "",
  inboxBody: "",
  inboxSeverity: "info",
  inboxActionKind: "internal_route",
  inboxActionLabel: "",
  inboxActionTarget: "",
  toastTitle: "",
  toastBody: "",
  toastActionKind: "internal_route",
  toastActionLabel: "",
  toastActionTarget: "",
  bannerTitle: "",
  bannerBody: "",
  bannerActionKind: "internal_route",
  bannerActionLabel: "",
  bannerActionTarget: "",
  bannerDismissible: true,
  modalTitle: "",
  modalBody: "",
  modalMediaKind: "image",
  modalMediaAssetId: "",
  modalMediaAltText: "",
  modalPosterAssetId: "",
  modalCaptionsAssetId: "",
  modalPrimaryActionKind: "internal_route",
  modalPrimaryActionLabel: "",
  modalPrimaryActionTarget: "",
  modalSecondaryActionKind: "internal_route",
  modalSecondaryActionLabel: "",
  modalSecondaryActionTarget: "",
  modalDismissPolicy: "dismissible",
  emailTemplateKey: "",
  emailTemplateVersion: 1,
  emailVariables: "{}",
};

export class NotificationCampaignFormError extends Error {
  constructor(readonly messageKey: string) {
    super(messageKey);
    this.name = "NotificationCampaignFormError";
  }
}

function optionalAction(kind: NotificationActionKind, label: string, target: string) {
  const normalizedLabel = label.trim();
  const normalizedTarget = target.trim();
  if (!normalizedLabel && !normalizedTarget) return null;
  if (!normalizedLabel || !normalizedTarget) {
    throw new NotificationCampaignFormError(
      "SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ERROR_ACTION_INCOMPLETE",
    );
  }
  return { kind, label: normalizedLabel, target: normalizedTarget } satisfies NotificationAction;
}

function requiredAction(kind: NotificationActionKind, label: string, target: string) {
  const action = optionalAction(kind, label, target);
  if (!action) {
    throw new NotificationCampaignFormError(
      "SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ERROR_MODAL_ACTION_REQUIRED",
    );
  }
  return action;
}

function optionalIsoDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new NotificationCampaignFormError(
      "SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ERROR_DATE_INVALID",
    );
  }
  return date.toISOString();
}

function publicIds(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEmailVariables(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new NotificationCampaignFormError(
      "SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ERROR_EMAIL_VARIABLES_INVALID",
    );
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new NotificationCampaignFormError(
      "SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ERROR_EMAIL_VARIABLES_OBJECT",
    );
  }
  return parsed as Record<string, unknown>;
}

export function buildNotificationCampaignPayload(
  values: NotificationCampaignFormValues,
): NotificationCampaignEditableFields {
  const presentations = (
    Object.entries(values.presentations) as Array<[NotificationPresentation, boolean]>
  )
    .filter(([, enabled]) => enabled)
    .map(([presentation]) => presentation);
  if (presentations.length === 0) {
    throw new NotificationCampaignFormError(
      "SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ERROR_PRESENTATION_REQUIRED",
    );
  }
  const audienceIds = publicIds(values.audienceIds);
  if (values.audienceKind !== "all_active_users" && audienceIds.length === 0) {
    throw new NotificationCampaignFormError(
      "SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ERROR_AUDIENCE_IDS_REQUIRED",
    );
  }
  const locale = values.locale.trim();
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale)) {
    throw new NotificationCampaignFormError(
      "SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ERROR_LOCALE_INVALID",
    );
  }
  const variant = {
    locale,
    ...(values.presentations.inbox
      ? {
          inbox: {
            title: values.inboxTitle.trim(),
            body: values.inboxBody.trim() || null,
            severity: values.inboxSeverity,
            action: optionalAction(
              values.inboxActionKind,
              values.inboxActionLabel,
              values.inboxActionTarget,
            ),
          },
        }
      : {}),
    ...(values.presentations.toast
      ? {
          toast: {
            title: values.toastTitle.trim(),
            body: values.toastBody.trim() || null,
            action: optionalAction(
              values.toastActionKind,
              values.toastActionLabel,
              values.toastActionTarget,
            ),
          },
        }
      : {}),
    ...(values.presentations.banner
      ? {
          banner: {
            title: values.bannerTitle.trim(),
            body: values.bannerBody.trim() || null,
            action: optionalAction(
              values.bannerActionKind,
              values.bannerActionLabel,
              values.bannerActionTarget,
            ),
            dismissible: values.bannerDismissible,
          },
        }
      : {}),
    ...(values.presentations.modal
      ? {
          modal: {
            title: values.modalTitle.trim(),
            body: values.modalBody.trim(),
            media: values.modalMediaAssetId.trim()
              ? {
                  assetId: values.modalMediaAssetId.trim(),
                  kind: values.modalMediaKind,
                  altText: values.modalMediaAltText.trim(),
                  posterAssetId: values.modalPosterAssetId.trim() || null,
                  captionsAssetId: values.modalCaptionsAssetId.trim() || null,
                }
              : null,
            primaryAction: requiredAction(
              values.modalPrimaryActionKind,
              values.modalPrimaryActionLabel,
              values.modalPrimaryActionTarget,
            ),
            secondaryAction: optionalAction(
              values.modalSecondaryActionKind,
              values.modalSecondaryActionLabel,
              values.modalSecondaryActionTarget,
            ),
            dismissPolicy: values.modalDismissPolicy,
          },
        }
      : {}),
    ...(values.presentations.email
      ? {
          email: {
            templateKey: values.emailTemplateKey.trim(),
            templateVersion: Number(values.emailTemplateVersion),
            variables: parseEmailVariables(values.emailVariables),
          },
        }
      : {}),
  };
  const inAppPresentations = presentations.filter((item) => item !== "email");
  return {
    name: values.name.trim(),
    internalDescription: values.internalDescription.trim() || null,
    audience: {
      kind: values.audienceKind,
      ...(values.audienceKind === "explicit_users" ? { userIds: audienceIds } : {}),
      ...(values.audienceKind === "workspace_members" ? { workspaceIds: audienceIds } : {}),
    },
    timezone: values.timezone.trim(),
    displayStartAt: optionalIsoDate(values.displayStartAt),
    displayEndAt: optionalIsoDate(values.displayEndAt),
    priority: Number(values.priority),
    conflictPolicy: values.conflictPolicy,
    channels: [
      ...(inAppPresentations.length > 0 ? (["in_app"] as const) : []),
      ...(values.presentations.email ? (["email"] as const) : []),
    ],
    presentations,
    fallbackLocale: locale,
    variants: [variant],
  };
}

function localDateTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}

function actionValues(action?: NotificationAction | null) {
  return {
    kind: action?.kind ?? ("internal_route" as const),
    label: action?.label ?? "",
    target: action?.target ?? "",
  };
}

export function notificationCampaignFormValues(
  campaign: NotificationCampaignDetail | null,
): NotificationCampaignFormValues {
  if (!campaign) return NOTIFICATION_CAMPAIGN_DEFAULTS;
  const variant = campaign.variants[0];
  const audienceIds =
    campaign.audience.kind === "explicit_users"
      ? campaign.audience.userIds
      : campaign.audience.kind === "workspace_members"
        ? campaign.audience.workspaceIds
        : [];
  const inboxAction = actionValues(variant?.inbox?.action);
  const toastAction = actionValues(variant?.toast?.action);
  const bannerAction = actionValues(variant?.banner?.action);
  const modalPrimary = actionValues(variant?.modal?.primaryAction);
  const modalSecondary = actionValues(variant?.modal?.secondaryAction);
  return {
    ...NOTIFICATION_CAMPAIGN_DEFAULTS,
    name: campaign.name,
    internalDescription: campaign.internalDescription ?? "",
    audienceKind: campaign.audience.kind,
    audienceIds: audienceIds?.join("\n") ?? "",
    timezone: campaign.timezone,
    priority: campaign.priority,
    conflictPolicy: campaign.conflictPolicy,
    displayStartAt: localDateTime(campaign.displayStartAt),
    displayEndAt: localDateTime(campaign.displayEndAt),
    scheduleAt: localDateTime(campaign.scheduleAt),
    locale: variant?.locale ?? campaign.fallbackLocale ?? "zh-CN",
    presentations: {
      inbox: campaign.presentations.includes("inbox"),
      toast: campaign.presentations.includes("toast"),
      modal: campaign.presentations.includes("modal"),
      banner: campaign.presentations.includes("banner"),
      email: campaign.presentations.includes("email"),
    },
    inboxTitle: variant?.inbox?.title ?? "",
    inboxBody: variant?.inbox?.body ?? "",
    inboxSeverity: variant?.inbox?.severity ?? "info",
    inboxActionKind: inboxAction.kind,
    inboxActionLabel: inboxAction.label,
    inboxActionTarget: inboxAction.target,
    toastTitle: variant?.toast?.title ?? "",
    toastBody: variant?.toast?.body ?? "",
    toastActionKind: toastAction.kind,
    toastActionLabel: toastAction.label,
    toastActionTarget: toastAction.target,
    bannerTitle: variant?.banner?.title ?? "",
    bannerBody: variant?.banner?.body ?? "",
    bannerActionKind: bannerAction.kind,
    bannerActionLabel: bannerAction.label,
    bannerActionTarget: bannerAction.target,
    bannerDismissible: variant?.banner?.dismissible ?? true,
    modalTitle: variant?.modal?.title ?? "",
    modalBody: variant?.modal?.body ?? "",
    modalMediaKind: variant?.modal?.media?.kind ?? "image",
    modalMediaAssetId: variant?.modal?.media?.assetId ?? "",
    modalMediaAltText: variant?.modal?.media?.altText ?? "",
    modalPosterAssetId: variant?.modal?.media?.posterAssetId ?? "",
    modalCaptionsAssetId: variant?.modal?.media?.captionsAssetId ?? "",
    modalPrimaryActionKind: modalPrimary.kind,
    modalPrimaryActionLabel: modalPrimary.label,
    modalPrimaryActionTarget: modalPrimary.target,
    modalSecondaryActionKind: modalSecondary.kind,
    modalSecondaryActionLabel: modalSecondary.label,
    modalSecondaryActionTarget: modalSecondary.target,
    modalDismissPolicy: variant?.modal?.dismissPolicy ?? "dismissible",
    emailTemplateKey: variant?.email?.templateKey ?? "",
    emailTemplateVersion: variant?.email?.templateVersion ?? 1,
    emailVariables: JSON.stringify(variant?.email?.variables ?? {}, null, 2),
  };
}
