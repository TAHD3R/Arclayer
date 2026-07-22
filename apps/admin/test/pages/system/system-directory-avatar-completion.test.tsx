import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  abortSystemDirectoryUserAvatarUpload,
  completeSystemDirectoryUserAvatarUpload,
  initSystemDirectoryUserAvatarUpload,
  uploadSystemDirectoryUserAvatarPart,
} from "@/api/system-directory";
import { DEFAULT_LOCALE, i18n, initI18n } from "@/lib/i18n";
import { notifyError } from "@/lib/notifications";
import {
  EditAccountDialog,
  type UserActionTarget,
} from "@/pages/system/directory/users/governance-dialogs";

vi.mock("@/api/system-directory", () => ({
  abortSystemDirectoryUserAvatarUpload: vi.fn(),
  commitSystemDirectoryUserAvatarUploadPart: vi.fn(),
  completeSystemDirectoryUserAvatarUpload: vi.fn(),
  initSystemDirectoryUserAvatarUpload: vi.fn(),
  presignSystemDirectoryUserAvatarUploadPart: vi.fn(),
  uploadSystemDirectoryUserAvatarPart: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
}));

const userTarget: UserActionTarget = {
  userId: "user-1",
  username: "philip",
  displayName: "Philip",
  email: "philip@example.com",
  status: "active",
  avatarUrl: null,
  avatar_url: null,
  hasPassword: true,
  twoFactorEnabled: false,
  linkedOauthProviders: [],
} as UserActionTarget;

function renderDialog(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <EditAccountDialog
      open
      onOpenChange={vi.fn()}
      user={userTarget}
      pending={false}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit };
}

beforeAll(async () => {
  await initI18n(DEFAULT_LOCALE);
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(initSystemDirectoryUserAvatarUpload).mockResolvedValue({
    uploadId: "directory-upload",
    chunkSize: 1024,
    totalParts: 1,
    method: "local",
  } as never);
  vi.mocked(uploadSystemDirectoryUserAvatarPart).mockResolvedValue(undefined);
  vi.mocked(abortSystemDirectoryUserAvatarUpload).mockResolvedValue({} as never);
});

describe("EditAccountDialog avatar completion recovery", () => {
  it("finishes the same upload id from the inline recovery action", async () => {
    vi.mocked(completeSystemDirectoryUserAvatarUpload)
      .mockRejectedValueOnce(new Error("commit failed"))
      .mockResolvedValueOnce({ assetId: "directory-avatar" } as never);
    const { onSubmit } = renderDialog();
    const user = userEvent.setup();

    await user.upload(
      screen.getByLabelText(i18n.t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_AVATAR_PICK"), {
        selector: "input",
      }),
      new File(["avatar"], "avatar.png", { type: "image/png" }),
    );

    const completionStatus = await screen.findByText(
      i18n.t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_AVATAR_COMPLETION_PENDING"),
    );
    expect(abortSystemDirectoryUserAvatarUpload).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();

    const statusRegion = completionStatus.closest<HTMLElement>('[role="status"]');
    expect.assert(statusRegion);
    await user.click(
      within(statusRegion).getByRole("button", {
        name: i18n.t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_AVATAR_COMPLETION_ACTION"),
      }),
    );

    await waitFor(() => {
      expect(completeSystemDirectoryUserAvatarUpload).toHaveBeenNthCalledWith(
        2,
        "user-1",
        "directory-upload",
      );
      expect(
        screen.queryByText(
          i18n.t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_AVATAR_COMPLETION_PENDING"),
        ),
      ).not.toBeInTheDocument();
    });
    expect(initSystemDirectoryUserAvatarUpload).toHaveBeenCalledTimes(1);
    expect(uploadSystemDirectoryUserAvatarPart).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: i18n.t("common:CONFIRM") }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        displayName: "Philip",
        email: "philip@example.com",
        avatarAssetId: "directory-avatar",
      });
    });
  });

  it("surfaces an abort cleanup failure instead of swallowing it", async () => {
    vi.mocked(uploadSystemDirectoryUserAvatarPart).mockRejectedValue(new Error("part failed"));
    vi.mocked(abortSystemDirectoryUserAvatarUpload).mockRejectedValue(new Error("abort failed"));
    renderDialog();
    const user = userEvent.setup();

    await user.upload(
      screen.getByLabelText(i18n.t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_AVATAR_PICK"), {
        selector: "input",
      }),
      new File(["avatar"], "avatar.png", { type: "image/png" }),
    );

    await waitFor(() => {
      expect(notifyError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: i18n.t("settings:SETTINGS_SYSTEM_DIRECTORY_EDIT_ACCOUNT_AVATAR_CLEANUP_FAILED"),
          cause: expect.objectContaining({
            name: "AssetUploadCleanupError",
            uploadId: "directory-upload",
          }),
        }),
      );
    });
    expect(abortSystemDirectoryUserAvatarUpload).toHaveBeenCalledWith("user-1", "directory-upload");
    expect(completeSystemDirectoryUserAvatarUpload).not.toHaveBeenCalled();
  });
});
