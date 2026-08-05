import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ButtonHTMLAttributes,
  Dispatch,
  InputHTMLAttributes,
  PropsWithChildren,
  SetStateAction,
} from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSettingsIconAccordionItem } from "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-icon-accordion-item";

vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@/components/common/entity-avatar", () => ({
  WorkspaceAvatar: (props: { name?: string | null }) => (
    <div aria-label={props.name ?? "workspace"} />
  ),
  workspaceAvatarPropsFromIdentity: () => ({}),
}));

vi.mock("@arclayer/ui/setting-card", () => ({
  SettingCard: ({ children }: PropsWithChildren) => <div>{children}</div>,
  SettingCardContent: ({ children }: PropsWithChildren) => (
    <div data-testid="workspace-basics-card">{children}</div>
  ),
}));

vi.mock("@arclayer/ui/button", () => ({
  Button: ({
    children,
    loading,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }>) => (
    <button {...props}>{loading ? "loading" : children}</button>
  ),
}));

vi.mock("@arclayer/ui/input", () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/pages/usercenter/workspaces/components/workspace-icon-dialog", () => ({
  WorkspaceIconDialog: (props: {
    dialog: {
      workspace: { name: string } | null;
      setValues: Dispatch<
        SetStateAction<{
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
          "settings:SETTINGS_WORKSPACE_NAME_LABEL": "名称",
          "settings:SETTINGS_WORKSPACE_NAME_PLACEHOLDER": "例如：品牌官网",
          "settings:SETTINGS_WORKSPACE_ID_TITLE": "工作空间 ID",
          "settings:SETTINGS_WORKSPACE_ID_COPIED": "工作空间 ID 已复制",
          "settings:SETTINGS_SAVE": "保存",
          "settings:SETTINGS_WORKSPACE_DESCRIPTION_TOO_LONG": "介绍过长（最多 256 字符）",
          "common:ORG_WORKSPACES_FIELD_DESCRIPTION": "介绍",
          "common:ORG_WORKSPACES_FIELD_DESCRIPTION_PLACEHOLDER": "填写工作空间介绍",
          "common:ORG_WORKSPACES_ACTION_CHANGE_ICON": "更换图标",
          "common:DUPLICATE": "复制",
        }) as Record<string, string>
      )[key] ?? key,
    disabled: false,
    savingKey: null,
    currentWorkspaceName: "Workspace Alpha",
    currentWorkspaceDescription: "Brand system and marketing operations.",
    detailQuery: {
      data: {
        id: "ws-1",
        project: null,
        name: "Workspace Alpha",
        description: "Brand system and marketing operations.",
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
  it("renders the inline basics card with workspace id row", () => {
    render(<WorkspaceSettingsIconAccordionItem controller={createController() as never} />);

    expect(screen.getByTestId("workspace-basics-card")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Workspace Alpha")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Brand system and marketing operations.")).toBeInTheDocument();
    expect(screen.getByText("工作空间 ID")).toBeInTheDocument();
    expect(screen.getByText("ws-1")).toBeInTheDocument();
  });

  it("saves name inline", async () => {
    const user = userEvent.setup();
    const controller = createController();

    render(<WorkspaceSettingsIconAccordionItem controller={controller as never} />);

    const input = screen.getByDisplayValue("Workspace Alpha");
    await user.clear(input);
    await user.type(input, "Workspace Beta");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(controller.withSavingKey).toHaveBeenCalledWith("workspace:name", expect.any(Function));
    expect(controller.patchWorkspaceMutation.mutateAsync).toHaveBeenCalledWith({
      name: "Workspace Beta",
    });
  });

  it("saves description inline", async () => {
    const user = userEvent.setup();
    const controller = createController();

    render(<WorkspaceSettingsIconAccordionItem controller={controller as never} />);

    const textarea = screen.getByDisplayValue("Brand system and marketing operations.");
    await user.clear(textarea);
    await user.type(textarea, "New workspace description");

    const saveButtons = screen.getAllByRole("button", { name: "保存" });
    await user.click(saveButtons[saveButtons.length - 1]);

    expect(controller.withSavingKey).toHaveBeenCalledWith(
      "workspace:description",
      expect.any(Function),
    );
    expect(controller.patchWorkspaceMutation.mutateAsync).toHaveBeenCalledWith({
      description: "New workspace description",
    });
  });

  it("opens the shared icon dialog and saves the selected icon", async () => {
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
