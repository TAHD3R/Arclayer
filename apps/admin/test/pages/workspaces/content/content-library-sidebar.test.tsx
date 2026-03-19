import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { ContentLibrarySidebar } from "@/pages/workspaces/content/library/components/content-library-sidebar";

describe("content-library-sidebar", () => {
  it("shows an archived quick filter and routes selection through the sidebar callback", async () => {
    const user = userEvent.setup();
    const onScopeChange = vi.fn();

    render(
      <ContentLibrarySidebar
        activeScope="quick:all"
        counts={{
          all: 8,
          recent: 3,
          statuses: {
            draft: 2,
            published: 4,
            changed: 1,
            archived: 1,
          },
          models: {},
        }}
        models={[]}
        onScopeChange={onScopeChange}
      />,
    );

    await user.click(screen.getByText("content:CONTENT_LIBRARY_MENU_ARCHIVED"));

    expect(onScopeChange).toHaveBeenCalledWith("quick:archived");
    expect(screen.getByText("content:CONTENT_LIBRARY_MENU_ARCHIVED")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
