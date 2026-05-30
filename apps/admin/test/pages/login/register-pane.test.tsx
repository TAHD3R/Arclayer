import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterPane } from "@/pages/login/components/register-pane";

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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

describe("RegisterPane oauth section", () => {
  beforeEach(() => {
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
          onVerificationResend={async () => ({ retryAfter: 60 })}
          emailCheckLoading={false}
          loading={false}
          resendLoading={false}
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
    expect(contentGroup?.parentElement).toHaveClass("grid", "gap-12");
    expect(screen.getByTestId("oauth-section")).toBeInTheDocument();
    expect(screen.getByText("auth:OAUTH_ACCOUNT_DIVIDER")).toBeInTheDocument();
    expect(
      screen
        .getByTestId("oauth-section")
        .compareDocumentPosition(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders the seeded register form as a single step", () => {
    renderPane({
      registerSeed: { email: "founder@example.com", step: "details" },
    });

    expect(screen.getByTestId("oauth-section")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "auth:AUTH_CHANGE_EMAIL" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("auth:FIELD_DISPLAY_NAME_LABEL")).not.toBeInTheDocument();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toHaveValue("founder@example.com");
    expect(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL")).toBeInTheDocument();
    expect(screen.queryByLabelText("auth:FIELD_USERNAME_LABEL")).not.toBeInTheDocument();
  });

  it("shows existing-email recovery inside the email field content", async () => {
    const user = userEvent.setup();

    renderPane({ onEmailSubmit: async () => true });

    const emailField = screen.getByLabelText("auth:FIELD_EMAIL_LABEL");
    await user.type(emailField, "founder@example.com");
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "ValidPass1");
    await user.click(screen.getByRole("button", { name: "auth:REGISTER_BUTTON" }));

    const notice = await screen.findByText("auth:REGISTER_EMAIL_EXISTS_MESSAGE");
    const noticeContainer = notice.closest("div");
    const submitButton = screen.getByRole("button", {
      name: "auth:REGISTER_BUTTON",
    });

    expect(noticeContainer).toHaveClass("text-callout", "text-label-secondary");
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

  it("submits valid registration values after checking that the email is new", async () => {
    const user = userEvent.setup();
    const onEmailSubmit = vi.fn(async () => false);
    const onSubmit = vi.fn(async () => undefined);

    renderPane({ onEmailSubmit, onSubmit });

    await user.type(screen.getByLabelText("auth:FIELD_EMAIL_LABEL"), "founder@example.com");
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "ValidPass1");
    await user.click(screen.getByRole("button", { name: "auth:REGISTER_BUTTON" }));

    await waitFor(() => {
      expect(onEmailSubmit).toHaveBeenCalledWith("founder@example.com");
      expect(onSubmit).toHaveBeenCalledWith({
        email: "founder@example.com",
        password: "ValidPass1",
      });
    });
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

  it("shows pending verification state and resends when countdown is over", async () => {
    const onVerificationResend = vi.fn(async () => ({ retryAfter: 60 }));

    const { rerender } = renderPane({
      verification: { email: "founder@example.com", retryAfter: 2 },
      onVerificationResend,
    });

    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toBeDisabled();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toHaveValue("founder@example.com");
    expect(screen.queryByLabelText("auth:FIELD_PASSWORD_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("auth:FIELD_USERNAME_LABEL")).not.toBeInTheDocument();
    expect(screen.getByText("auth:REGISTER_VERIFY_EMAIL_SENT_HINT")).toBeInTheDocument();

    const waitingButton = screen.getByRole("button", {
      name: "auth:REGISTER_VERIFY_EMAIL_RESEND_WAIT",
    });
    expect(waitingButton).toBeDisabled();

    rerender(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <RegisterPane
          onEmailSubmit={async () => false}
          onSubmit={async () => undefined}
          onVerificationResend={onVerificationResend}
          emailCheckLoading={false}
          loading={false}
          resendLoading={false}
          verification={{ email: "founder@example.com", retryAfter: 0 }}
          registerSeed={null}
          onSwitchToLogin={() => undefined}
          reducedMotion
          itemVariants={{}}
        />
      </QueryClientProvider>,
    );
    const resendButton = screen.getByRole("button", {
      name: "auth:REGISTER_VERIFY_EMAIL_RESEND_ACTION",
    });
    expect(resendButton).not.toBeDisabled();
    resendButton.click();

    await waitFor(() => expect(onVerificationResend).toHaveBeenCalledWith("founder@example.com"));
  });
});
