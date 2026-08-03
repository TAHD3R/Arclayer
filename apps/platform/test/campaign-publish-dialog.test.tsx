import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationCampaignSummaryOut } from "@arclayer/platform-openapi";

import {
  estimateCampaignAudience,
  previewCampaign,
  publishCampaign,
} from "@/communications/communications-api";
import { CampaignPublishDialog } from "@/communications/campaign-publish-dialog";
import { initializePlatformI18n, i18n } from "@/lib/i18n";

vi.mock("@/communications/communications-api", () => ({
  estimateCampaignAudience: vi.fn(),
  previewCampaign: vi.fn(),
  publishCampaign: vi.fn(),
}));

const campaign = {
  fallbackLocale: "en-US",
  id: "campaign-1",
  name: "August release",
  revision: 4,
  state: "draft",
} as NotificationCampaignSummaryOut;

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
  vi.mocked(estimateCampaignAudience).mockResolvedValue({
    campaignId: campaign.id,
    estimatedRecipients: 42,
    revision: campaign.revision,
  });
  vi.mocked(previewCampaign).mockResolvedValue({
    campaignId: campaign.id,
    revision: campaign.revision,
    variants: [
      {
        locale: "en-US",
        presentations: { inbox: { body: "Read what changed", title: "Release ready" } },
        usedFallback: false,
      },
    ],
    warnings: [],
  });
  vi.mocked(publishCampaign).mockResolvedValue({} as never);
});

describe("Campaign publish review", () => {
  it("shows the real audience and message preview before sending", async () => {
    const onCompleted = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <CampaignPublishDialog
        campaign={campaign}
        open
        onCompleted={onCompleted}
        onOpenChange={onOpenChange}
      />,
    );

    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText(/Release ready/)).toBeInTheDocument();
    expect(estimateCampaignAudience).toHaveBeenCalledWith(campaign.id);
    expect(previewCampaign).toHaveBeenCalledWith(campaign.id);

    await user.click(screen.getByRole("button", { name: "Send now" }));

    await waitFor(() => expect(publishCampaign).toHaveBeenCalledOnce());
    expect(publishCampaign).toHaveBeenCalledWith(campaign.id, {
      expectedRevision: campaign.revision,
      scheduleAt: null,
    });
    expect(onCompleted).toHaveBeenCalledWith("OPERATION_ACCEPTED");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not expose send when the review cannot be loaded", async () => {
    vi.mocked(previewCampaign).mockRejectedValue(new Error("preview unavailable"));
    render(
      <CampaignPublishDialog
        campaign={campaign}
        open
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send now" })).toBeDisabled();
    expect(publishCampaign).not.toHaveBeenCalled();
  });
});
