import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@arclayer/web/http";

import type { MailTemplate, MailTemplateGroup } from "@/api/mail";
import { EmailTemplateManager } from "@/pages/system/email/email-template-manager";

const {
  createMailTemplateMock,
  deleteMailTemplateMock,
  getMailTemplateMock,
  getMailTemplateRevisionMock,
  listMailTemplatesMock,
  listMailTemplateHistoryMock,
  notifyErrorMock,
  notifySuccessTextMock,
  previewMailTemplateMock,
  restoreDefaultMailTemplateMock,
  testSendMailTemplateMock,
  updateMailTemplateMock,
} = vi.hoisted(() => ({
  createMailTemplateMock: vi.fn(),
  deleteMailTemplateMock: vi.fn(),
  getMailTemplateMock: vi.fn(),
  getMailTemplateRevisionMock: vi.fn(),
  listMailTemplatesMock: vi.fn(),
  listMailTemplateHistoryMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessTextMock: vi.fn(),
  previewMailTemplateMock: vi.fn(),
  restoreDefaultMailTemplateMock: vi.fn(),
  testSendMailTemplateMock: vi.fn(),
  updateMailTemplateMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      typeof options?.count === "number" ? `${key}:${options.count}` : key,
    i18n: {
      language: "zh-CN",
      resolvedLanguage: "zh-CN",
      t: (key: string) => key,
    },
  }),
}));

vi.mock("@/api/mail", () => ({
  MAIL_TEMPLATES_QUERY_KEY: ["system", "mail", "templates"],
  createMailTemplate: (...args: unknown[]) => createMailTemplateMock(...args),
  deleteMailTemplate: (...args: unknown[]) => deleteMailTemplateMock(...args),
  getMailTemplate: (...args: unknown[]) => getMailTemplateMock(...args),
  getMailTemplateRevision: (...args: unknown[]) => getMailTemplateRevisionMock(...args),
  listMailTemplates: (...args: unknown[]) => listMailTemplatesMock(...args),
  listMailTemplateHistory: (...args: unknown[]) => listMailTemplateHistoryMock(...args),
  previewMailTemplate: (...args: unknown[]) => previewMailTemplateMock(...args),
  restoreDefaultMailTemplate: (...args: unknown[]) => restoreDefaultMailTemplateMock(...args),
  testSendMailTemplate: (...args: unknown[]) => testSendMailTemplateMock(...args),
  updateMailTemplate: (...args: unknown[]) => updateMailTemplateMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifySuccessText: (...args: unknown[]) => notifySuccessTextMock(...args),
  getErrorMessage: () => "common:PAGE_SERVER_ERROR_DESC",
  resolveRequestId: () => null,
}));

vi.mock("@/pages/system/components/system-setting-item", () => ({
  SystemSettingItem: ({
    title,
    description,
    headerAction,
    children,
  }: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    headerAction?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      {headerAction}
      {children}
    </section>
  ),
}));

