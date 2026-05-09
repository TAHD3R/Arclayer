import type { PropsWithChildren, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentModelEditScreen } from "@/pages/projects/content/models/components/content-model-edit-screen";
import type { AdminContentModel } from "@arclayer/openapi/admin-types";
import { TooltipProvider } from "@arclayer/ui/tooltip";

const addContentModelFieldMock = vi.fn();
const buildContentModelFieldTypesQueryKeyMock = vi.fn((projectId: string) => [
  "content",
  "field-types",
  projectId,
]);
const deleteContentModelFieldMock = vi.fn();
const getContentModelFieldTypeRegistryMock = vi.fn();
const listAllContentModelsMock = vi.fn();
const reorderContentModelFieldsMock = vi.fn();
const updateContentModelFieldMock = vi.fn();

vi.mock("@/api/content", () => ({
  addContentModelField: (...args: unknown[]) => addContentModelFieldMock(...args),
  buildContentModelFieldTypesQueryKey: (...args: [string]) =>
    buildContentModelFieldTypesQueryKeyMock(...args),
  deleteContentModelField: (...args: unknown[]) => deleteContentModelFieldMock(...args),
  getContentModelFieldTypeRegistry: (...args: unknown[]) =>
    getContentModelFieldTypeRegistryMock(...args),
  listAllContentModels: (...args: unknown[]) => listAllContentModelsMock(...args),
  reorderContentModelFields: (...args: unknown[]) => reorderContentModelFieldsMock(...args),
  updateContentModelField: (...args: unknown[]) => updateContentModelFieldMock(...args),
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

vi.mock("@/components/layout/admin-side-nav/admin-sider-nav", () => ({
  AdminSiderNav: ({
    items,
  }: {
    items: Array<{
      key: string;
      label: string;
      isActive?: boolean;
      onAction?: () => void;
    }>;
  }) => (
    <nav>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-current={item.isActive ? "page" : undefined}
          onClick={item.onAction}
        >
          {item.label}
        </button>
      ))}
    </nav>
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
        <TooltipProvider>{children}</TooltipProvider>
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

const FIELD_TYPE_CONFIG_SMOKE_CASES = [
  ["CONTENT_MODELS_FIELD_TYPE_SHORT_TEXT_LABEL", [], true, true, false, false, true, true, false],
  ["CONTENT_MODELS_FIELD_TYPE_RICH_TEXT_LABEL", [], true, false, false, false, false, true, false],
  ["CONTENT_MODELS_FIELD_TYPE_MARKDOWN_LABEL", [], true, false, false, false, false, true, false],
  ["CONTENT_MODELS_FIELD_TYPE_SLUG_LABEL", [], true, true, false, false, true, true, false],
  ["CONTENT_MODELS_FIELD_TYPE_EMAIL_LABEL", [], true, true, false, false, true, true, false],
  ["CONTENT_MODELS_FIELD_TYPE_PASSWORD_LABEL", [], true, false, false, false, false, false, false],
  [
    "CONTENT_MODELS_FIELD_TYPE_NUMBER_LABEL",
    ["CONTENT_MODELS_FIELD_CONFIG_NUMBER_VARIANT_LABEL"],
    true,
    false,
    true,
    false,
    true,
    true,
    false,
  ],
  [
    "CONTENT_MODELS_FIELD_TYPE_ENUMERATION_LABEL",
    ["CONTENT_MODELS_FIELD_CONFIG_ENUM_OPTIONS_LABEL"],
    true,
    false,
    false,
    false,
    true,
    true,
    false,
  ],
  [
    "CONTENT_MODELS_FIELD_TYPE_DATE_TIME_LABEL",
    ["CONTENT_MODELS_FIELD_CONFIG_DATE_VARIANT_LABEL"],
    true,
    false,
    false,
    false,
    true,
    true,
    false,
  ],
  [
    "CONTENT_MODELS_FIELD_TYPE_MEDIA_LABEL",
    [
      "CONTENT_MODELS_FIELD_CONFIG_MEDIA_MODE_LABEL",
      "CONTENT_MODELS_FIELD_CONFIG_MEDIA_KIND_LABEL",
      "CONTENT_MODELS_FIELD_CONFIG_MEDIA_KIND_IMAGE",
      "CONTENT_MODELS_FIELD_CONFIG_MEDIA_KIND_VIDEO",
      "CONTENT_MODELS_FIELD_CONFIG_MEDIA_KIND_FILE",
    ],
    false,
    false,
    false,
    false,
    false,
    true,
    false,
  ],
  ["CONTENT_MODELS_FIELD_TYPE_LOCATION_LABEL", [], false, false, false, false, false, true, false],
  [
    "CONTENT_MODELS_FIELD_TYPE_BOOLEAN_LABEL",
    ["CONTENT_MODELS_FIELD_CONFIG_BOOLEAN_DEFAULT_LABEL"],
    false,
    false,
    false,
    false,
    true,
    false,
    false,
  ],
  [
    "CONTENT_MODELS_FIELD_TYPE_JSON_OBJECT_LABEL",
    [],
    false,
    false,
    false,
    false,
    true,
    true,
    false,
  ],
  [
    "CONTENT_MODELS_FIELD_TYPE_REFERENCE_LABEL",
    [
      "CONTENT_MODELS_FIELD_CONFIG_REFERENCE_MODE_LABEL",
      "CONTENT_MODELS_FIELD_CONFIG_REFERENCE_TARGET_LABEL",
    ],
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ],
  [
    "CONTENT_MODELS_FIELD_TYPE_COMPONENT_LABEL",
    [
      "CONTENT_MODELS_FIELD_CONFIG_COMPONENT_TARGET_LABEL",
      "CONTENT_MODELS_FIELD_CONFIG_COMPONENT_MODE_LABEL",
    ],
    false,
    false,
    false,
    false,
    false,
    false,
    true,
  ],
  [
    "CONTENT_MODELS_FIELD_TYPE_DYNAMIC_ZONE_LABEL",
    ["CONTENT_MODELS_FIELD_CONFIG_DYNAMIC_ZONE_COMPONENTS_LABEL"],
    false,
    false,
    false,
    true,
    false,
    false,
    false,
  ],
  ["CONTENT_MODELS_FIELD_TYPE_BLOCKS_LABEL", [], true, false, false, false, true, true, false],
] as const;

const FIELD_TYPE_VARIANT_CONFIG_SMOKE_CASES = [
  [
    "CONTENT_MODELS_FIELD_TYPE_NUMBER_LABEL",
    "CONTENT_MODELS_FIELD_TYPE_DECIMAL_LABEL",
    [
      "CONTENT_MODELS_FIELD_CONFIG_NUMBER_VARIANT_LABEL",
      "CONTENT_MODELS_FIELD_CONFIG_DECIMAL_PLACES_LABEL",
    ],
    [
      "CONTENT_MODELS_FIELD_CONFIG_NUMBER_MIN_LABEL",
      "CONTENT_MODELS_FIELD_CONFIG_NUMBER_MAX_LABEL",
    ],
    ["CONTENT_MODELS_FIELD_CONFIG_MIN_LENGTH_LABEL"],
  ],
  [
    "CONTENT_MODELS_FIELD_TYPE_NUMBER_LABEL",
    "CONTENT_MODELS_FIELD_TYPE_BIGINTEGER_LABEL",
    ["CONTENT_MODELS_FIELD_CONFIG_NUMBER_VARIANT_LABEL"],
    [
      "CONTENT_MODELS_FIELD_CONFIG_NUMBER_MIN_LABEL",
      "CONTENT_MODELS_FIELD_CONFIG_NUMBER_MAX_LABEL",
    ],
    [
      "CONTENT_MODELS_FIELD_CONFIG_DECIMAL_PLACES_LABEL",
      "CONTENT_MODELS_FIELD_CONFIG_MIN_LENGTH_LABEL",
    ],
  ],
  [
    "CONTENT_MODELS_FIELD_TYPE_DATE_TIME_LABEL",
    "CONTENT_MODELS_FIELD_TYPE_DATE_LABEL",
    ["CONTENT_MODELS_FIELD_CONFIG_DATE_VARIANT_LABEL"],
    ["CONTENT_MODELS_FIELD_CONFIG_DEFAULT_VALUE_LABEL"],
    [
      "CONTENT_MODELS_FIELD_CONFIG_NUMBER_MIN_LABEL",
      "CONTENT_MODELS_FIELD_CONFIG_MIN_LENGTH_LABEL",
    ],
  ],
  [
    "CONTENT_MODELS_FIELD_TYPE_DATE_TIME_LABEL",
    "CONTENT_MODELS_FIELD_TYPE_TIME_LABEL",
    ["CONTENT_MODELS_FIELD_CONFIG_DATE_VARIANT_LABEL"],
    ["CONTENT_MODELS_FIELD_CONFIG_DEFAULT_VALUE_LABEL"],
    [
      "CONTENT_MODELS_FIELD_CONFIG_NUMBER_MIN_LABEL",
      "CONTENT_MODELS_FIELD_CONFIG_MIN_LENGTH_LABEL",
    ],
  ],
] as const;

describe("content model edit screen", () => {
  beforeEach(() => {
    addContentModelFieldMock.mockReset();
    buildContentModelFieldTypesQueryKeyMock.mockClear();
    deleteContentModelFieldMock.mockReset();
    getContentModelFieldTypeRegistryMock.mockReset();
    listAllContentModelsMock.mockReset();
    reorderContentModelFieldsMock.mockReset();
    updateContentModelFieldMock.mockReset();
    getContentModelFieldTypeRegistryMock.mockResolvedValue({ groups: [], types: [] });
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
      screen.queryByRole("button", { name: "CONTENT_MODELS_EDIT_TAB_FIELDS" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CONTENT_MODELS_EDIT_TAB_SETTINGS" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "CONTENT_MODELS_EDIT_TAB_FIELDS" }),
    ).not.toBeInTheDocument();
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

  test("opens the grouped field type picker with consolidated variants", async () => {
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
    const pickerDialog = screen.getByRole("dialog");
    expect(pickerDialog).toHaveClass("sm:h-[min(52rem,calc(100dvh-2rem))]");
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
    ).not.toHaveClass("h-full");
    expect(
      screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_MARKDOWN_LABEL" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_DECIMAL_LABEL" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_BIGINTEGER_LABEL" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_DATE_LABEL" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_TIME_LABEL" }),
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
    expect(
      screen.getByRole("button", { name: /CONTENT_MODELS_FIELD_CONFIG_TAB_BASIC/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.queryByRole("tab", { name: "CONTENT_MODELS_FIELD_CONFIG_TAB_BASIC" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /CONTENT_MODELS_FIELD_CONFIG_TAB_ADVANCED/ }),
    );
    expect(addContentModelFieldMock).not.toHaveBeenCalled();
    expect(
      screen.queryByLabelText("CONTENT_MODELS_FIELD_CONFIG_DEFAULT_VALUE_LABEL"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("CONTENT_MODELS_FIELD_CONFIG_SETTINGS_GROUP_TITLE"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /CONTENT_MODELS_FIELD_CONFIG_TAB_BASIC/ }));
    expect(addContentModelFieldMock).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_REFERENCE_TARGET_LABEL"));
    await waitFor(() => {
      expect(screen.getAllByText("Author profile").length).toBeGreaterThan(1);
    });
    const authorProfileOptions = screen.getAllByText("Author profile");
    fireEvent.click(authorProfileOptions[authorProfileOptions.length - 1]);

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
    expect(
      screen.queryByRole("button", { name: "CONTENT_MODELS_EDIT_SAVE_ACTION" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /CONTENT_MODELS_EDIT_TAB_FIELDS/ }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /CONTENT_MODELS_EDIT_TAB_NAME_DESCRIPTION/ }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /CONTENT_MODELS_EDIT_TAB_JSON_PREVIEW/ }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /CONTENT_MODELS_EDIT_TAB_SETTINGS/ }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /CONTENT_MODELS_EDIT_TAB_WORKFLOW/ }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("tab", { name: "CONTENT_MODELS_EDIT_TAB_FIELDS" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_MODELS_FIELD_TYPE_SHORT_TEXT_LABEL")).toBeInTheDocument();
    expect(
      screen.queryByText("content:CONTENT_MODELS_FIELDS_TABLE_COL_LOCALIZATION"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "content:CONTENT_MODELS_FIELD_ROW_EDIT_ACTION" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "content:CONTENT_MODELS_FIELDS_ADD_ACTION" }),
    ).toBeInTheDocument();
  });

  test("shows the readonly model API ID in name and description", () => {
    render(
      <ContentModelEditScreen
        projectId="project-1"
        model={buildModel({
          singularKey: "articleModel",
          fieldSchema: {
            title: {
              label: "Title",
              scalar: "text",
              required: true,
              config: { kind: "short_text" },
            },
          },
        })}
        section="name_description"
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

    const apiIdInput = screen.getByLabelText("CONTENT_MODELS_DETAILS_API_ID_LABEL");

    expect(apiIdInput).toHaveValue("articleModel");
    expect(apiIdInput).toHaveAttribute("readonly");
    expect(apiIdInput).toBeDisabled();
  });

  test("keeps date variants configurable when editing an existing date field", async () => {
    const updatedModel = buildModel({
      fieldSchema: {
        publishAt: {
          label: "Publish at",
          scalar: "date_time",
          required: false,
          config: {
            kind: "time",
            localizable: false,
          },
        },
      },
    });
    updateContentModelFieldMock.mockResolvedValue(updatedModel);
    const onModelChange = vi.fn();

    render(
      <ContentModelEditScreen
        projectId="project-1"
        model={buildModel({
          fieldSchema: {
            publishAt: {
              label: "Publish at",
              scalar: "date_time",
              required: false,
              config: {
                kind: "date",
                localizable: false,
              },
            },
          },
        })}
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

    fireEvent.click(
      screen.getByRole("button", { name: "content:CONTENT_MODELS_FIELD_ROW_EDIT_ACTION" }),
    );

    expect(screen.getByText("CONTENT_MODELS_FIELD_CONFIG_DATE_VARIANT_LABEL")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("CONTENT_MODELS_FIELD_TYPE_TIME_LABEL"));
    expect(screen.getByText("CONTENT_MODELS_FIELD_CONFIG_DATE_VARIANT_LABEL")).toBeInTheDocument();
    expect(updateContentModelFieldMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_CONFIG_SAVE" }));

    await waitFor(() => {
      expect(updateContentModelFieldMock).toHaveBeenCalledWith(
        "project-1",
        "model-1",
        "publishAt",
        {
          label: "Publish at",
          scalar: "date_time",
          required: false,
          config: {
            kind: "time",
            localizable: false,
          },
        },
      );
    });
    expect(onModelChange).toHaveBeenCalledWith(updatedModel);
  });

  test("submits repeatable component bounds when configured", async () => {
    listAllContentModelsMock.mockResolvedValue([
      buildModel(),
      buildModel({
        id: "component-1",
        singularKey: "seoBlock",
        pluralKey: "seoBlocks",
        name: "SEO block",
        modelKind: "component",
      }),
    ]);
    addContentModelFieldMock.mockResolvedValue(buildModel());

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

    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELDS_EMPTY_ACTION" }));
    fireEvent.click(
      screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_COMPONENT_LABEL" }),
    );
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_NAME_LABEL"), {
      target: { value: "SEO Blocks" },
    });
    await waitFor(() => {
      expect(
        screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_COMPONENT_TARGET_LABEL"),
      ).not.toBeDisabled();
    });
    fireEvent.click(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_COMPONENT_TARGET_LABEL"));
    await waitFor(() => {
      expect(screen.getAllByText("SEO block").length).toBeGreaterThan(1);
    });
    const seoBlockOptions = screen.getAllByText("SEO block");
    fireEvent.click(seoBlockOptions[seoBlockOptions.length - 1]);
    fireEvent.click(screen.getByText("CONTENT_MODELS_FIELD_CONFIG_COMPONENT_MODE_REPEATABLE"));
    fireEvent.click(
      screen.getByRole("button", { name: /CONTENT_MODELS_FIELD_CONFIG_TAB_ADVANCED/ }),
    );
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_COMPONENT_MIN_LABEL"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_COMPONENT_MAX_LABEL"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_CONFIG_SUBMIT" }));

    await waitFor(() => {
      expect(addContentModelFieldMock).toHaveBeenCalledWith("project-1", "model-1", {
        key: "seoBlocks",
        label: "SEO Blocks",
        scalar: "json",
        required: false,
        config: {
          kind: "component",
          localizable: false,
          targetComponentKey: "seoBlock",
          repeatable: true,
          min: 1,
          max: 3,
        },
      });
    });
  });

  test("submits decimal places when configured", async () => {
    addContentModelFieldMock.mockResolvedValue(buildModel());

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

    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELDS_EMPTY_ACTION" }));
    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_NUMBER_LABEL" }));
    fireEvent.click(screen.getByText("CONTENT_MODELS_FIELD_TYPE_DECIMAL_LABEL"));
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_NAME_LABEL"), {
      target: { value: "Price" },
    });
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_DECIMAL_PLACES_LABEL"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_CONFIG_SUBMIT" }));

    await waitFor(() => {
      expect(addContentModelFieldMock).toHaveBeenCalledWith("project-1", "model-1", {
        key: "price",
        label: "Price",
        scalar: "number",
        required: false,
        config: {
          kind: "decimal",
          localizable: true,
          decimalPlaces: 3,
        },
      });
    });
  });

  test("submits blocks configuration when configured", async () => {
    addContentModelFieldMock.mockResolvedValue(buildModel());

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

    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELDS_EMPTY_ACTION" }));
    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_TYPE_BLOCKS_LABEL" }));
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_NAME_LABEL"), {
      target: { value: "Page Blocks" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /CONTENT_MODELS_FIELD_CONFIG_TAB_ADVANCED/ }),
    );
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_BLOCKS_ALLOWED_LABEL"), {
      target: { value: "heroBlock\nquoteBlock" },
    });
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_BLOCKS_MIN_LABEL"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_BLOCKS_MAX_LABEL"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_CONFIG_SUBMIT" }));

    await waitFor(() => {
      expect(addContentModelFieldMock).toHaveBeenCalledWith("project-1", "model-1", {
        key: "pageBlocks",
        label: "Page Blocks",
        scalar: "json",
        required: false,
        config: {
          kind: "blocks",
          localizable: true,
          allowedBlocks: ["heroBlock", "quoteBlock"],
          min: 1,
          max: 3,
        },
      });
    });
  });

  test.each(FIELD_TYPE_CONFIG_SMOKE_CASES)(
    "shows type-specific config controls for %s",
    async (
      label,
      basicLabels,
      hasDefaultValue,
      hasTextValidation,
      hasNumberValidation,
      hasDynamicZoneBounds,
      hasUniqueSetting,
      hasLocalizableSetting,
      hasComponentBounds,
    ) => {
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

      fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELDS_EMPTY_ACTION" }));
      fireEvent.click(screen.getByRole("button", { name: label }));

      expect(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_NAME_LABEL")).toBeInTheDocument();
      expect(screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_KEY_LABEL")).toHaveAttribute(
        "placeholder",
        "CONTENT_MODELS_FIELD_CONFIG_KEY_PLACEHOLDER",
      );
      for (const basicLabel of basicLabels) {
        expect(screen.getByText(basicLabel)).toBeInTheDocument();
      }

      fireEvent.click(
        screen.getByRole("button", { name: /CONTENT_MODELS_FIELD_CONFIG_TAB_ADVANCED/ }),
      );

      expect(addContentModelFieldMock).not.toHaveBeenCalled();
      expect(
        screen.getByText("CONTENT_MODELS_FIELD_CONFIG_SETTINGS_GROUP_TITLE"),
      ).toBeInTheDocument();
      expect(screen.getByText("CONTENT_MODELS_FIELD_CONFIG_CONDITION_LABEL")).toBeInTheDocument();
      expect(
        screen.queryByText("CONTENT_MODELS_FIELD_CONFIG_CONDITION_UNAVAILABLE"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "CONTENT_MODELS_FIELD_CONFIG_CONDITION_APPLY" }),
      ).toBeDisabled();

      const defaultValueControl = screen.queryByLabelText(
        "CONTENT_MODELS_FIELD_CONFIG_DEFAULT_VALUE_LABEL",
      );
      if (hasDefaultValue) {
        expect(defaultValueControl).toBeInTheDocument();
      } else {
        expect(defaultValueControl).not.toBeInTheDocument();
      }

      const regexControl = screen.queryByLabelText("CONTENT_MODELS_FIELD_CONFIG_REGEX_LABEL");
      if (hasTextValidation) {
        expect(regexControl).toBeInTheDocument();
        expect(
          screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_MIN_LENGTH_LABEL"),
        ).toBeInTheDocument();
        expect(
          screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_MAX_LENGTH_LABEL"),
        ).toBeInTheDocument();
      } else {
        expect(regexControl).not.toBeInTheDocument();
      }

      const numberMinControl = screen.queryByLabelText(
        "CONTENT_MODELS_FIELD_CONFIG_NUMBER_MIN_LABEL",
      );
      if (hasNumberValidation) {
        expect(numberMinControl).toBeInTheDocument();
        expect(
          screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_NUMBER_MAX_LABEL"),
        ).toBeInTheDocument();
      } else {
        expect(numberMinControl).not.toBeInTheDocument();
      }

      const dynamicZoneMinControl = screen.queryByLabelText(
        "CONTENT_MODELS_FIELD_CONFIG_DYNAMIC_ZONE_MIN_LABEL",
      );
      if (hasDynamicZoneBounds) {
        expect(dynamicZoneMinControl).toBeInTheDocument();
        expect(
          screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_DYNAMIC_ZONE_MAX_LABEL"),
        ).toBeInTheDocument();
      } else {
        expect(dynamicZoneMinControl).not.toBeInTheDocument();
      }

      const componentMinControl = screen.queryByLabelText(
        "CONTENT_MODELS_FIELD_CONFIG_COMPONENT_MIN_LABEL",
      );
      if (hasComponentBounds) {
        fireEvent.click(
          screen.getByRole("button", { name: /CONTENT_MODELS_FIELD_CONFIG_TAB_BASIC/ }),
        );
        fireEvent.click(screen.getByText("CONTENT_MODELS_FIELD_CONFIG_COMPONENT_MODE_REPEATABLE"));
        fireEvent.click(
          screen.getByRole("button", { name: /CONTENT_MODELS_FIELD_CONFIG_TAB_ADVANCED/ }),
        );
        expect(
          screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_COMPONENT_MIN_LABEL"),
        ).toBeInTheDocument();
        expect(
          screen.getByLabelText("CONTENT_MODELS_FIELD_CONFIG_COMPONENT_MAX_LABEL"),
        ).toBeInTheDocument();
      } else {
        expect(componentMinControl).not.toBeInTheDocument();
      }

      const uniqueToggle = screen.queryByText("CONTENT_MODELS_FIELD_CONFIG_UNIQUE_LABEL");
      if (hasUniqueSetting) {
        expect(uniqueToggle).toBeInTheDocument();
      } else {
        expect(uniqueToggle).not.toBeInTheDocument();
      }

      const localizableToggle = screen.queryByText("CONTENT_MODELS_FIELD_CONFIG_LOCALIZED_LABEL");
      if (hasLocalizableSetting) {
        expect(localizableToggle).toBeInTheDocument();
      } else {
        expect(localizableToggle).not.toBeInTheDocument();
      }
    },
  );

  test.each(FIELD_TYPE_VARIANT_CONFIG_SMOKE_CASES)(
    "shows variant-specific config controls for %s -> %s",
    async (parentLabel, variantLabel, basicLabels, advancedLabels, absentLabels) => {
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

      fireEvent.click(screen.getByRole("button", { name: "CONTENT_MODELS_FIELDS_EMPTY_ACTION" }));
      fireEvent.click(screen.getByRole("button", { name: parentLabel }));
      fireEvent.click(screen.getByText(variantLabel));

      for (const basicLabel of basicLabels) {
        expect(screen.getByText(basicLabel)).toBeInTheDocument();
      }

      fireEvent.click(
        screen.getByRole("button", { name: /CONTENT_MODELS_FIELD_CONFIG_TAB_ADVANCED/ }),
      );

      for (const advancedLabel of advancedLabels) {
        expect(screen.getByText(advancedLabel)).toBeInTheDocument();
      }
      for (const absentLabel of absentLabels) {
        expect(screen.queryByText(absentLabel)).not.toBeInTheDocument();
      }
    },
  );
});
