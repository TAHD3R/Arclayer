import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MailTemplate } from "@/api/mail";
import { EmailTemplateManager } from "@/pages/system/email/email-template-manager";

const {
  createMailTemplateMock,
  deleteMailTemplateMock,
  listMailTemplatesMock,
  notifyErrorMock,
  notifySuccessTextMock,
  previewMailTemplateMock,
  updateMailTemplateMock,
} = vi.hoisted(() => ({
  createMailTemplateMock: vi.fn(),
  deleteMailTemplateMock: vi.fn(),
  listMailTemplatesMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessTextMock: vi.fn(),
  previewMailTemplateMock: vi.fn(),
  updateMailTemplateMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/api/mail", () => ({
  MAIL_TEMPLATES_QUERY_KEY: ["system", "mail", "templates"],
  createMailTemplate: (...args: unknown[]) => createMailTemplateMock(...args),
  deleteMailTemplate: (...args: unknown[]) => deleteMailTemplateMock(...args),
  listMailTemplates: (...args: unknown[]) => listMailTemplatesMock(...args),
  previewMailTemplate: (...args: unknown[]) => previewMailTemplateMock(...args),
  updateMailTemplate: (...args: unknown[]) => updateMailTemplateMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifySuccessText: (...args: unknown[]) => notifySuccessTextMock(...args),
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
  DropdownMenuIconItem: ({
    children,
    onSelect,
  }: {
    children?: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
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
    listMailTemplatesMock.mockResolvedValue([]);
    createMailTemplateMock.mockResolvedValue(TEMPLATE);
    updateMailTemplateMock.mockResolvedValue(TEMPLATE);
    deleteMailTemplateMock.mockResolvedValue(undefined);
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

    expect(screen.getByRole("status")).toHaveTextContent(
      "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_LOADING",
    );
    rejectRequest?.(new Error("network"));
    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_LOAD_ERROR"),
    ).toBeVisible();

    listMailTemplatesMock.mockResolvedValueOnce([]);
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_RETRY",
      }),
    );
    expect(await screen.findByText("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATES_EMPTY")).toBeVisible();
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
    listMailTemplatesMock.mockResolvedValue([TEMPLATE]);
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
    expect(patch).not.toHaveProperty("key");
    expect(patch).not.toHaveProperty("locale");
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

  it("requires confirmation before deleting a template", async () => {
    const user = userEvent.setup();
    listMailTemplatesMock.mockResolvedValue([TEMPLATE]);
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
    await waitFor(() => expect(deleteMailTemplateMock).toHaveBeenCalledWith(TEMPLATE.id));
  });
});
