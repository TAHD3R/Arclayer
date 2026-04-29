import type { PropsWithChildren, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentModelEditScreen } from "@/pages/projects/content/models/components/content-model-edit-screen";
import type { AdminContentModel } from "@/types/api";
import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";

const addContentModelFieldMock = vi.fn();
const deleteContentModelFieldMock = vi.fn();
const listAllContentModelsMock = vi.fn();
const reorderContentModelFieldsMock = vi.fn();

vi.mock("@/api/content", () => ({
  addContentModelField: (...args: unknown[]) => addContentModelFieldMock(...args),
  deleteContentModelField: (...args: unknown[]) => deleteContentModelFieldMock(...args),
  listAllContentModels: (...args: unknown[]) => listAllContentModelsMock(...args),
  reorderContentModelFields: (...args: unknown[]) => reorderContentModelFieldsMock(...args),
}));

vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifyErrorText: vi.fn(),
  notifyInfoText: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    description,
    afterFavorite,
    action,
    extra,
    children,
  }: PropsWithChildren<{
    title: ReactNode;
    description?: ReactNode;
    afterFavorite?: ReactNode;
    action?: ReactNode;
    extra?: ReactNode;
  }>) => (
    <div>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {afterFavorite}
      {action}
      {extra}
      {children}
    </div>
  ),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <ChromeTabsProvider
          labels={{
            scrollLeftAriaLabel: "scroll left",
            scrollRightAriaLabel: "scroll right",
          }}
        >
          {children}
        </ChromeTabsProvider>
      </QueryClientProvider>
    );
  };
}

function buildModel(overrides: Partial<AdminContentModel> = {}): AdminContentModel {
  return {
    id: "model-1",
    workspaceId: "workspace-1",
    siteId: "site-1",
    singularKey: "article",
    pluralKey: "articles",
    name: "Article",
    description: "Article model",
    category: "custom",
    modelKind: "collection_type",
    capabilities: ["queryable"],
    defaultEditor: "form",
    draftContractRevision: 1,
    updatedAt: "2026-04-28T00:00:00Z",
    updatedByUserId: null,
    updatedBy: null,
    ...overrides,
  };
}

