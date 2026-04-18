import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSettingsIconAccordionItem } from "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-icon-accordion-item";

vi.mock("@arclayer/ui/setting-accordion-item", () => ({
  SettingAccordionItem: (props: {
    title: React.ReactNode;
    description?: React.ReactNode;
    summary?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div>
      <div>{props.title}</div>
      <div>{props.description}</div>
      <div data-testid="icon-summary">{props.summary}</div>
      <div>{props.children}</div>
    </div>
  ),
}));

vi.mock("@/pages/usercenter/workspaces/components/workspace-icon-dialog", () => ({
  WorkspaceIconDialog: (props: {
    dialog: {
      workspace: { name: string } | null;
      setValues: React.Dispatch<
        React.SetStateAction<{
          iconMode: "initials" | "glyph" | "emoji" | "image";
          iconColor: string;
          iconGlyph: string | null;
          iconEmoji: string | null;
          iconUrl: string | null;
        }>
      >;
      onConfirm: () => Promise<void>;
    };
  }) =>
    props.dialog.workspace ? (
      <div data-testid="workspace-icon-dialog">
        <button
          type="button"
          onClick={() =>
            props.dialog.setValues((prev) => ({
              ...prev,
              iconMode: "glyph",
              iconGlyph: "rocket",
            }))
          }
        >
          Choose glyph
        </button>
        <button type="button" onClick={() => void props.dialog.onConfirm()}>
          Confirm dialog
        </button>
      </div>
    ) : null,
}));

function createController() {
  const mutateAsync = vi.fn().mockResolvedValue(undefined);
  const withSavingKey = vi.fn(async (_key: string, task: () => Promise<void>) => {
    await task();
  });

  return {
    t: (key: string) =>
      (
        ({
          "settings:SETTINGS_WORKSPACE_ICON_LABEL": "工作空间图标",
          "settings:SETTINGS_WORKSPACE_ICON_ITEM_DESC":
            "用于侧边栏、选择器与标题等位置展示工作空间标识。",
          "settings:SETTINGS_NOT_SET": "未设置",
          "common:ORG_WORKSPACES_ACTION_CHANGE_ICON": "更换图标",
        }) as Record<string, string>
      )[key] ?? key,
    disabled: false,
    workspaceId: "ws-1",
    detailQuery: {
      data: {
        id: "ws-1",
        project: {
          projectId: "project-1",
        },
        organizationId: "org-1",
        slug: "alpha",
        name: "Workspace Alpha",
        description: null,
        kind: "team",
        iconMode: "image",
        iconColor: "#337ea9",
        iconGlyph: null,
        iconEmoji: null,
        iconUrl: "/assets/icon-1",
      },
    },
    patchWorkspaceMutation: {
      isPending: false,
      mutateAsync,
    },
    withSavingKey,
  } as const;
}

describe("WorkspaceSettingsIconAccordionItem", () => {
  it("shows avatar summaries and keeps the helper copy in the content area", () => {
    render(<WorkspaceSettingsIconAccordionItem controller={createController() as never} />);

    expect(screen.getByTestId("icon-summary")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Workspace Alpha").length).toBeGreaterThan(0);
    expect(
      screen.getByText("用于侧边栏、选择器与标题等位置展示工作空间标识。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更换图标" })).toHaveClass("cursor-pointer");
    expect(screen.queryByText("/assets/icon-1")).not.toBeInTheDocument();
  });

  it("opens the shared icon dialog and saves the full icon contract", async () => {
    const user = userEvent.setup();
    const controller = createController();

    render(<WorkspaceSettingsIconAccordionItem controller={controller as never} />);

    await user.click(screen.getByRole("button", { name: "更换图标" }));
    expect(screen.getByTestId("workspace-icon-dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Choose glyph" }));
    await user.click(screen.getByRole("button", { name: "Confirm dialog" }));

    expect(controller.withSavingKey).toHaveBeenCalledWith("workspace:icon", expect.any(Function));
    expect(controller.patchWorkspaceMutation.mutateAsync).toHaveBeenCalledWith({
      iconMode: "glyph",
      iconColor: "#337ea9",
      iconGlyph: "rocket",
      iconEmoji: null,
      iconUrl: null,
    });
  });
});
