import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/http";
import { LoginPane } from "@/pages/login/components/login-pane";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  getRouteApi: () => ({ useSearch: () => ({}) }),
  Link: ({ children, to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

describe("LoginPane email form", () => {
  it("renders the password form without duplicating the login-method picker", () => {
    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const slogan = screen.getByTestId("login-brand-slogan");
    expect(slogan).toHaveClass("gap-6");
    const title = slogan.querySelector("h1");
    expect(title).toHaveClass(
      "gap-1.5",
      "text-[32px]",
      "leading-9",
      "font-medium",
      "tracking-[-1px]",
    );
    const promise = screen.getByText("auth:LOGIN_SLOGAN_PROMISE");
    expect(promise.style.getPropertyValue("--auth-shiny-color")).toBe(
      "var(--color-label-secondary)",
    );
    expect(promise.style.getPropertyValue("--auth-shiny-highlight")).toBe(
      "color-mix(in oklab, var(--color-label-secondary) 55%, var(--color-label-primary))",
    );
    expect(slogan.parentElement?.parentElement).toHaveClass("max-w-[25.875rem]", "gap-6");
    expect(screen.queryByText("auth:LOGIN_PAGE_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_EMAIL_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_PASSWORD_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:OAUTH_ACCOUNT_DIVIDER")).not.toBeInTheDocument();
    const email = screen.getByLabelText("auth:FIELD_EMAIL_LABEL");
    const password = screen.getByLabelText("auth:FIELD_PASSWORD_LABEL");
    expect(email.closest("[data-slot='input-group']")).toHaveClass("h-14!", "rounded-full!");
    expect(password.closest("[data-slot='input-group']")).toHaveClass("h-14!", "rounded-full!");
    expect(password.closest("[data-slot='input-group']")).toHaveClass(
      "[&>[data-align=inline-end]]:mr-0!",
      "[&>[data-align=inline-end]]:pr-4!",
    );
    expect(screen.queryByText("auth:KEEP_SESSION")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "auth:KEEP_SESSION" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" })).toHaveAttribute(
      "data-variant",
      "ghost",
    );
    expect(screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" })).toHaveClass(
      "text-footnote",
      "font-semibold",
      "text-label-secondary",
    );
    expect(screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" })).toHaveAttribute(
      "data-size",
      "inline",
    );
    expect(screen.getByRole("button", { name: "auth:FORGOT_PASSWORD" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:FORGOT_PASSWORD" })).toHaveAttribute(
      "data-variant",
      "ghost",
    );
    expect(screen.getByRole("button", { name: "auth:FORGOT_PASSWORD" })).toHaveClass(
      "text-label-secondary",
      "hover:bg-transparent",
    );
    expect(screen.getByRole("button", { name: "auth:FORGOT_PASSWORD" }).parentElement).toHaveClass(
      "justify-end",
    );
    expect(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" })).toHaveClass(
      "h-14!",
      "w-full",
      "rounded-full!",
      "hover:bg-primary!",
    );
    expect(
      screen.queryByRole("button", { name: "auth:LOGIN_NEXT_BUTTON" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "auth:LOGIN_BACK_TO_METHODS" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-account-switch")).toContainElement(
      screen.getByRole("button", { name: "auth:CREATE_ACCOUNT" }),
    );
    expect(screen.getByText("auth:LEGAL_CONTINUE")).toBeInTheDocument();
  });

  it("returns to the login-method picker when a back action is provided", async () => {
    const onBackToMethods = vi.fn();

    render(
      <LoginPane
        onEmailSubmit={async () => ({ exists: true, passwordLoginAvailable: true })}
        onSubmit={async () => undefined}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        onBackToMethods={onBackToMethods}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    expect(screen.getByRole("button", { name: "auth:LOGIN_BACK_TO_METHODS" })).toHaveClass(
      "h-14!",
      "w-full",
      "rounded-full!",
    );
    expect(
      screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }).querySelector("svg"),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "auth:LOGIN_BACK_TO_METHODS" }).querySelector("svg"),
    ).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "auth:LOGIN_BACK_TO_METHODS" }));

    expect(onBackToMethods).toHaveBeenCalledTimes(1);
  });

  it("shows email code action below the primary action", async () => {
    const onSwitchToEmailCode = vi.fn();

    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={{ email: "demo@example.com", step: "password" }}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={onSwitchToEmailCode}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const user = userEvent.setup();
    const emailCodeButton = screen.getByRole("button", {
      name: "auth:LOGIN_EMAIL_CODE_ACTION",
    });
    await user.click(emailCodeButton);

    expect(onSwitchToEmailCode).toHaveBeenCalledWith("demo@example.com", true);
    expect(emailCodeButton.querySelector("svg")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "auth:LOGIN_BUTTON" })
        .compareDocumentPosition(emailCodeButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows live login password rules in a floating popover while the field is focused", async () => {
    const user = userEvent.setup();

    render(
      <LoginPane
        onEmailSubmit={async () => ({ exists: true, passwordLoginAvailable: true })}
        onSubmit={async () => undefined}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const password = screen.getByLabelText("auth:FIELD_PASSWORD_LABEL");
    await user.click(password);

    expect(await screen.findByText("auth:PASSWORD_REQUIREMENTS_TITLE")).toBeInTheDocument();
    expect(screen.getByText("auth:PASSWORD_REQUIREMENT_LENGTH")).toBeInTheDocument();
    expect(screen.getByText("auth:LOGIN_PASSWORD_REQUIREMENT_LETTER")).toBeInTheDocument();
    expect(screen.getByText("auth:PASSWORD_REQUIREMENT_NUMBER")).toBeInTheDocument();

    await user.type(password, "secret123");
    expect(screen.getByText("auth:PASSWORD_REQUIREMENT_LENGTH").closest("li")).toHaveClass(
      "text-success",
    );
    expect(screen.getByText("auth:LOGIN_PASSWORD_REQUIREMENT_LETTER").closest("li")).toHaveClass(
      "text-success",
    );
    expect(screen.getByText("auth:PASSWORD_REQUIREMENT_NUMBER").closest("li")).toHaveClass(
      "text-success",
    );

    await user.click(screen.getByLabelText("auth:FIELD_EMAIL_LABEL"));
    await waitFor(() => {
      expect(screen.queryByText("auth:PASSWORD_REQUIREMENTS_TITLE")).not.toBeInTheDocument();
    });
  });

  it("routes passwordless accounts into email-code flow from the email step", async () => {
    const onSwitchToEmailCode = vi.fn();

    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: false,
        })}
        onSubmit={async () => undefined}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={onSwitchToEmailCode}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("auth:FIELD_EMAIL_LABEL"), "demo@example.com");
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "secret123");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }));

    expect(onSwitchToEmailCode).toHaveBeenCalledWith("demo@example.com", true, false);
  });

  it("shows unknown email as a form error without exposing account existence", async () => {
    const onSwitchToRegister = vi.fn();

    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: false,
          passwordLoginAvailable: false,
        })}
        onSubmit={async () => undefined}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={onSwitchToRegister}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("auth:FIELD_EMAIL_LABEL"), "missing@example.com");
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "secret123");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }));

    const email = screen.getByLabelText("auth:FIELD_EMAIL_LABEL");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("errors:INVALID_CREDENTIALS");
    expect(alert).toHaveClass("rounded-[1.75rem]");
    expect(alert).toHaveClass("[&>svg]:text-destructive!");
    expect(alert.querySelector("svg")).toHaveClass("lucide-circle-x");
    expect(email).not.toHaveAttribute("aria-invalid");
    expect(alert.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("auth:LOGIN_EMAIL_NOT_FOUND_MESSAGE")).not.toBeInTheDocument();
    expect(onSwitchToRegister).not.toHaveBeenCalled();

    await user.type(email, "x");
    expect(screen.queryByText("errors:INVALID_CREDENTIALS")).not.toBeInTheDocument();
  });

  it("shows rejected credentials at form level and preserves both inputs", async () => {
    const user = userEvent.setup();

    render(
      <LoginPane
        onEmailSubmit={async () => ({ exists: true, passwordLoginAvailable: true })}
        onSubmit={async () => {
          throw new ApiError({
            status: 401,
            message: "Internal credential detail",
            error: "INVALID_CREDENTIALS",
          });
        }}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const email = screen.getByLabelText("auth:FIELD_EMAIL_LABEL");
    const password = screen.getByLabelText("auth:FIELD_PASSWORD_LABEL");
    await user.type(email, "demo@example.com");
    await user.type(password, "secret123");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }));

    expect(await screen.findByRole("alert")).not.toHaveTextContent("Internal credential detail");
    expect(email).toHaveValue("demo@example.com");
    expect(password).toHaveValue("secret123");
    expect(email).not.toHaveAttribute("aria-invalid");
    expect(password).not.toHaveAttribute("aria-invalid");
  });

  it("submits login with keep-session enabled by default", async () => {
    const onSubmit = vi.fn(async () => undefined);

    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={onSubmit}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("auth:FIELD_EMAIL_LABEL"), "demo@example.com");
    await user.type(screen.getByLabelText("auth:FIELD_PASSWORD_LABEL"), "secret123");
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: "demo@example.com",
      password: "secret123",
      keepSession: true,
    });
  });

  it("keeps email-code switch enabled when the email is empty", async () => {
    const onSwitchToEmailCode = vi.fn();

    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={onSwitchToEmailCode}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" }));

    expect(onSwitchToEmailCode).toHaveBeenCalledWith("", true);
  });

  it("renders the primary action without a direction icon", () => {
    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        onVerificationResend={async () => ({ retryAfter: 60 })}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "auth:LOGIN_BUTTON" }).querySelector("svg"),
    ).toBeNull();
  });

  it("shows pending verification state and resends from the primary action", async () => {
    const onVerificationResend = vi.fn(async () => ({ retryAfter: 60 }));

    render(
      <LoginPane
        onEmailSubmit={async () => ({
          exists: true,
          passwordLoginAvailable: true,
        })}
        onSubmit={async () => undefined}
        onVerificationResend={onVerificationResend}
        verification={{ email: "demo@example.com", retryAfter: 0 }}
        emailCheckLoading={false}
        loading={false}
        resendLoading={false}
        loginSeed={null}
        onForgotPassword={() => undefined}
        onSwitchToEmailCode={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toBeDisabled();
    expect(screen.getByLabelText("auth:FIELD_EMAIL_LABEL")).toHaveValue("demo@example.com");
    expect(screen.getByTestId("login-brand-slogan")).toBeInTheDocument();
    expect(screen.queryByText("auth:LOGIN_PAGE_TITLE")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("auth:FIELD_PASSWORD_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "auth:FORGOT_PASSWORD" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "auth:CREATE_ACCOUNT" })).not.toBeDisabled();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "auth:REGISTER_VERIFY_EMAIL_RESEND_ACTION" }),
    );

    expect(onVerificationResend).toHaveBeenCalledWith("demo@example.com");
  });
});
