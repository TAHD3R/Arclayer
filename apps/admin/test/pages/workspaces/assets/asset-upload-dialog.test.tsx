import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({
  abort: vi.fn(),
  complete: vi.fn(),
  transfer: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  getUploadPolicy: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/api/uploads", () => ({
  getUploadPolicy: apiMocks.getUploadPolicy,
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@arclayer/ui/setting-dialog", () => ({
  SettingDialog: ({
    open,
    title,
    description,
    footer,
    children,
  }: {
    open: boolean;
    title: React.ReactNode;
    description: React.ReactNode;
    footer: React.ReactNode;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={String(title)}>
        <p>{description}</p>
        {children}
        <div>{footer}</div>
      </div>
    ) : null,
}));

vi.mock("@/pages/workspaces/assets/components/asset-upload-session", () => ({
  abortAssetUploadSession: sessionMocks.abort,
  completeAssetUploadSession: sessionMocks.complete,
  transferAssetUpload: sessionMocks.transfer,
}));

vi.mock("@/pages/workspaces/assets/components/file-upload/file-upload", () => ({
  FileUpload: {
    Panel: (props: {
      items: Array<{ id: string; status: string }>;
      onPickFiles: (files: File[]) => void;
      onRetryItem?: (id: string) => void;
    }) => (
      <div>
        <button
          type="button"
          onClick={() =>
            props.onPickFiles([new File(["cover-bytes"], "cover.png", { type: "image/png" })])
          }
        >
          Pick file
        </button>
        {props.items.map((item) => (
          <div key={item.id}>
            <span>{item.status}</span>
            {item.status === "error" || item.status === "finalize_error" ? (
              <button type="button" onClick={() => props.onRetryItem?.(item.id)}>
                Retry item
              </button>
            ) : null}
          </div>
        ))}
      </div>
    ),
  },
}));

import { AssetUploadDialog } from "@/pages/workspaces/assets/components/asset-upload-dialog";

function renderDialog(onUploaded = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const props = {
    scope: { type: "project" as const, id: "project-1" },
    open: true,
    onOpenChange: vi.fn(),
    onUploaded,
  };
  const view = render(
    <QueryClientProvider client={client}>
      <AssetUploadDialog {...props} />
    </QueryClientProvider>,
  );
  return { ...view, client, props };
}

describe("AssetUploadDialog completion recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getUploadPolicy.mockResolvedValue({
      accept: ".png,image/png",
      maxSizeBytes: 1024,
    });
    sessionMocks.transfer.mockImplementation(async (params) => {
      const checkpoint = {
        uploadId: "upload-1",
        chunkSize: 1024,
        totalParts: 1,
        method: "local" as const,
      };
      params.onCheckpoint(checkpoint);
      params.onProgress(params.file.size, 100);
      return checkpoint;
    });
  });

  it("retries completion with the same uploadId without transferring bytes again", async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    sessionMocks.complete
      .mockRejectedValueOnce(new Error("database commit failed"))
      .mockResolvedValueOnce("asset-1");
    renderDialog(onUploaded);

    await user.click(screen.getByRole("button", { name: "Pick file" }));
    await user.click(screen.getByRole("button", { name: "assets:ASSET_UPLOAD_ACTION_START" }));

    expect(await screen.findByText("finalize_error")).toBeInTheDocument();
    expect(sessionMocks.transfer).toHaveBeenCalledTimes(1);
    expect(sessionMocks.complete).toHaveBeenCalledWith(
      { type: "project", id: "project-1" },
      "upload-1",
    );
    expect(onUploaded).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Retry item" }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(["asset-1"]));
    expect(sessionMocks.transfer).toHaveBeenCalledTimes(1);
    expect(sessionMocks.complete).toHaveBeenCalledTimes(2);
    expect(sessionMocks.complete).toHaveBeenLastCalledWith(
      { type: "project", id: "project-1" },
      "upload-1",
    );
    expect(sessionMocks.abort).not.toHaveBeenCalled();
  });

  it("keeps the completion checkpoint when the controlled dialog closes and reopens", async () => {
    const user = userEvent.setup();
    sessionMocks.complete
      .mockRejectedValueOnce(new Error("database commit failed"))
      .mockResolvedValueOnce("asset-1");
    const { rerender, client, props } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Pick file" }));
    await user.click(screen.getByRole("button", { name: "assets:ASSET_UPLOAD_ACTION_START" }));
    expect(await screen.findByText("finalize_error")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "common:CLOSE" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    rerender(
      <QueryClientProvider client={client}>
        <AssetUploadDialog {...props} open={false} />
      </QueryClientProvider>,
    );
    rerender(
      <QueryClientProvider client={client}>
        <AssetUploadDialog {...props} open />
      </QueryClientProvider>,
    );

    expect(screen.getByText("finalize_error")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry item" }));
    await waitFor(() => expect(sessionMocks.complete).toHaveBeenCalledTimes(2));
    expect(sessionMocks.transfer).toHaveBeenCalledTimes(1);
    expect(sessionMocks.abort).not.toHaveBeenCalled();
  });

  it("keeps a pre-completion checkpoint visible when abort cleanup fails", async () => {
    const user = userEvent.setup();
    sessionMocks.transfer.mockImplementationOnce(async (params) => {
      const checkpoint = {
        uploadId: "upload-1",
        chunkSize: 1024,
        totalParts: 1,
        method: "local" as const,
      };
      params.onCheckpoint(checkpoint);
      throw new Error("part transfer failed");
    });
    sessionMocks.abort.mockRejectedValueOnce(new Error("abort failed"));
    const { props } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Pick file" }));
    await user.click(screen.getByRole("button", { name: "assets:ASSET_UPLOAD_ACTION_START" }));
    expect(await screen.findByText("error")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "assets:ASSET_UPLOAD_ACTION_CANCEL" }));

    await waitFor(() =>
      expect(sessionMocks.abort).toHaveBeenCalledWith(
        { type: "project", id: "project-1" },
        "upload-1",
      ),
    );
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
