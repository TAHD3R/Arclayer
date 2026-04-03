import * as React from "react";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let currentElement: Record<string, unknown> = {};
let currentIsEditing = false;
let currentSelected = true;
let currentFocusedLast = true;
let currentReadOnly = false;
let currentSelectionCollapsed = true;
let currentImagePreviewOpen = false;
let currentMediaState: Record<string, unknown> = {};

const submitFloatingMediaMock = vi.fn();
const updateUploadHistoryMock = vi.fn();
const floatingStoreSetMock = vi.fn((key: string, value: unknown) => {
  if (key === "isEditing") currentIsEditing = Boolean(value);
});
const floatingStoreResetMock = vi.fn(() => {
  currentIsEditing = false;
});
const toastErrorMock = vi.fn();

const mockEditor = {
  api: {
    findPath: vi.fn(() => [0]),
  },
  getApi: vi.fn(() => ({
    blockMenu: {
      show: vi.fn(),
    },
    blockSelection: {
      focus: vi.fn(),
      set: vi.fn(),
    },
  })),
  getOption: vi.fn(() => new Set<string>()),
  history: {
    redos: [],
    undos: [],
  },
  id: "editor-1",
  selection: null as {
    anchor: { offset: number; path: number[] };
    focus: { offset: number; path: number[] };
  } | null,
  tf: {
    focus: vi.fn(),
    insertNodes: vi.fn(),
    removeNodes: vi.fn(),
    select: vi.fn(),
    setNodes: vi.fn(),
    withoutSaving: (fn: () => void) => fn(),
  },
};

const plateAttributes = {
  "data-slate-node": "element" as const,
  ref: null,
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("react-textarea-autosize", () => ({
  default: React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>((props, ref) => (
    <textarea ref={ref} {...props} />
  )),
}));

vi.mock("@platejs/media/react", () => ({
  FloatingMediaStore: {
    actions: {
      reset: () => floatingStoreResetMock(),
    },
    set: (key: string, value: unknown) => floatingStoreSetMock(key, value),
  },
  PlaceholderProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  submitFloatingMedia: (...args: unknown[]) => submitFloatingMediaMock(...args),
  updateUploadHistory: (...args: unknown[]) => updateUploadHistoryMock(...args),
  useMediaState: () => currentMediaState,
  useFloatingMediaValue: (key: string) => (key === "isEditing" ? currentIsEditing : undefined),
  useImagePreviewValue: () => currentImagePreviewOpen,
}));

vi.mock("@platejs/math/react", () => ({
  useEquationElement: vi.fn(),
  useEquationInput: () => ({}),
}));

vi.mock("@platejs/resizable", () => ({
  ResizableProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Resizable: ({ children, className }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={className}>{children}</div>
  ),
  ResizeHandle: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  useResizableValue: () => undefined,
  useResizeHandle: () => ({ props: {} }),
  useResizeHandleState: () => ({
    isResizing: false,
    readOnly: true,
  }),
}));

vi.mock("@platejs/selection/react", () => ({
  BlockMenuPlugin: { key: "blockMenu" },
  BlockSelectionPlugin: { key: "blockSelection" },
}));

vi.mock("platejs/react", () => ({
  PlateElement: ({
    children,
    className,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
    <div className={className} {...props}>
      {children}
    </div>
  ),
  createPrimitiveComponent:
    (Component: React.ComponentType<Record<string, unknown>>) =>
    ({
      propsHook,
    }: {
      propsHook?: (props: Record<string, unknown>) => Record<string, unknown>;
    }) => {
      return React.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
        const hookedProps = propsHook ? propsHook(props) : {};
        return <Component ref={ref as never} {...hookedProps} {...props} />;
      });
    },
  useEditorRef: () => mockEditor,
  useEditorMounted: () => true,
  useEditorSelector: () => currentSelectionCollapsed,
  useElement: () => currentElement,
  useFocusedLast: () => currentFocusedLast,
  useReadOnly: () => currentReadOnly,
  useSelected: () => currentSelected,
  withHOC: (_provider: unknown, component: React.ComponentType<unknown>) => component,
}));

vi.mock("react-player", () => ({
  default: (props: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="react-player" {...props} />
  ),
}));

vi.mock("react-lite-youtube-embed", () => ({
  default: (props: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="youtube-embed" {...props} />
  ),
}));

vi.mock("@arclayer/ui/admin-toast", () => ({
  message: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@arclayer/ui/button", () => ({
  Button: ({
    asChild,
    children,
    pressed: _pressed,
    size: _size,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    children?: React.ReactNode;
    pressed?: boolean;
    size?: string;
    variant?: string;
  }) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, props);
    }

    return (
      <button type="button" {...props}>
        {children}
      </button>
    );
  },
}));

