import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Button } from "@arclayer/ui/button";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

function DialogHarness() {
  const [open, setOpen] = useState(true);

  return (
    <SettingDialog
      open={open}
      onOpenChange={setOpen}
      title="Upload assets"
      description="Dialog body"
      footer={<Button onClick={() => setOpen(false)}>Done</Button>}
    >
      <button type="button">Dropzone</button>
    </SettingDialog>
  );
}

describe("dialog exit pointer-events", () => {
  it("关闭后退出动画期间 dialog content 不应继续接收交互", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    await user.click(screen.getByRole("button", { name: "Close" }));

    const dropzone = screen.getByRole("button", { name: "Dropzone" });
    const dialogContent = dropzone.closest("[data-slot='dialog-content']");
    const dialogOverlay = document.querySelector("[data-slot='dialog-overlay']");

    expect(dialogContent).toHaveStyle({ pointerEvents: "none" });
    expect(dialogOverlay).toHaveStyle({ pointerEvents: "none" });
  });
});
