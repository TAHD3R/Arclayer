import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  ContentLibraryItemSettingsDialogs,
  type ContentLibraryItemSettingsDialogState,
} from "@/pages/workspaces/content/library/components/content-library-item-settings-dialogs";

const mocked = vi.hoisted(() => ({
  patchContentItemVersion: vi.fn(),
  saveContentItemDraftVersion: vi.fn(),
  loadContentLibraryArticleEditorSnapshot: vi.fn(),
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/api/content", () => ({
  patchContentItemVersion: (...args: unknown[]) => mocked.patchContentItemVersion(...args),
  saveContentItemDraftVersion: (...args: unknown[]) => mocked.saveContentItemDraftVersion(...args),
}));

vi.mock("@/pages/workspaces/content/library/article-editor/hooks/api", () => ({
  loadContentLibraryArticleEditorSnapshot: (...args: unknown[]) =>
    mocked.loadContentLibraryArticleEditorSnapshot(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: (...args: unknown[]) => mocked.notifyError(...args),
  notifySuccessText: (...args: unknown[]) => mocked.notifySuccessText(...args),
}));

vi.mock("@arclayer/ui/setting-dialog", () => ({
  SettingDialog: (props: {
    open: boolean;
    title?: string;
    description?: string;
    children?: ReactNode;
    footer?: ReactNode;
  }) =>
    props.open ? (
      <div>
        <div>{props.title}</div>
        <div>{props.description}</div>
        <div>{props.children}</div>
        <div>{props.footer}</div>
      </div>
    ) : null,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper(props: { children?: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>;
  };
}

function buildState(kind: NonNullable<ContentLibraryItemSettingsDialogState>["kind"]) {
  return {
    kind,
    row: {
      id: "content-1",
      workspaceId: "ws-1",
      siteId: "site-1",
      modelId: "model-1",
      modelKey: "landing-page",
      modelName: "Page",
      title: "Homepage",
      name: "Homepage",
      slug: "homepage",
      status: "draft",
      derivedStatus: "draft",
      visibility: "public",
      locale: "en-US",
      bootstrapPresetState: "selected",
      draftVersion: 1,
      publishedVersion: null,
      updatedAt: "2026-04-09T00:00:00Z",
      role: "page",
      editWith: "canvas",
      runtime: "visual",
      context: "content_library",
      libraryGroup: "site-content",
      summary: "Homepage summary",
      capabilityPackIds: ["publishable", "routable", "seo_managed"],
      modelCapabilities: ["publishable", "routable", "seo_managed"],
    },
  } satisfies NonNullable<ContentLibraryItemSettingsDialogState>;
}

describe("content-library-item-settings-dialogs", () => {
  beforeEach(() => {
    mocked.patchContentItemVersion.mockReset();
    mocked.saveContentItemDraftVersion.mockReset();
    mocked.loadContentLibraryArticleEditorSnapshot.mockReset();
    mocked.notifyError.mockReset();
    mocked.notifySuccessText.mockReset();

    mocked.loadContentLibraryArticleEditorSnapshot.mockResolvedValue({
      item: {
        id: "content-1",
        workspaceId: "ws-1",
        siteId: "site-1",
        modelId: "model-1",
        modelKey: "landing-page",
        slug: "homepage",
        title: "Homepage",
        status: "draft",
        visibility: "public",
        locale: "en-US",
        bootstrapPresetState: "selected",
        capabilityPackIds: ["publishable", "routable", "seo_managed"],
        draftVersion: 1,
        publishedVersion: null,
        updatedAt: "2026-04-09T00:00:00Z",
      },
      draftVersion: {
        itemId: "content-1",
        versionNumber: 1,
        state: "draft",
        createdAt: "2026-04-09T00:00:00Z",
        fieldsSnapshot: {
          title: "Homepage",
          summary: "Homepage summary",
          slug: "homepage",
          visibility: "public",
        },
        presentations: [],
        changeSummary: null,
      },
      publishedVersion: null,
      bodyPresentation: null,
    });
  });

  test("uses the shared confirm copy instead of save in item settings dialogs", async () => {
    render(
      <ContentLibraryItemSettingsDialogs state={buildState("page-settings")} onClose={vi.fn()} />,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByText("CONTENT_LIBRARY_DIALOG_PAGE_SETTINGS_TITLE")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "common:CANCEL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common:CONFIRM" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "common:SAVE" })).not.toBeInTheDocument();
  });

  test("renders field-level help text for seo and page settings dialogs", async () => {
    const { rerender } = render(
      <ContentLibraryItemSettingsDialogs state={buildState("seo")} onClose={vi.fn()} />,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByText("CONTENT_LIBRARY_DIALOG_SEO_FIELD_TITLE_HELP")).toBeInTheDocument();
    });

    expect(
      screen.getByText("CONTENT_LIBRARY_DIALOG_SEO_FIELD_DESCRIPTION_HELP"),
    ).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_DIALOG_SEO_FIELD_CANONICAL_HELP")).toBeInTheDocument();

    rerender(
      <ContentLibraryItemSettingsDialogs state={buildState("page-settings")} onClose={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText("CONTENT_LIBRARY_DIALOG_FIELD_TITLE_HELP")).toBeInTheDocument();
    });

    expect(screen.getByText("CONTENT_LIBRARY_DIALOG_FIELD_SUMMARY_HELP")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_DIALOG_FIELD_VISIBILITY_HELP")).toBeInTheDocument();
  });
});