vi.mock("@arclayer/ui/popover", () => ({
  Popover: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    <div data-testid="popover-root" data-open={open ? "true" : "false"}>
      {children}
    </div>
  ),
  PopoverAnchor: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({
    children,
    onCloseAutoFocus,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    children?: React.ReactNode;
    onCloseAutoFocus?: (event: { preventDefault: () => void }) => void;
  }) => (
    <div {...props}>
      {children}
      {onCloseAutoFocus ? (
        <button
          type="button"
          aria-label="trigger-popover-close"
          onClick={() => onCloseAutoFocus({ preventDefault: () => undefined })}
        />
      ) : null}
    </div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@arclayer/ui/separator", () => ({
  Separator: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
}));

vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@arclayer/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" "),
}));

import { MediaUploadProvider } from "../../../../../../packages/ui/shadcn/src/editor/media-upload-context";
import { ArticleEditorCommandProvider } from "../../../../../../packages/ui/shadcn/src/editor/article-editor-command-context";
import { EquationElement } from "../../../../../../packages/ui/shadcn/src/editor/ui/equation-node";
import { MediaCaption } from "../../../../../../packages/ui/shadcn/src/editor/ui/media-caption";
import { MediaPlaceholderElement } from "../../../../../../packages/ui/shadcn/src/editor/ui/media-placeholder-node";
import { MediaToolbar } from "../../../../../../packages/ui/shadcn/src/editor/ui/media-toolbar";
import { VideoElement } from "../../../../../../packages/ui/shadcn/src/editor/ui/media-video-node";

const MediaPlaceholderElementAny = MediaPlaceholderElement as React.ComponentType<any>;
const EquationElementAny = EquationElement as React.ComponentType<any>;
const VideoElementAny = VideoElement as React.ComponentType<any>;