vi.mock("@arclayer/ui/setting-dialog", () => ({
  SettingDialog: ({
    open,
    title,
    description,
    footer,
    children,
  }: {
    open: boolean;
    title?: React.ReactNode;
    description?: React.ReactNode;
    footer?: React.ReactNode;
    children?: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={String(title)}>
        <h2>{title}</h2>
        <p>{description}</p>
        {children}
        <div>{footer}</div>
      </div>
    ) : null,
}));

vi.mock("@arclayer/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuCheckboxItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuIconItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children?: React.ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onSelect} disabled={disabled}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@arclayer/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogAction: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  AlertDialogCancel: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  AlertDialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@arclayer/ui/drawer", () => ({
  Drawer: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DrawerBody: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  DrawerHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
}));

const TEMPLATE: MailTemplate = {
  id: "template-1",
  key: "workspace_invite",
  locale: "zh-CN",
  name: "工作空间邀请",
  description: "邀请用户加入工作空间",
  subjectTemplate: "{{ inviter_name }} 邀请你加入",
  htmlTemplate: "<p>Hello {{ user_name }}</p>",
  textTemplate: "Hello {{ user_name }}",
  variables: ["inviter_name", "user_name"],
  isEnabled: true,
  version: 2,
  createdAt: "2026-07-22T08:00:00Z",
  updatedAt: "2026-07-22T08:00:00Z",
};

const GROUP: MailTemplateGroup = {
  key: TEMPLATE.key,
  name: TEMPLATE.name,
  description: TEMPLATE.description ?? null,
  category: "custom",
  owner: "custom",
  isRequired: false,
  locales: [
    {
      id: TEMPLATE.id,
      locale: TEMPLATE.locale,
      isEnabled: TEMPLATE.isEnabled,
      version: TEMPLATE.version,
      updatedAt: TEMPLATE.updatedAt,
      validationState: "valid",
      subjectPreview: TEMPLATE.subjectTemplate,
      sourceState: "custom",
    },
  ],
  fallbackLocale: "zh-CN",
  health: "healthy",
  latestVersion: TEMPLATE.version,
  updatedAt: TEMPLATE.updatedAt,
};

const GROUP_WITH_TWO_LOCALES: MailTemplateGroup = {
  ...GROUP,
  owner: "builtin",
  category: "invitation",
  locales: [
    GROUP.locales[0]!,
    {
      ...GROUP.locales[0]!,
      id: "template-2",
      locale: "en-US",
      version: 3,
      sourceState: "default",
    },
  ],
  latestVersion: 3,
};

const REVISION = {
  id: "revision-2",
  templateId: TEMPLATE.id,
  key: TEMPLATE.key,
  locale: TEMPLATE.locale,
  version: 2,
  action: "updated" as const,
  changedFields: ["subject_template"],
  actor: {
    id: "user-1",
    username: "admin",
    displayName: "System Admin",
    avatarUrl: null,
  },
  createdAt: "2026-07-22T08:00:00Z",
};

const REVISION_DETAIL = {
  ...REVISION,
  name: TEMPLATE.name,
  description: TEMPLATE.description,
  subjectTemplate: TEMPLATE.subjectTemplate,
  htmlTemplate: TEMPLATE.htmlTemplate,
  textTemplate: TEMPLATE.textTemplate,
  variables: TEMPLATE.variables,
  isEnabled: TEMPLATE.isEnabled,
};

function page(items: MailTemplateGroup[]) {
  return {
    items,
    total: items.length,
    page: 1,
    size: 20,
    pages: items.length ? 1 : 0,
    next: null,
    prev: null,
  };
}

function renderManager() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EmailTemplateManager />
    </QueryClientProvider>,
  );
}

async function openCreateDialog() {
  await screen.findByText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_EMPTY");
  await userEvent.setup().click(
    screen.getAllByRole("button", {
      name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_CREATE_ACTION",
    })[0],
  );
}

