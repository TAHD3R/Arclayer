import * as React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  insertTextValue: "",
  selectionFragmentValue: "left",
}));

const mocks = vi.hoisted(() => ({
  alignSetNodes: vi.fn(),
  lineHeightSetNodes: vi.fn(),
  setOption: vi.fn(),
  submitFloatingLink: vi.fn(),
}));

const DropdownMenuContext = React.createContext<{
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
} | null>(null);

const DropdownMenuRadioContext = React.createContext<{
  onValueChange?: (value: string) => void;
  value?: string;
} | null>(null);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@platejs/basic-styles/react", () => ({
  LineHeightPlugin: { key: "lineHeight" },
  TextAlignPlugin: { key: "textAlign" },
}));

vi.mock("@platejs/floating", () => ({
  flip: () => ({}),
  offset: () => ({}),
  shift: () => ({}),
  useFloatingToolbar: () => ({
    clickOutsideRef: { current: null },
    hidden: true,
    props: { style: {} },
    ref: { current: null },
  }),
  useFloatingToolbarState: () => ({}),
}));

vi.mock("@platejs/link/react", () => ({
  FloatingLinkUrlInput: (
    props: React.InputHTMLAttributes<HTMLInputElement> & { children?: React.ReactNode },
  ) => <input {...props} />,
  LinkPlugin: { key: "link" },
  submitFloatingLink: (...args: unknown[]) => mocks.submitFloatingLink(...args),
  useFloatingLinkEdit: () => ({
    props: {},
    ref: () => undefined,
  }),
  useFloatingLinkEditState: () => ({
    isEditing: false,
  }),
  useFloatingLinkInsert: () => ({
    hidden: false,
    props: {},
    ref: () => undefined,
    textInputProps: {
      value: state.insertTextValue,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        state.insertTextValue = event.target.value;
      },
    },
  }),
  useFloatingLinkInsertState: () => ({}),
}));

vi.mock("platejs/react", () => ({
  useEditorPlugin: (plugin: { key?: string }) => {
    if (plugin.key === "textAlign") {
      return {
        editor: {
          id: "editor-1",
        },
        tf: {
          textAlign: {
            setNodes: (value: string) => mocks.alignSetNodes(value),
          },
        },
      };
    }

    return {
      editor: {
        api: {
          above: () => [{ url: "https://example.com" }, [0]],
          string: () => "Saved label",
        },
        id: "editor-1",
      },
      setOption: (key: string, value: string) => mocks.setOption(key, value),
      type: "a",
    };
  },
  useEditorRef: () => ({
    api: {
      above: () => [{ url: "https://example.com" }, [0]],
      string: () => "Saved label",
    },
    getInjectProps: () => ({
      defaultNodeValue: "1.5",
    }),
    getTransforms: () => ({
      lineHeight: {
        setNodes: (value: number) => mocks.lineHeightSetNodes(value),
      },
    }),
    id: "editor-1",
  }),
  usePluginOption: (_plugin: unknown, key: string) => {
    if (key === "url") return "https://example.com";
    if (key === "isOpen") return true;
    return undefined;
  },
  useSelectionFragmentProp: () => state.selectionFragmentValue,
}));

vi.mock("@arclayer/ui/button", () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    children?: React.ReactNode;
  }) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(
        children as React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>,
        props,
      );
    }

    return (
      <button type="button" {...props}>
        {children}
      </button>
    );
  },
}));

vi.mock("@arclayer/ui/dropdown-menu", () => ({
  DropdownMenu: ({
    children,
    onOpenChange,
    open,
  }: {
    children?: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  }) => (
    <DropdownMenuContext.Provider value={{ onOpenChange, open }}>
      {children}
    </DropdownMenuContext.Provider>
  ),
  DropdownMenuTrigger: ({
    asChild,
    children,
  }: {
    asChild?: boolean;
    children?: React.ReactNode;
  }) => {
    const context = React.useContext(DropdownMenuContext);

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(
        children as React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>,
        {
          onClick: () => context?.onOpenChange?.(!context.open),
        },
      );
    }

    return <button type="button">{children}</button>;
  },
  DropdownMenuContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItemContent: ({
    children,
    icon,
  }: {
    children?: React.ReactNode;
    icon?: React.ReactNode;
  }) => (
    <span>
      {icon}
      {children}
    </span>
  ),
  DropdownMenuRadioGroup: ({
    children,
    onValueChange,
    value,
  }: {
    children?: React.ReactNode;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <DropdownMenuRadioContext.Provider value={{ onValueChange, value }}>
      {children}
    </DropdownMenuRadioContext.Provider>
  ),
  DropdownMenuRadioItem: ({ children, value }: { children?: React.ReactNode; value: string }) => {
    const context = React.useContext(DropdownMenuRadioContext);
    const checked = context?.value === value;

    return (
      <button
        type="button"
        role="menuitemradio"
        aria-checked={checked}
        onClick={() => context?.onValueChange?.(value)}
      >
        {children}
      </button>
    );
  },
}));

vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../../../../../packages/ui/shadcn/src/editor/transforms", () => ({
  captureEditorSelection: () => ({ anchor: [0], focus: [0] }),
  runEditorTransformPreservingSelection: (_editor: unknown, fn: () => void, _options: unknown) =>
    fn(),
}));

vi.mock("../../../../../../packages/ui/shadcn/src/editor/font-color-toolbar-button", () => ({
  FontColorToolbarButton: () => null,
}));

vi.mock("../../../../../../packages/ui/shadcn/src/editor/equation-toolbar-button", () => ({
  InlineEquationToolbarButton: () => null,
}));

vi.mock("../../../../../../packages/ui/shadcn/src/editor/link-toolbar-button", () => ({
  LinkToolbarButton: () => null,
}));

vi.mock("../../../../../../packages/ui/shadcn/src/editor/more-toolbar-button", () => ({
  MoreToolbarButton: () => null,
}));

vi.mock("../../../../../../packages/ui/shadcn/src/editor/turn-into-toolbar-button", () => ({
  TurnIntoToolbarButton: () => null,
}));

vi.mock("../../../../../../packages/ui/shadcn/src/editor/ui/mark-toolbar-button", () => ({
  MarkToolbarButton: () => null,
}));

vi.mock("../../../../../../packages/ui/shadcn/src/editor/ui/toolbar", () => ({
  Toolbar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ToolbarButton: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  ToolbarGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ToolbarSplitButton: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ToolbarSplitButtonPrimary: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  ToolbarSplitButtonSecondary: (
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode },
  ) => <button type="button" {...props} />,
  ToolbarTooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import { AlignToolbarButton } from "../../../../../../packages/ui/shadcn/src/editor/align-toolbar-button";
import { LineHeightToolbarButton } from "../../../../../../packages/ui/shadcn/src/editor/line-height-toolbar-button";
import { PlateFloatingToolbar } from "../../../../../../packages/ui/shadcn/src/editor/plugins/floating-toolbar-kit";

describe("content-library-toolbar-state", () => {
  beforeEach(() => {
    state.insertTextValue = "";
    state.selectionFragmentValue = "left";
    mocks.alignSetNodes.mockReset();
    mocks.lineHeightSetNodes.mockReset();
    mocks.setOption.mockReset();
    mocks.submitFloatingLink.mockReset();
  });

  it("submits the typed link description on first Enter in insert mode", async () => {
    const user = userEvent.setup();

    render(<PlateFloatingToolbar />);

    const textInput = screen.getByPlaceholderText("CONTENT_LIBRARY_EDITOR_LINK_TEXT");
    await user.type(textInput, "Visible label{Enter}");

    expect(mocks.setOption).toHaveBeenCalledWith("text", "Visible label");
    expect(mocks.setOption).toHaveBeenLastCalledWith("text", "Visible label");
    expect(mocks.submitFloatingLink).toHaveBeenCalledTimes(1);
  });

  it("updates the align menu indicator immediately even if the selection hook is stale", async () => {
    const user = userEvent.setup();

    render(<AlignToolbarButton />);

    await user.click(
      screen.getAllByRole("button", {
        name: "CONTENT_LIBRARY_EDITOR_MARK_ALIGN",
      })[0],
    );
    await user.click(
      screen.getByRole("menuitemradio", {
        name: "CONTENT_LIBRARY_EDITOR_MARK_ALIGN_CENTER",
      }),
    );

    expect(mocks.alignSetNodes).toHaveBeenCalledWith("center");
    expect(
      screen.getByRole("menuitemradio", {
        name: "CONTENT_LIBRARY_EDITOR_MARK_ALIGN_CENTER",
      }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("updates the line-height menu indicator immediately even if the selection hook is stale", async () => {
    const user = userEvent.setup();
    state.selectionFragmentValue = "1.5";

    render(<LineHeightToolbarButton />);

    await user.click(
      screen.getAllByRole("button", {
        name: "CONTENT_LIBRARY_EDITOR_MARK_LINE_HEIGHT",
      })[0],
    );
    await user.click(screen.getByRole("menuitemradio", { name: "2" }));

    expect(mocks.lineHeightSetNodes).toHaveBeenCalledWith(2);
    expect(screen.getByRole("menuitemradio", { name: "2" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