describe("content-library-editor-media-ui", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    currentElement = {};
    currentIsEditing = false;
    currentSelected = true;
    currentFocusedLast = true;
    currentReadOnly = false;
    currentSelectionCollapsed = true;
    currentImagePreviewOpen = false;
    currentMediaState = {};
    submitFloatingMediaMock.mockReset();
    updateUploadHistoryMock.mockReset();
    floatingStoreSetMock.mockClear();
    floatingStoreResetMock.mockClear();
    toastErrorMock.mockClear();
    mockEditor.api.findPath.mockReset();
    mockEditor.api.findPath.mockReturnValue([0]);
    mockEditor.getApi.mockClear();
    mockEditor.getOption.mockClear();
    mockEditor.tf.focus.mockClear();
    mockEditor.tf.insertNodes.mockClear();
    mockEditor.tf.removeNodes.mockClear();
    mockEditor.tf.select.mockClear();
    mockEditor.tf.setNodes.mockClear();
  });

  it("resets the media link draft when editing moves to another media node", async () => {
    const user = userEvent.setup();
    currentElement = {
      align: "center",
      id: "image-1",
      type: "img",
      url: "https://cdn.example/image.png",
    };

    const { rerender } = render(
      <MediaToolbar compact url="https://cdn.example/image.png">
        <div>anchor</div>
      </MediaToolbar>,
    );

    await user.click(
      screen.getByRole("button", { name: "CONTENT_LIBRARY_EDITOR_MEDIA_EDIT_LINK" }),
    );
    rerender(
      <MediaToolbar compact url="https://cdn.example/image.png">
        <div>anchor</div>
      </MediaToolbar>,
    );

    const input = screen.getByPlaceholderText("https://");
    expect(input).toHaveValue("https://cdn.example/image.png");

    await user.clear(input);
    await user.type(input, "https://edited.example/image.png");

    currentSelected = false;
    rerender(
      <MediaToolbar compact url="https://cdn.example/image.png">
        <div>anchor</div>
      </MediaToolbar>,
    );

    expect(screen.getByPlaceholderText("https://")).toHaveValue("https://edited.example/image.png");

    currentElement = {
      align: "center",
      id: "video-1",
      type: "video",
      url: "https://cdn.example/video.mp4",
    };
    rerender(
      <MediaToolbar compact url="https://cdn.example/video.mp4">
        <div>anchor</div>
      </MediaToolbar>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("https://")).toHaveValue("https://cdn.example/video.mp4");
    });

    await user.type(screen.getByPlaceholderText("https://"), "{Escape}");
    rerender(
      <MediaToolbar compact url="https://cdn.example/video.mp4">
        <div>anchor</div>
      </MediaToolbar>,
    );

    expect(floatingStoreResetMock).toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("https://")).not.toBeInTheDocument();
  });

  it("only shows the trimmed media toolbar actions", () => {
    currentElement = {
      align: "center",
      id: "image-1",
      type: "img",
      url: "https://cdn.example/image.png",
    };

    render(
      <MediaToolbar compact supportsCaption url="https://cdn.example/image.png">
        <div>anchor</div>
      </MediaToolbar>,
    );

    expect(
      screen.getByRole("button", { name: "CONTENT_LIBRARY_EDITOR_MEDIA_EDIT_LINK" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_LIBRARY_EDITOR_MEDIA_CAPTION" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "CONTENT_LIBRARY_EDITOR_MEDIA_OPEN" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CONTENT_LIBRARY_EDITOR_MEDIA_BLOCK_MENU" }),
    ).not.toBeInTheDocument();
  });

  it("auto-opens the placeholder file picker when the placeholder requests it", async () => {
    vi.useFakeTimers();
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => undefined);
    const uploadFile = vi.fn();

    currentElement = {
      autoOpen: true,
      children: [{ text: "" }],
      id: "placeholder-1",
      mediaType: "file",
      type: "placeholder",
    };
    mockEditor.api.findPath.mockReturnValue([3]);

    render(
      <MediaUploadProvider value={{ uploadFile }}>
        <MediaPlaceholderElementAny
          attributes={plateAttributes}
          children={null}
          editor={mockEditor as never}
          element={currentElement as never}
        />
      </MediaUploadProvider>,
    );

    await act(async () => {
      vi.runAllTimers();
    });

    expect(mockEditor.tf.setNodes).toHaveBeenCalledWith({ autoOpen: undefined }, { at: [3] });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it("replaces the placeholder node after an upload succeeds", async () => {
    const uploadFile = vi.fn(async () => ({
      url: "https://cdn.example/spec.pdf",
    }));

    currentElement = {
      autoOpen: false,
      children: [{ text: "" }],
      id: "placeholder-1",
      mediaType: "file",
      type: "placeholder",
    };
    mockEditor.api.findPath.mockReturnValue([3]);

    const { container } = render(
      <MediaUploadProvider value={{ uploadFile }}>
        <MediaPlaceholderElementAny
          attributes={plateAttributes}
          children={null}
          editor={mockEditor as never}
          element={currentElement as never}
        />
      </MediaUploadProvider>,
    );

    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();

    const file = new File(["demo"], "spec.pdf", { type: "application/pdf" });
    fireEvent.change(input as HTMLInputElement, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(uploadFile).toHaveBeenCalled();
    });

    expect(mockEditor.tf.removeNodes).toHaveBeenCalledWith({ at: [3] });
    expect(mockEditor.tf.insertNodes).toHaveBeenCalledWith(
      expect.objectContaining({
        isUpload: true,
        name: "spec.pdf",
        placeholderId: "placeholder-1",
        type: "file",
        url: "https://cdn.example/spec.pdf",
        width: 720,
      }),
      { at: [3] },
    );
    expect(updateUploadHistoryMock).toHaveBeenCalled();
  });

  it("dispatches the library picker command from the media placeholder", async () => {
    const user = userEvent.setup();
    const openMediaInsert = vi.fn();

    currentElement = {
      autoOpen: false,
      children: [{ text: "" }],
      id: "placeholder-1",
      mediaType: "img",
      type: "placeholder",
    };
    mockEditor.api.findPath.mockReturnValue([4, 1]);

    render(
      <ArticleEditorCommandProvider
        value={{
          insertItem: vi.fn(),
          openMediaInsert,
        }}
      >
        <MediaUploadProvider value={{ uploadFile: vi.fn() }}>
          <MediaPlaceholderElementAny
            attributes={plateAttributes}
            children={null}
            editor={mockEditor as never}
            element={currentElement as never}
          />
        </MediaUploadProvider>
      </ArticleEditorCommandProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "CONTENT_LIBRARY_EDITOR_SELECT_FROM_LIBRARY" }),
    );

    expect(openMediaInsert).toHaveBeenCalledWith(mockEditor, {
      kind: "image",
      replacePath: [4, 1],
      source: "library",
    });
  });

  it("keeps the media caption input interactive while editing", async () => {
    currentElement = {
      caption: "",
      children: [{ text: "" }],
      id: "image-1",
      type: "img",
    };
    mockEditor.api.findPath.mockReturnValue([1]);
    const onEditingChange = vi.fn();

    render(
      <MediaCaption
        editing
        onEditingChange={onEditingChange}
        placeholder="CONTENT_LIBRARY_EDITOR_MEDIA_CAPTION_PLACEHOLDER"
      />,
    );

    const input = screen.getByPlaceholderText("CONTENT_LIBRARY_EDITOR_MEDIA_CAPTION_PLACEHOLDER");
    await waitFor(() => {
      expect(input).toHaveFocus();
    });

    fireEvent.change(input, { target: { value: "Caption copy" } });

    expect(mockEditor.tf.setNodes).toHaveBeenLastCalledWith(
      { caption: "Caption copy" },
      { at: [1] },
    );

    fireEvent.blur(input);
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });

  it("defers media caption node updates until IME composition commits", () => {
    currentElement = {
      caption: "",
      children: [{ text: "" }],
      id: "image-1",
      type: "img",
    };
    mockEditor.api.findPath.mockReturnValue([1]);

    render(
      <MediaCaption
        editing
        onEditingChange={vi.fn()}
        placeholder="CONTENT_LIBRARY_EDITOR_MEDIA_CAPTION_PLACEHOLDER"
      />,
    );

    const input = screen.getByPlaceholderText("CONTENT_LIBRARY_EDITOR_MEDIA_CAPTION_PLACEHOLDER");

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "ni" } });

    expect(mockEditor.tf.setNodes).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "你好" } });
    fireEvent.compositionEnd(input);

    expect(mockEditor.tf.setNodes).toHaveBeenLastCalledWith({ caption: "你好" }, { at: [1] });
  });

  it("does not restore the previous media selection after focus has moved to another block", async () => {
    const user = userEvent.setup();
    mockEditor.selection = {
      anchor: { offset: 0, path: [1] },
      focus: { offset: 0, path: [1] },
    };
    currentElement = {
      align: "center",
      id: "image-1",
      type: "img",
      url: "https://cdn.example/image.png",
    };

    render(
      <MediaToolbar compact supportsCaption url="https://cdn.example/image.png">
        <div>anchor</div>
      </MediaToolbar>,
    );

    mockEditor.selection = {
      anchor: { offset: 0, path: [3] },
      focus: { offset: 0, path: [3] },
    };

    await user.click(screen.getByLabelText("trigger-popover-close"));

    expect(mockEditor.tf.select).not.toHaveBeenCalled();
  });

  it("keeps the media overlay open for a selected video even when focus-last is false", () => {
    currentFocusedLast = false;
    currentElement = {
      align: "center",
      id: "video-1",
      type: "video",
      url: "https://cdn.example/video.mp4",
    };

    render(
      <MediaToolbar compact supportsCaption url="https://cdn.example/video.mp4">
        <div>anchor</div>
      </MediaToolbar>,
    );

    expect(screen.getByTestId("popover-root")).toHaveAttribute("data-open", "true");
  });

  it("isolates video playback clicks from toolbar activation without a dedicated video options trigger", () => {
    const parentMouseDown = vi.fn();
    const parentClick = vi.fn();

    currentElement = {
      children: [{ text: "" }],
      id: "video-1",
      type: "video",
      url: "https://cdn.example/video.mp4",
    };
    currentMediaState = {
      align: "center",
      embed: null,
      focused: false,
      isUpload: true,
      isVideo: false,
      isYoutube: false,
      selected: false,
      unsafeUrl: "https://cdn.example/video.mp4",
    };
    mockEditor.api.findPath.mockReturnValue([2]);

    render(
      <div onMouseDown={parentMouseDown} onClick={parentClick}>
        <VideoElementAny
          attributes={plateAttributes}
          children={null}
          editor={mockEditor as never}
          element={currentElement as never}
        />
      </div>,
    );

    const video = document.querySelector("video");
    expect(video).not.toBeNull();

    fireEvent.mouseDown(video as HTMLVideoElement);
    fireEvent.click(video as HTMLVideoElement);

    expect(parentMouseDown).not.toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
    expect(mockEditor.tf.select).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "CONTENT_LIBRARY_EDITOR_MEDIA_OPTIONS" }),
    ).not.toBeInTheDocument();
  });

  it("renders the compact equation editor popover for empty equations", () => {
    currentElement = {
      children: [{ text: "" }],
      id: "equation-1",
      texExpression: "",
      type: "equation",
    };

    render(
      <EquationElementAny
        attributes={plateAttributes}
        children={null}
        editor={mockEditor as never}
        element={currentElement as never}
      />,
    );

    expect(screen.getByText("CONTENT_LIBRARY_EDITOR_EQUATION_EMPTY")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("E = mc^2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common:CONFIRM" })).toBeInTheDocument();
  });
});
