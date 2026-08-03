import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationCampaignDetailOut } from "@arclayer/platform-openapi";

import {
  buildCampaignVariants,
  campaignContentValue,
  campaignPresentations,
  parseCampaignEmailVariables,
} from "@/communications/campaign-content-editor";
import { createCampaign, updateCampaign } from "@/communications/communications-api";
import { CampaignDraftDialog } from "@/communications/campaign-draft-dialog";
import { initializePlatformI18n, i18n } from "@/lib/i18n";

vi.mock("@/communications/communications-api", () => ({
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
}));

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
  vi.mocked(createCampaign).mockResolvedValue({} as NotificationCampaignDetailOut);
  vi.mocked(updateCampaign).mockResolvedValue({} as NotificationCampaignDetailOut);
});

describe("Campaign draft editor", () => {
  it("creates a publishable inbox draft with content and fallback language", async () => {
    const onCompleted = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<CampaignDraftDialog open onCompleted={onCompleted} onOpenChange={onOpenChange} />);

    await user.type(screen.getByRole("textbox", { name: "Campaign name" }), "August release");
    await user.type(screen.getByRole("textbox", { name: "Message title" }), "The release is ready");
    await user.type(screen.getByRole("textbox", { name: "Message body" }), "Read what changed.");
    await user.click(screen.getByRole("button", { name: "Create draft" }));

    await waitFor(() => expect(createCampaign).toHaveBeenCalledOnce());
    expect(createCampaign).toHaveBeenCalledWith({
      audience: { kind: "all_active_users" },
      channels: ["in_app"],
      conflictPolicy: "queue",
      fallbackLocale: "en-US",
      internalDescription: null,
      name: "August release",
      presentations: ["inbox"],
      priority: 0,
      timezone: "UTC",
      variants: [
        {
          email: undefined,
          inbox: {
            body: "Read what changed.",
            severity: "info",
            title: "The release is ready",
          },
          locale: "en-US",
        },
      ],
    });
    expect(onCompleted).toHaveBeenCalledWith("OPERATION_ACCEPTED");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("adds a real email template payload when the email channel is selected", async () => {
    const user = userEvent.setup();
    render(<CampaignDraftDialog open onCompleted={vi.fn()} onOpenChange={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: "Campaign name" }), "Billing notice");
    await user.type(screen.getByRole("textbox", { name: "Message title" }), "Invoice ready");
    await user.click(screen.getByRole("checkbox", { name: "Email" }));
    await user.type(screen.getByRole("textbox", { name: "Template identifier" }), "billing_notice");
    const version = screen.getByRole("spinbutton", { name: "Template version" });
    await user.clear(version);
    await user.type(version, "3");
    fireEvent.change(screen.getByRole("textbox", { name: "Template values" }), {
      target: { value: '{"name":"Ada"}' },
    });
    await user.click(screen.getByRole("button", { name: "Create draft" }));

    await waitFor(() => expect(createCampaign).toHaveBeenCalledOnce());
    expect(vi.mocked(createCampaign).mock.calls[0]?.[0]).toMatchObject({
      channels: ["in_app", "email"],
      presentations: ["inbox", "email"],
      variants: [
        {
          email: {
            templateKey: "billing_notice",
            templateVersion: 3,
            variables: { name: "Ada" },
          },
          locale: "en-US",
        },
      ],
    });
  });

  it("preserves other saved variants while replacing the fallback content", () => {
    const campaign = {
      fallbackLocale: "en-US",
      presentations: ["inbox"],
      variants: [
        { id: "variant-en", inbox: { title: "Old" }, locale: "en-US" },
        { id: "variant-zh", inbox: { title: "保留" }, locale: "zh-CN" },
      ],
    } as NotificationCampaignDetailOut;
    const value = {
      ...campaignContentValue(campaign),
      inboxBody: "New body",
      inboxTitle: "New title",
    };

    expect(buildCampaignVariants(campaign, value, ["inbox"])).toEqual([
      {
        banner: undefined,
        email: undefined,
        inbox: { body: "New body", severity: "info", title: "New title" },
        locale: "en-US",
        modal: undefined,
        toast: undefined,
      },
      {
        banner: undefined,
        email: undefined,
        inbox: { title: "保留" },
        locale: "zh-CN",
        modal: undefined,
        toast: undefined,
      },
    ]);
    expect(campaignPresentations(["in_app", "email"], ["banner"])).toEqual(["banner", "email"]);
    expect(parseCampaignEmailVariables('{"name":"Ada"}')).toEqual({ name: "Ada" });
    expect(() => parseCampaignEmailVariables("[]")).toThrow();
  });

  it("does not let a multi-language draft add a format missing from other languages", () => {
    const campaign = {
      audience: { kind: "all_active_users" },
      channels: ["in_app"],
      conflictPolicy: "queue",
      fallbackLocale: "en-US",
      id: "campaign-1",
      name: "Localized campaign",
      presentations: ["inbox"],
      priority: 0,
      revision: 3,
      timezone: "UTC",
      variants: [
        { id: "variant-en", inbox: { title: "English" }, locale: "en-US" },
        { id: "variant-zh", inbox: { title: "中文" }, locale: "zh-CN" },
      ],
    } as NotificationCampaignDetailOut;

    render(
      <CampaignDraftDialog campaign={campaign} open onCompleted={vi.fn()} onOpenChange={vi.fn()} />,
    );

    expect(screen.getByRole("checkbox", { name: "Email" })).toBeDisabled();
    expect(screen.getByText("New sending formats are locked")).toBeInTheDocument();
    expect(updateCampaign).not.toHaveBeenCalled();
  });

  it("can restore a removed format when every other language still has its payload", async () => {
    const campaign = {
      audience: { kind: "all_active_users" },
      channels: ["in_app"],
      conflictPolicy: "queue",
      fallbackLocale: "en-US",
      id: "campaign-1",
      name: "Localized campaign",
      presentations: ["inbox"],
      priority: 0,
      revision: 4,
      timezone: "UTC",
      variants: [
        { id: "variant-en", inbox: { title: "English" }, locale: "en-US" },
        {
          email: { templateKey: "localized_notice", templateVersion: 2 },
          id: "variant-zh",
          inbox: { title: "中文" },
          locale: "zh-CN",
        },
      ],
    } as NotificationCampaignDetailOut;
    const user = userEvent.setup();
    render(
      <CampaignDraftDialog campaign={campaign} open onCompleted={vi.fn()} onOpenChange={vi.fn()} />,
    );

    const emailChannel = screen.getByRole("checkbox", { name: "Email" });
    expect(emailChannel).toBeEnabled();
    await user.click(emailChannel);
    await user.type(
      screen.getByRole("textbox", { name: "Template identifier" }),
      "localized_notice",
    );
    await user.click(screen.getByRole("button", { name: "Save campaign" }));

    await waitFor(() => expect(updateCampaign).toHaveBeenCalledOnce());
    const body = vi.mocked(updateCampaign).mock.calls[0]?.[1];
    expect(body?.presentations).toEqual(["inbox", "email"]);
    expect(body?.variants).toMatchObject([
      { email: { templateKey: "localized_notice", templateVersion: 1 }, locale: "en-US" },
      { email: { templateKey: "localized_notice", templateVersion: 2 }, locale: "zh-CN" },
    ]);
  });

  it("restores a preserved banner instead of silently replacing it with inbox", async () => {
    const campaign = {
      audience: { kind: "all_active_users" },
      channels: ["email"],
      conflictPolicy: "queue",
      fallbackLocale: "en-US",
      id: "campaign-2",
      name: "Banner campaign",
      presentations: ["email"],
      priority: 0,
      revision: 5,
      timezone: "UTC",
      variants: [
        {
          banner: { title: "English banner" },
          email: { templateKey: "banner_notice", templateVersion: 1 },
          id: "variant-en",
          locale: "en-US",
        },
        {
          banner: { title: "中文横幅" },
          email: { templateKey: "banner_notice", templateVersion: 1 },
          id: "variant-zh",
          locale: "zh-CN",
        },
      ],
    } as NotificationCampaignDetailOut;
    const user = userEvent.setup();
    render(
      <CampaignDraftDialog campaign={campaign} open onCompleted={vi.fn()} onOpenChange={vi.fn()} />,
    );

    const inAppChannel = screen.getByRole("checkbox", { name: "In-app" });
    expect(inAppChannel).toBeEnabled();
    await user.click(inAppChannel);
    await user.click(screen.getByRole("button", { name: "Save campaign" }));

    await waitFor(() => expect(updateCampaign).toHaveBeenCalledOnce());
    const body = vi.mocked(updateCampaign).mock.calls[0]?.[1];
    expect(body?.presentations).toEqual(["banner", "email"]);
    expect(body?.presentations).not.toContain("inbox");
    expect(body?.variants).toMatchObject([
      { banner: { title: "English banner" }, locale: "en-US" },
      { banner: { title: "中文横幅" }, locale: "zh-CN" },
    ]);
  });

  it("preserves every mixed in-app payload while its channel is disabled", () => {
    const campaign = {
      fallbackLocale: "en-US",
      presentations: ["inbox", "banner", "email"],
      variants: [
        {
          banner: { title: "English banner" },
          email: { templateKey: "mixed_notice", templateVersion: 1 },
          id: "variant-en",
          inbox: { title: "English inbox" },
          locale: "en-US",
        },
        {
          banner: { title: "中文横幅" },
          email: { templateKey: "mixed_notice", templateVersion: 1 },
          id: "variant-zh",
          inbox: { title: "中文站内信" },
          locale: "zh-CN",
        },
      ],
    } as NotificationCampaignDetailOut;
    const disabledPresentations = campaignPresentations(
      ["email"],
      campaign.presentations,
      campaign.variants,
    );
    const disabledVariants = buildCampaignVariants(
      campaign,
      campaignContentValue(campaign),
      disabledPresentations,
    );

    expect(disabledPresentations).toEqual(["email"]);
    expect(disabledVariants).toMatchObject([
      { banner: { title: "English banner" }, email: {}, inbox: { title: "English inbox" } },
      { banner: { title: "中文横幅" }, email: {}, inbox: { title: "中文站内信" } },
    ]);
    expect(
      campaignPresentations(
        ["in_app", "email"],
        ["email"],
        disabledVariants.map((variant, index) => ({
          ...variant,
          id: `restored-${index}`,
        })) as NotificationCampaignDetailOut["variants"],
      ),
    ).toEqual(["inbox", "banner", "email"]);
  });
});
