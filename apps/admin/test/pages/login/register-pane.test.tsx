import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterPane } from "@/pages/login/components/register-pane";

const usernameCheckMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  getRouteApi: () => ({ useSearch: () => ({}) }),
  Link: ({ children, to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/oauth-buttons", () => ({
  AuthOauthButtons: ({
    dividerLabelKey = "auth:OAUTH_ACCOUNT_DIVIDER",
  }: {
    dividerLabelKey?: string;
  }) => <div data-testid="oauth-section">{dividerLabelKey}</div>,
}));

vi.mock("@/api/auth", () => ({
  usernameCheck: (...args: unknown[]) => usernameCheckMock(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

describe("RegisterPane oauth section", () => {
  beforeEach(() => {
    usernameCheckMock.mockReset();
    vi.useRealTimers();
  });

  function renderPane(overrides: Partial<React.ComponentProps<typeof RegisterPane>> = {}) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <RegisterPane
          onEmailSubmit={async () => false}
          onSubmit={async () => undefined}
          emailCheckLoading={false}
          loading={false}
          registerSeed={null}
          onSwitchToLogin={() => undefined}
          reducedMotion
          itemVariants={{}}
          {...overrides}
        />
      </QueryClientProvider>,
    );
  }

  it("hides the oauth wrapper when no oauth providers render", () => {
    const { container } = renderPane();

    const oauthWrapper = container.querySelector(".empty\\:hidden");
    const contentGroup = oauthWrapper?.parentElement;
    expect(oauthWrapper).toHaveClass("empty:hidden");
    expect(contentGroup).toHaveClass("grid", "gap-2");
    expect(contentGroup?.parentElement).toHaveClass("grid", "gap-8");
    expect(screen.getByTestId("oauth-section")).toBeInTheDocument();
    expect(screen.getByText("auth:OAUTH_ACCOUNT_DIVIDER")).toBeInTheDocument();
    expect(
      screen
        .getByTestId("oauth-section")
        .compareDocumentPosition(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("hides oauth after advancing to the details step", () => {
    renderPane({
      registerSeed: { email: "founder@example.com", step: "details" },
    });

    expect(screen.queryByTestId("oauth-section")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:AUTH_CHANGE_EMAIL" })).toBeInTheDocument();
  });

  it("shows existing-email recovery inside the email field content", async () => {
    const user = userEvent.setup();

    renderPane({ onEmailSubmit: async () => true });

    const emailField = screen.getByLabelText("auth:FIELD_EMAIL_LABEL");
    await user.type(emailField, "founder@example.com");
    await user.click(screen.getByRole("button", { name: "auth:REGISTER_NEXT_BUTTON" }));

    const notice = await screen.findByText("auth:REGISTER_EMAIL_EXISTS_MESSAGE");
    const noticeContainer = notice.closest("div");
    const submitButton = screen.getByRole("button", {
      name: "auth:REGISTER_NEXT_BUTTON",
    });

    expect(noticeContainer).toHaveClass("text-body", "text-label-secondary");
    expect(noticeContainer).toContainElement(
      screen.getByRole("button", { name: "auth:REGISTER_EMAIL_EXISTS_ACTION" }),
    );
    expect(
      emailField.compareDocumentPosition(noticeContainer!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      noticeContainer!.compareDocumentPosition(submitButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows username availability feedback and blocks submit when the name is unavailable", async () => {
    usernameCheckMock.mockResolvedValue({ available: false });
    const user = userEvent.setup();

    renderPane({
      registerSeed: { email: "founder@example.com", step: "details" },
    });

    await user.type(screen.getByLabelText("auth:FIELD_USERNAME_LABEL"), "taken-name");
    await waitFor(() =>
      expect(screen.getByText("auth:USERNAME_AVAILABILITY_UNAVAILABLE")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "auth:REGISTER_BUTTON" })).toBeDisabled();
  });

  it("hides password guidance before interaction and shows the checklist while invalid", async () => {
    const user = userEvent.setup();

    renderPane({
      registerSeed: { email: "founder@example.com", step: "details" },
    });

    expect(screen.queryByText("auth:PASSWORD_REQUIREMENT_LENGTH")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "short");
    expect(screen.getByText("auth:PASSWORD_REQUIREMENT_LENGTH")).toBeInTheDocument();
    expect(screen.getByText("auth:PASSWORD_REQUIREMENT_LOWERCASE")).toBeInTheDocument();
    expect(screen.getByText("auth:PASSWORD_REQUIREMENT_UPPERCASE")).toBeInTheDocument();
    expect(screen.getByText("auth:PASSWORD_REQUIREMENT_NUMBER")).toBeInTheDocument();
  });

  it("shows a single success message when all password requirements are met", async () => {
    const user = userEvent.setup();

    renderPane({
      registerSeed: { email: "founder@example.com", step: "details" },
    });

    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "ValidPass1");
    expect(await screen.findByText("auth:PASSWORD_REQUIREMENTS_MET")).toBeInTheDocument();
    expect(screen.queryByText("auth:PASSWORD_REQUIREMENT_LENGTH")).not.toBeInTheDocument();
  });
});