describe("content model edit screen", () => {
  beforeEach(() => {
    addContentModelFieldMock.mockReset();
    deleteContentModelFieldMock.mockReset();
    listAllContentModelsMock.mockReset();
    reorderContentModelFieldsMock.mockReset();
    listAllContentModelsMock.mockResolvedValue([]);
  });

  test("renders empty state actions and lets editors defer field setup", () => {
    const onClose = vi.fn();

    render(
      <ContentModelEditScreen
        projectId="project-1"
        model={buildModel()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onModelChange={vi.fn()}
        onRefreshModels={vi.fn()}
        onClose={onClose}
      />,
      {
        wrapper: createWrapper(),
      },
    );

    expect(screen.getByText("CONTENT_MODELS_FIELDS_EMPTY_TITLE")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_MODELS_FIELDS_EMPTY_ACTION" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_MODELS_FIELDS_EMPTY_SECONDARY_ACTION" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "CONTENT_MODELS_FIELDS_EMPTY_SECONDARY_ACTION" }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("opens the grouped field type picker without the markdown card", async () => {
    render(
      <ContentModelEditScreen
        projectId="project-1"
        model={buildModel()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onModelChange={vi.fn()}
        onRefreshModels={vi.fn()}
        onClose={vi.fn()}
      />,
      {
        wrapper: createWrapper(),
      },
    );

    expect(screen.getByText("CONTENT_MODELS_FIELDS_EMPTY_TITLE")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELDS_EMPTY_ACTION" }));

    expect(screen.getByText("CONTENT_MODELS_FIELD_TYPE_PICKER_TITLE")).toBeInTheDocument();
    expect(screen.queryByText("CONTENT_MODELS_FIELD_TYPE_PICKER_DESC")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CONTENT_MODELS_CANCEL_ACTION" }),
    ).not.toBeInTheDocument();
    const textGroupHeading = screen.getByText("CONTENT_MODELS_FIELD_TYPE_GROUP_TEXT_LABEL");

    expect(textGroupHeading).toBeInTheDocument();
    expect(textGroupHeading.parentElement).not.toHaveClass("ml-2");
    expect(
      screen.getByText("CONTENT_MODELS_FIELD_TYPE_GROUP_VALUE_LOGIC_LABEL"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("CONTENT_MODELS_FIELD_TYPE_GROUP_TIME_MEDIA_LABEL"),
    ).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_FIELD_TYPE_GROUP_STRUCTURE_LABEL")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_RICH_TEXT_LABEL" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_MARKDOWN_LABEL" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_SLUG_LABEL" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_ENUMERATION_LABEL" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_LOCATION_LABEL" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_COMPONENT_LABEL" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_REFERENCE_LABEL" }),
    ).toBeInTheDocument();
  });

  test("creates a reference field from the two-step dialog flow", async () => {
    listAllContentModelsMock.mockResolvedValue([
      buildModel(),
      buildModel({
        id: "model-2",
        singularKey: "authorProfile",
        pluralKey: "authorProfiles",
        name: "Author profile",
      }),
    ]);

    const createdModel = buildModel({
      fieldSchema: {
        heroImage: {
          label: "Hero Image",
          scalar: "json",
          required: false,
          config: {
            kind: "reference",
            localizable: false,
            referenceMode: "single",
            targetModelKey: "authorProfile",
          },
        },
      },
    });
    addContentModelFieldMock.mockResolvedValue(createdModel);
    const onModelChange = vi.fn();

    render(
      <ContentModelEditScreen
        projectId="project-1"
        model={buildModel()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onModelChange={onModelChange}
        onRefreshModels={vi.fn()}
        onClose={vi.fn()}
      />,
      {
        wrapper: createWrapper(),
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELDS_EMPTY_ACTION" }));
    fireEvent.click(
      screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_REFERENCE_LABEL" }),
    );

    expect(screen.getAllByText("CONTENT_MODELS_FIELD_TYPE_REFERENCE_DESC")).not.toHaveLength(0);
    expect(
      screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_DESCRIPTION_OPTIONAL_LABEL"),
    ).toBeInTheDocument();
    expect(screen.queryByText("CONTENT_MODELS_FIELD_CONFIG_KEY_DESC")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CONTENT_MODELS_CANCEL_ACTION" }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_NAME_LABEL"), {
      target: { value: "Hero Image" },
    });
    expect(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_KEY_LABEL")).toHaveValue("heroImage");
    await waitFor(() => {
      expect(
        screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_REFERENCE_TARGET_LABEL"),
      ).not.toBeDisabled();
    });
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_REFERENCE_TARGET_LABEL"), {
      target: { value: "authorProfile" },
    });

    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_CONFIG_SUBMIT" }));

    await waitFor(() => {
      expect(addContentModelFieldMock).toHaveBeenCalledWith("project-1", "model-1", {
        key: "heroImage",
        label: "Hero Image",
        scalar: "json",
        required: false,
        config: {
          kind: "reference",
          localizable: false,
          referenceMode: "single",
          targetModelKey: "authorProfile",
        },
      });
    });
    expect(onModelChange).toHaveBeenCalledWith(createdModel);
  });

  test("renders the model title, copy ID action, and fields table once fields exist", () => {
    render(
      <ContentModelEditScreen
        projectId="project-1"
        model={buildModel({
          fieldSchema: {
            title: {
              label: "Title",
              scalar: "text",
              required: true,
              config: {
                kind: "short_text",
                localizable: true,
              },
            },
          },
        })}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onModelChange={vi.fn()}
        onRefreshModels={vi.fn()}
        onClose={vi.fn()}
      />,
      {
        wrapper: createWrapper(),
      },
    );

    expect(screen.getByRole("heading", { level: 1, name: "Article" })).toBeInTheDocument();
    expect(screen.getByText("Article model")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_MODELS_COPY_ID_ACTION" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CONTENT_MODELS_EDIT_SAVE_ACTION" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "CONTENT_MODELS_EDIT_TAB_FIELDS" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "CONTENT_MODELS_EDIT_TAB_SETTINGS" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_FIELD_TYPE_SHORT_TEXT_LABEL")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "content:CONTENT_MODELS_FIELD_ROW_EDIT_ACTION" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "content:CONTENT_MODELS_FIELDS_ADD_ACTION" }),
    ).toBeInTheDocument();
  });
});
