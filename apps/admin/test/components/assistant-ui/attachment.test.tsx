import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AttachmentPreviewDialog } from "@/components/assistant-ui/attachment";

type AttachmentState = {
  attachment: {
    id: string;
    type: "image";
    name: string;
    contentType: string;
    content: Array<{ type: "image"; image: string }>;
  };
};

let attachmentState: AttachmentState;

vi.mock("@assistant-ui/react", () => ({
  AttachmentPrimitive: {
    Remove: ({ children }: { children?: ReactNode }) => <>{children}</>,
  },
  ComposerPrimitive: {
    AddAttachment: ({ children }: { children?: ReactNode }) => <>{children}</>,
  },
  MessagePrimitive: {
    Attachments: () => null,
  },
  useAui: () => ({ attachment: { source: "thread-composer" } }),
  useAuiState: (selector: (state: AttachmentState) => unknown) => selector(attachmentState),
}));

vi.mock("@arclayer/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        AI_CHAT_ATTACHMENT_PREVIEW_TITLE: "Preview cover.png",
        AI_CHAT_ATTACHMENT_PREVIEW_ALT: "Preview of cover.png",
        AI_CHAT_CLOSE_ATTACHMENT_PREVIEW: "Close preview",
        AI_CHAT_DOWNLOAD_ATTACHMENT: "Download attachment",
        AI_CHAT_DELETE_ATTACHMENT: "Delete attachment",
      })[key] ?? key,
  }),
}));

function renderPreview() {
  return render(
    <AttachmentPreviewDialog>
      <button type="button">Open preview</button>
    </AttachmentPreviewDialog>,
  );
}

describe("AttachmentPreviewDialog", () => {
  beforeEach(() => {
    attachmentState = {
      attachment: {
        id: "attachment-1",
        type: "image",
        name: "cover.png",
        contentType: "image/png",
        content: [{ type: "image", image: "https://example.com/cover.png" }],
      },
    };
  });

  it("anchors viewport controls outside the preview frame and keeps the toolbar action-only", async () => {
    const user = userEvent.setup();
    renderPreview();

    await user.click(screen.getByRole("button", { name: "Open preview" }));

    const dialog = await screen.findByRole("dialog");
    const toolbar = document.querySelector<HTMLElement>('[data-slot="attachment-preview-toolbar"]');
    expect(dialog).toHaveClass(
      "border-0",
      "bg-transparent",
      "p-0",
      "shadow-none",
      "transform-none!",
      "filter-none!",
    );
    expect(screen.getByRole("button", { name: "Close preview" })).toHaveClass(
      "fixed",
      "right-4",
      "top-4",
      "bg-card/90",
      "text-card-foreground",
    );
    expect(toolbar).not.toBeNull();
    expect(toolbar).toHaveClass("fixed", "inset-x-0", "justify-center");
    expect(within(toolbar!).getByRole("button", { name: "Delete attachment" })).toBeInTheDocument();
    expect(
      within(toolbar!).getByRole("button", { name: "Download attachment" }),
    ).toBeInTheDocument();
    expect(toolbar!.querySelector(".aui-attachment-file-type-icon")).not.toBeInTheDocument();
    expect(within(toolbar!).queryByText("cover.png")).not.toBeInTheDocument();
    expect(within(toolbar!).getByRole("button", { name: "Download attachment" })).not.toHaveFocus();
  });

  it("downloads the previewed attachment from the centered bottom toolbar", async () => {
    const user = userEvent.setup();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderPreview();

    await user.click(screen.getByRole("button", { name: "Open preview" }));
    await user.click(screen.getByRole("button", { name: "Download attachment" }));

    expect(anchorClick).toHaveBeenCalledOnce();
    anchorClick.mockRestore();
  });
});
