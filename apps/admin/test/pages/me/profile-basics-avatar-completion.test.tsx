import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { updateMyProfile } from "@/api/auth";
import {
  AssetUploadCompletionRequiredError,
  createAssetUploadCompletionCheckpoint,
} from "@/lib/assets/upload-completion";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { notifyError } from "@/lib/notifications";
import { UserProfileBasicsSection } from "@/pages/usercenter/profile/components/profile-basics-section";
import { uploadAvatarFile } from "@/pages/usercenter/profile/lib/avatar-upload";

vi.mock("@/api/auth", () => ({
  updateMyProfile: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifyErrorText: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@/pages/usercenter/profile/lib/avatar-upload", () => ({
  uploadAvatarFile: vi.fn(),
}));

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <UserProfileBasicsSection
        profile={{
          id: "user-1",
          username: "philip",
          email: "philip@example.com",
          displayName: "Philip",
          avatarUrl: null,
          avatarAssetId: null,
        }}
      />
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UserProfileBasicsSection avatar completion recovery", () => {
  it("keeps the checkpoint visible and finishes the same upload from the recovery action", async () => {
    const complete = vi.fn().mockResolvedValue("asset-completed");
    const checkpoint = createAssetUploadCompletionCheckpoint({
      uploadId: "upload-profile",
      complete,
    });
    vi.mocked(uploadAvatarFile).mockRejectedValue(
      new AssetUploadCompletionRequiredError(checkpoint, new Error("commit failed")),
    );
    vi.mocked(updateMyProfile).mockResolvedValue({ avatarAssetAligned: false } as never);

    renderSection();
    const user = userEvent.setup();
    const fileInput = screen.getByLabelText(i18n.t("account:ME_PROFILE_AVATAR_CHANGE"), {
      selector: "input",
    });

    await user.upload(fileInput, new File(["avatar"], "avatar.png", { type: "image/png" }));

    const completionStatus = await screen.findByRole("status");
    expect(completionStatus).toHaveTextContent(
      i18n.t("account:ME_PROFILE_AVATAR_COMPLETION_PENDING"),
    );
    expect(fileInput).toBeDisabled();
    expect(notifyError).not.toHaveBeenCalled();

    await user.click(
      within(completionStatus).getByRole("button", {
        name: i18n.t("account:ME_PROFILE_AVATAR_COMPLETION_ACTION"),
      }),
    );

    await waitFor(() => {
      expect(complete).toHaveBeenCalledTimes(1);
      expect(updateMyProfile).toHaveBeenCalledWith({ avatarAssetId: "asset-completed" });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
    expect(uploadAvatarFile).toHaveBeenCalledTimes(1);
  });
});