describe("EmailTemplateManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMailTemplatesMock.mockResolvedValue(page([]));
    getMailTemplateMock.mockResolvedValue(TEMPLATE);
    getMailTemplateRevisionMock.mockResolvedValue(REVISION_DETAIL);
    listMailTemplateHistoryMock.mockResolvedValue({
      items: [REVISION],
      total: 1,
      page: 1,
      size: 20,
      pages: 1,
      next: null,
      prev: null,
    });
    createMailTemplateMock.mockResolvedValue(TEMPLATE);
    updateMailTemplateMock.mockResolvedValue(TEMPLATE);
    deleteMailTemplateMock.mockResolvedValue(undefined);
    restoreDefaultMailTemplateMock.mockResolvedValue(TEMPLATE);
    testSendMailTemplateMock.mockResolvedValue({
      state: "accepted",
      provider: "smtp",
      messageId: "message-1",
      attempts: 1,
      latencyMs: 12,
    });
    previewMailTemplateMock.mockResolvedValue({
      subject: "Preview subject",
      html: "<p>Preview body</p>",
      text: "Preview body",
    });
  });

  it("exposes loading, error retry, and empty states", async () => {
    let rejectRequest: ((reason: Error) => void) | undefined;
    listMailTemplatesMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    renderManager();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_EMPTY"),
    ).not.toBeInTheDocument();
    rejectRequest?.(new Error("network"));
    expect(await screen.findByText("common:REQUEST_FAILED")).toBeVisible();

    listMailTemplatesMock.mockResolvedValueOnce(page([]));
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "common:RETRY",
      }),
    );
    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_EMPTY_TITLE"),
    ).toBeVisible();
    expect(await screen.findByText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_EMPTY")).toBeVisible();

    await userEvent
      .setup()
      .type(
        screen.getByPlaceholderText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_SEARCH_PLACEHOLDER"),
        "missing",
      );
    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_NO_RESULTS_TITLE"),
    ).toBeVisible();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_NO_RESULTS_DESC"),
    ).toBeVisible();
  });

  it("creates a localized template with the form payload", async () => {
    const user = userEvent.setup();
    renderManager();
    await openCreateDialog();

    await user.type(
      screen.getByLabelText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_KEY_LABEL"),
      "welcome_email",
    );
    await user.type(
      screen.getByLabelText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_NAME_LABEL"),
      "Welcome",
    );
    fireEvent.change(
      screen.getByLabelText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_SUBJECT_LABEL"),
      { target: { value: "Welcome {{ user_name }}" } },
    );
    await user.type(
      screen.getByLabelText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_VARIABLES_LABEL"),
      "user_name",
    );
    fireEvent.change(screen.getByLabelText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_HTML_LABEL"), {
      target: { value: "<p>Welcome {{ user_name }}</p>" },
    });
    fireEvent.change(screen.getByLabelText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEXT_LABEL"), {
      target: { value: "Welcome {{ user_name }}" },
    });
    await user.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(createMailTemplateMock).toHaveBeenCalledWith({
        key: "welcome_email",
        locale: "zh-CN",
        name: "Welcome",
        description: null,
        subjectTemplate: "Welcome {{ user_name }}",
        htmlTemplate: "<p>Welcome {{ user_name }}</p>",
        textTemplate: "Welcome {{ user_name }}",
        variables: ["user_name"],
        isEnabled: true,
      });
    });
  });

  it("updates mutable fields without sending the immutable key or locale", async () => {
    const user = userEvent.setup();
    listMailTemplatesMock.mockResolvedValue(page([GROUP]));
    renderManager();

    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_EDIT_ACTION",
        })
      )[0],
    );
    const nameInput = screen.getByLabelText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_NAME_LABEL");
    await user.clear(nameInput);
    await user.type(nameInput, "Workspace invitation");
    await user.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(updateMailTemplateMock).toHaveBeenCalledWith(
        TEMPLATE.id,
        expect.objectContaining({ name: "Workspace invitation" }),
      );
    });
    const patch = updateMailTemplateMock.mock.calls[0][1] as Record<string, unknown>;
    expect(patch).toHaveProperty("expectedVersion", TEMPLATE.version);
    expect(patch).not.toHaveProperty("key");
    expect(patch).not.toHaveProperty("locale");
  });

  it("keeps stale edits open and reloads the latest template after a revision conflict", async () => {
    const user = userEvent.setup();
    const latestTemplate = { ...TEMPLATE, name: "Latest workspace invitation", version: 3 };
    listMailTemplatesMock.mockResolvedValue(page([GROUP]));
    getMailTemplateMock.mockResolvedValueOnce(TEMPLATE).mockResolvedValueOnce(latestTemplate);
    updateMailTemplateMock.mockRejectedValueOnce(
      new ApiError({
        status: 409,
        message: "Revision conflict",
        error: "MAIL_TEMPLATE_REVISION_CONFLICT",
      }),
    );
    renderManager();

    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_EDIT_ACTION",
        })
      )[0],
    );
    const nameInput = screen.getByLabelText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_NAME_LABEL");
    await user.clear(nameInput);
    await user.type(nameInput, "Stale local edit");
    await user.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_CONFLICT_DESC"),
    ).toBeVisible();
    expect(nameInput).toHaveValue("Stale local edit");

    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_CONFLICT_RELOAD",
      }),
    );
    await waitFor(() => expect(nameInput).toHaveValue(latestTemplate.name));
    expect(
      screen.queryByText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_CONFLICT_DESC"),
    ).not.toBeInTheDocument();
  });

  it("renders one aggregate row with language text, locale codes, and no duplicate edit action", async () => {
    listMailTemplatesMock.mockResolvedValue(page([GROUP_WITH_TWO_LOCALES]));
    renderManager();

    expect(await screen.findByText(TEMPLATE.name)).toBeVisible();
    expect(screen.getByText("account:ACCOUNT_LANGUAGE_ZH")).toBeVisible();
    expect(screen.getByText("account:ACCOUNT_LANGUAGE_EN")).toBeVisible();
    expect(screen.getByText("zh-CN")).toBeVisible();
    expect(screen.getByText("en-US")).toBeVisible();
    expect(
      screen.getAllByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_EDIT_ACTION",
      }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ADD_LANGUAGE_ACTION",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DUPLICATE_ACTION",
      }),
    ).toBeVisible();
  });

  it("reconciles the aggregate list before reporting a locale status update", async () => {
    const user = userEvent.setup();
    listMailTemplatesMock.mockResolvedValue(page([GROUP]));
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DISABLE_ACTION",
      }),
    );

    await waitFor(() => {
      expect(updateMailTemplateMock).toHaveBeenCalledWith(TEMPLATE.id, {
        expectedVersion: TEMPLATE.version,
        isEnabled: false,
      });
      expect(listMailTemplatesMock.mock.calls.length).toBeGreaterThan(1);
      expect(notifySuccessTextMock).toHaveBeenCalledWith(
        "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_STATUS_UPDATED",
      );
    });
    expect(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_EDIT_ACTION",
      }),
    ).toBeEnabled();
  });

  it("renders a sandboxed preview and switches to mobile width", async () => {
    const user = userEvent.setup();
    renderManager();
    await openCreateDialog();

    fireEvent.change(
      screen.getByLabelText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_SUBJECT_LABEL"),
      { target: { value: "Hello {{ user_name }}" } },
    );
    fireEvent.change(screen.getByLabelText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_HTML_LABEL"), {
      target: { value: "<p>Hello {{ user_name }}</p>" },
    });
    fireEvent.change(screen.getByLabelText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEXT_LABEL"), {
      target: { value: "Hello {{ user_name }}" },
    });
    const sampleInput = screen.getByLabelText(
      "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_SAMPLE_DATA_LABEL",
    );
    fireEvent.change(sampleInput, { target: { value: '{"user_name":"Philip"}' } });
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_RENDER_PREVIEW",
      }),
    );

    const frame = await screen.findByTitle(
      "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREVIEW_FRAME_TITLE",
    );
    expect(frame).toHaveAttribute("sandbox", "");
    expect(previewMailTemplateMock).toHaveBeenCalledWith({
      subjectTemplate: "Hello {{ user_name }}",
      htmlTemplate: "<p>Hello {{ user_name }}</p>",
      textTemplate: "Hello {{ user_name }}",
      variables: { user_name: "Philip" },
    });

    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREVIEW_MOBILE",
      }),
    );
    expect(frame.parentElement).toHaveClass("w-[375px]");
  });

  it("sends the selected template version through the explicit test dialog", async () => {
    const user = userEvent.setup();
    listMailTemplatesMock.mockResolvedValue(page([GROUP]));
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEST_SEND_ACTION",
      }),
    );
    await user.type(
      screen.getByLabelText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEST_RECIPIENT_LABEL"),
      "admin@example.com",
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEST_SEND_CONFIRM",
      }),
    );

    await waitFor(() => {
      expect(testSendMailTemplateMock).toHaveBeenCalledWith(TEMPLATE.id, {
        recipient: "admin@example.com",
        variables: {
          inviter_name: "inviter_name sample",
          user_name: "user_name sample",
        },
      });
      expect(notifySuccessTextMock).toHaveBeenCalledWith(
        "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEST_SEND_ACCEPTED",
      );
    });
  });

  it("exposes why a runtime-required language cannot be disabled", async () => {
    listMailTemplatesMock.mockResolvedValue(
      page([{ ...GROUP_WITH_TWO_LOCALES, isRequired: true }]),
    );
    renderManager();

    expect(
      await screen.findByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_REQUIRED_DISABLE_UNAVAILABLE",
      }),
    ).toBeDisabled();
  });

  it("requires confirmation before deleting a template", async () => {
    const user = userEvent.setup();
    listMailTemplatesMock.mockResolvedValue(page([GROUP]));
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DELETE_ACTION",
      }),
    );
    expect(deleteMailTemplateMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DELETE_CONFIRM",
      }),
    );
    await waitFor(() =>
      expect(deleteMailTemplateMock).toHaveBeenCalledWith(TEMPLATE.id, TEMPLATE.version),
    );
  });

  it("opens locale-aware immutable history and loads the selected revision", async () => {
    const user = userEvent.setup();
    listMailTemplatesMock.mockResolvedValue(page([GROUP]));
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_ACTION",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_TITLE",
      }),
    ).toBeVisible();
    await waitFor(() => {
      expect(listMailTemplateHistoryMock).toHaveBeenCalledWith(
        TEMPLATE.key,
        { page: 1, size: 20 },
        expect.any(AbortSignal),
      );
      expect(getMailTemplateRevisionMock).toHaveBeenCalledWith(
        REVISION.id,
        expect.any(AbortSignal),
      );
    });
    expect(await screen.findByText("System Admin")).toBeVisible();
    expect(screen.getByText("v2")).toBeVisible();
  });

  it("counts actual revision value differences instead of submitted fields", async () => {
    const user = userEvent.setup();
    const previousRevision = {
      ...REVISION,
      id: "revision-1",
      version: 1,
      createdAt: "2026-07-22T07:00:00Z",
    };
    const currentRevision = {
      ...REVISION,
      changedFields: [
        "name",
        "description",
        "subject_template",
        "html_template",
        "text_template",
        "variables",
        "is_enabled",
      ],
    };
    listMailTemplatesMock.mockResolvedValue(page([GROUP]));
    listMailTemplateHistoryMock.mockResolvedValue({
      items: [currentRevision, previousRevision],
      total: 2,
      page: 1,
      size: 20,
      pages: 1,
      next: null,
      prev: null,
    });
    getMailTemplateRevisionMock.mockImplementation((revisionId: string) =>
      Promise.resolve({
        ...REVISION_DETAIL,
        ...(revisionId === previousRevision.id ? { id: revisionId, version: 1 } : {}),
        isEnabled: revisionId !== previousRevision.id,
      }),
    );
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_ACTION",
      }),
    );

    expect(
      await screen.findByText("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_CHANGED_COUNT:1"),
    ).toBeVisible();
  });

  it("does not compare a revision with another locale when no locale baseline exists", async () => {
    const user = userEvent.setup();
    const englishRevision = {
      ...REVISION,
      id: "revision-en-1",
      templateId: "template-2",
      locale: "en-US",
      version: 1,
    };
    const chineseRevision = {
      ...REVISION,
      id: "revision-zh-1",
      version: 1,
      createdAt: "2026-07-22T07:00:00Z",
    };
    listMailTemplatesMock.mockResolvedValue(page([GROUP_WITH_TWO_LOCALES]));
    listMailTemplateHistoryMock.mockResolvedValue({
      items: [englishRevision, chineseRevision],
      total: 2,
      page: 1,
      size: 20,
      pages: 1,
      next: null,
      prev: null,
    });
    getMailTemplateRevisionMock.mockResolvedValue({
      ...REVISION_DETAIL,
      ...englishRevision,
    });
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_ACTION",
      }),
    );

    expect(
      await screen.findByText("SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_COMPARE_INITIAL"),
    ).toBeVisible();
    expect(getMailTemplateRevisionMock).toHaveBeenCalledTimes(1);
    expect(getMailTemplateRevisionMock).toHaveBeenCalledWith(
      englishRevision.id,
      expect.any(AbortSignal),
    );
    expect(getMailTemplateRevisionMock).not.toHaveBeenCalledWith(
      chineseRevision.id,
      expect.anything(),
    );
  });
});
