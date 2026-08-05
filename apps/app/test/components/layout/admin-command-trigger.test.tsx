import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminCommandTrigger } from "@/components/layout/admin-command-trigger";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@arclayer/hooks/use-client-platform", () => ({
  useClientPlatform: () => "mac",
}));

describe("AdminCommandTrigger", () => {
  it("uses ghost background colors for the sidebar icon trigger", () => {
    render(
      <AdminCommandTrigger
        sections={[]}
        query=""
        onQueryChange={vi.fn()}
        emptyText="No results"
        onSelectEntry={vi.fn()}
        variant="icon"
      />,
    );

    const trigger = screen.getByRole("button", { name: "COMMAND_TRIGGER_ARIA_LABEL" });

    expect(trigger.className).toContain("bg-transparent");
    expect(trigger.className).toContain("hover:bg-accent");
    expect(trigger.className).toContain("dark:hover:bg-accent/50");
    expect(trigger.className).toContain("data-[state=open]:bg-accent");
    expect(trigger.className).toContain("dark:data-[state=open]:bg-accent/50");
  });
});
