import { describe, expect, it } from "vitest";

import type { NotificationCampaignDetail } from "@/api/notification-campaigns";
import {
  buildNotificationCampaignPayload,
  notificationCampaignFormValues,
  NOTIFICATION_CAMPAIGN_DEFAULTS,
  NotificationCampaignFormError,
} from "@/pages/system/notifications/notification-campaign-form";

describe("notification campaign form mapping", () => {
  it("builds independent channel payloads and a canonical audience rule", () => {
    const payload = buildNotificationCampaignPayload({
      ...NOTIFICATION_CAMPAIGN_DEFAULTS,
      name: "July release",
      audienceKind: "explicit_users",
      audienceIds: "user-public-1\nuser-public-2",
      presentations: { inbox: true, toast: false, modal: true, banner: true, email: true },
      inboxTitle: "Release available",
      inboxBody: "Open the changelog.",
      bannerTitle: "July release is live",
      bannerBody: "New controls are available.",
      modalTitle: "Meet the July release",
      modalBody: "Explore the updated workflow.",
      modalPrimaryActionLabel: "Open overview",
      modalPrimaryActionTarget: "/system/overview",
      emailTemplateKey: "product_release",
      emailTemplateVersion: 3,
      emailVariables: '{"release":"July"}',
    });

    expect(payload.audience).toEqual({
      kind: "explicit_users",
      userIds: ["user-public-1", "user-public-2"],
    });
    expect(payload.channels).toEqual(["in_app", "email"]);
    expect(payload.presentations).toEqual(["inbox", "modal", "banner", "email"]);
    expect(payload.variants[0]).toMatchObject({
      locale: "zh-CN",
      inbox: { title: "Release available" },
      banner: { title: "July release is live", dismissible: true },
      modal: {
        title: "Meet the July release",
        primaryAction: { kind: "internal_route", label: "Open overview" },
      },
      email: {
        templateKey: "product_release",
        templateVersion: 3,
        variables: { release: "July" },
      },
    });
  });

  it("rejects a campaign without any presentation", () => {
    expect(() =>
      buildNotificationCampaignPayload({
        ...NOTIFICATION_CAMPAIGN_DEFAULTS,
        name: "No channels",
        presentations: { inbox: false, toast: false, modal: false, banner: false, email: false },
      }),
    ).toThrowError(
      new NotificationCampaignFormError(
        "SETTINGS_SYSTEM_NOTIFICATIONS_CAMPAIGN_ERROR_PRESENTATION_REQUIRED",
      ),
    );
  });

  it("hydrates presentation-specific values without flattening content", () => {
    const campaign = {
      id: "campaign-public-id",
      name: "Independent content",
      owner: { id: "owner-public-id", username: "operator" },
      revision: 4,
      state: "draft",
      audience: { kind: "all_active_users" },
      timezone: "UTC",
      priority: 10,
      conflictPolicy: "queue",
      channels: ["in_app"],
      presentations: ["inbox", "banner"],
      fallbackLocale: "en-US",
      metrics: {
        recipients: 0,
        pending: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        suppressed: 0,
        read: 0,
        clicked: 0,
        dismissed: 0,
      },
      createdAt: "2026-07-23T00:00:00Z",
      updatedAt: "2026-07-23T00:00:00Z",
      variants: [
        {
          id: "variant-public-id",
          campaignId: "campaign-public-id",
          locale: "en-US",
          revision: 4,
          isFallback: true,
          inbox: { title: "Inbox title", body: "Inbox body", severity: "info" },
          banner: { title: "Banner title", body: "Banner body", dismissible: false },
          createdAt: "2026-07-23T00:00:00Z",
          updatedAt: "2026-07-23T00:00:00Z",
        },
      ],
    } satisfies NotificationCampaignDetail;

    const values = notificationCampaignFormValues(campaign);

    expect(values.inboxTitle).toBe("Inbox title");
    expect(values.bannerTitle).toBe("Banner title");
    expect(values.bannerDismissible).toBe(false);
    expect(values.presentations).toEqual({
      inbox: true,
      toast: false,
      modal: false,
      banner: true,
      email: false,
    });
  });
});
