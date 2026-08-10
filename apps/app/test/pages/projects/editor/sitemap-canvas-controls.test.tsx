import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@arclayer/ui/sidebar";

const slotState = vi.hoisted(() => ({ value: null as HTMLElement | null }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/layouts/creation-layout", () => ({
  useCreationSidebarToolsSlot: () => slotState.value,
}));

import { SitemapCanvasTools } from "@/pages/projects/editor/sitemap-canvas-controls";

function renderTools() {
  return render(
    <SidebarProvider open={false}>
      <SitemapCanvasTools
        onAddPage={vi.fn()}
        onManageSharedSections={vi.fn()}
        onOpenAI={vi.fn()}
        canEdit
        editDisabledReason=""
        canOpenAI
        openAIDisabledReason=""
      />
    </SidebarProvider>,
  );
}

describe("SitemapCanvasTools", () => {
  it("keeps the Highlight context when the tools are portaled into the editor rail", () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    slotState.value = null;

    const view = renderTools();
    slotState.value = slot;
    view.rerender(
      <SidebarProvider open={false}>
        <SitemapCanvasTools
          onAddPage={vi.fn()}
          onManageSharedSections={vi.fn()}
          onOpenAI={vi.fn()}
          canEdit
          editDisabledReason=""
          canOpenAI
          openAIDisabledReason=""
        />
      </SidebarProvider>,
    );

    expect(slot.querySelectorAll('[data-sidebar="menu-button"]')).toHaveLength(4);
    slot.remove();
  });
});
