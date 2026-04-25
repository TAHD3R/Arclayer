import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginEmailCodePane } from "@/pages/login/components/login-email-code-pane";
import { LoginTwoFactorPane } from "@/pages/login/components/login-two-factor-pane";

const mockedNotifications = vi.hoisted(() => ({
  notifySuccessText: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === "auth:LOGIN_EMAIL_CODE_SENT_HINT") {
        return `If we find an account linked to ${String(params?.email ?? "")}, we'll send it a verification code. Please enter that code below.`;
      }
      if (key === "auth:LOGIN_EMAIL_CODE_RESEND_WAIT") {
        return `Resend in ${String(params?.countdown ?? "")}`;
      }
      return key;
    },
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

vi.mock("@/lib/notifications", () => ({
  notifySuccessText: (...args: unknown[]) => mockedNotifications.notifySuccessText(...args),
}));

vi.mock("@/components/ui/oauth-buttons", () => ({
  AuthOauthButtons: ({
    leadingActions = [],
  }: {
    leadingActions?: Array<{ key: string; label: string; onClick: () => void }>;
  }) => (
    <div data-testid="oauth-section">
      {leadingActions.map((action) => (
        <button key={action.key} type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/components/layout/admin-logo", () => ({
  AdminFullLogo: () => <div>Arclayer</div>,
}));

vi.mock("@/components/layout/legal-footer", () => ({
  LegalFooter: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
  LegalFooterCopyright: () => <span>auth:FOOTER_COPYRIGHT</span>,
}));

describe("Login auth otp layouts", () => {
  beforeEach(() => {
    mockedNotifications.notifySuccessText.mockReset();
  });

  it("uses the updated conditional email-code notice copy", async () => {
    render(
      <LoginEmailCodePane
        seed={{ email: "aspj6771@gmail.com", autoRequest: true, keepSession: true }}
        requestLoading={false}
        verifyLoading={false}
        onRequestCode={async () => ({ expiresIn: 600, retryAfter: 0 })}
        onSubmit={async () => undefined}
        onBackToPassword={() => undefined}
        reducedMotion
        itemVariants={{}}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "If we find an account linked to aspj6771@gmail.com, we'll send it a verification code. Please enter that code below.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("renders a full-width otp grid for email-code verification", async () => {
    const { container } = render(
      <LoginEmailCodePane
        seed={{ email: "demo@example.com", autoRequest: true, keepSession: true }}
        requestLoading={false}
        verifyLoading={false}
        onRequestCode={async () => ({ expiresIn: 600, retryAfter: 0 })}
        onSubmit={async () => undefined}
        onBackToPassword={() => undefined}
        reducedMotion
        itemVariants={{}}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".grid-cols-6")).toBeInTheDocument();
    });

    const otpGrid = container.querySelector(".grid-cols-6");
    expect(otpGrid).toHaveClass("w-full");
    expect(otpGrid?.querySelectorAll(".flex-1")).toHaveLength(6);
    const otpSlots = otpGrid?.querySelectorAll(".flex-1");
    expect(otpSlots?.[0]).toHaveClass("h-10", "rounded-md", "bg-card");
  });

  it("starts resend cooldown and shows a success toast after requesting a code", async () => {
    render(
      <LoginEmailCodePane
        seed={{ email: "demo@example.com", autoRequest: true, keepSession: true }}
        requestLoading={false}
        verifyLoading={false}
        onRequestCode={async () => ({ expiresIn: 600, retryAfter: 60 })}
        onSubmit={async () => undefined}
        onBackToPassword={() => undefined}
        reducedMotion
        itemVariants={{}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Resend in 01:00" })).toBeDisabled();
    });

    expect(mockedNotifications.notifySuccessText).toHaveBeenCalledWith("auth:LOGIN_CODE_SENT");
  });

  it("auto-requests the seeded email code once under StrictMode", async () => {
    const requestCode = vi.fn(async () => ({ expiresIn: 600, retryAfter: 60 }));

    render(
      <StrictMode>
        <LoginEmailCodePane
          seed={{ email: "strict@example.com", autoRequest: true, keepSession: true }}
          requestLoading={false}
          verifyLoading={false}
          onRequestCode={requestCode}
          onSubmit={async () => undefined}
          onBackToPassword={() => undefined}
          reducedMotion
          itemVariants={{}}
        />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Resend in 01:00" })).toBeDisabled();
    });

    expect(requestCode).toHaveBeenCalledTimes(1);
    expect(mockedNotifications.notifySuccessText).toHaveBeenCalledTimes(1);
    expect(mockedNotifications.notifySuccessText).toHaveBeenCalledWith("auth:LOGIN_CODE_SENT");
  });

  it("disables verify until the full code is entered and shows password login below the form", async () => {
    render(
      <LoginEmailCodePane
        seed={{ email: "demo@example.com", autoRequest: true, keepSession: true }}
        requestLoading={false}
        verifyLoading={false}
        onRequestCode={async () => ({ expiresIn: 600, retryAfter: 0 })}
        onSubmit={async () => undefined}
        onBackToPassword={() => undefined}
        reducedMotion
        itemVariants={{}}
      />,
    );

    const verifyButton = await screen.findByRole("button", { name: "auth:LOGIN_BUTTON" });
    expect(verifyButton).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_USE_PASSWORD" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("auth:LOGIN_EMAIL_CODE_FIELD_LABEL"), {
      target: { value: "123456" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "auth:LOGIN_BUTTON" })).toBeEnabled();
    });
  });

  it("renders a full-width otp grid for two-factor verification", () => {
    const { container } = render(
      <LoginTwoFactorPane
        challenge={{
          twoFactorToken: "challenge-token",
          expiresAt: Date.now() + 60_000,
          keepSession: true,
          redirect: null,
          source: "email-code",
        }}
        loading={false}
        onSubmit={() => undefined}
        onBackToLogin={() => undefined}
        reducedMotion
        itemVariants={{}}
      />,
    );

    const otpGrid = container.querySelector(".grid-cols-6");
    expect(otpGrid).toBeInTheDocument();
    expect(otpGrid).toHaveClass("w-full");
    expect(otpGrid?.querySelectorAll(".flex-1")).toHaveLength(6);
    const otpSlots = otpGrid?.querySelectorAll(".flex-1");
    expect(otpSlots?.[0]).toHaveClass("h-10", "rounded-md", "bg-card");
  });

  it("omits legal copy on email-code and two-factor login recovery panes", async () => {
    const { rerender } = render(
      <LoginEmailCodePane
        seed={{ email: "demo@example.com", autoRequest: false, keepSession: true }}
        requestLoading={false}
        verifyLoading={false}
        onRequestCode={async () => ({ expiresIn: 600, retryAfter: 0 })}
        onSubmit={async () => undefined}
        onBackToPassword={() => undefined}
        reducedMotion
        itemVariants={{}}
      />,
    );

    expect(screen.queryByText("auth:LEGAL_CONTINUE")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:FOOTER_COPYRIGHT")).not.toBeInTheDocument();

    rerender(
      <LoginTwoFactorPane
        challenge={{
          twoFactorToken: "challenge-token",
          expiresAt: Date.now() + 60_000,
          keepSession: true,
          redirect: null,
          source: "email-code",
        }}
        loading={false}
        onSubmit={() => undefined}
        onBackToLogin={() => undefined}
        reducedMotion
        itemVariants={{}}
      />,
    );

    expect(screen.queryByText("auth:LEGAL_CONTINUE")).not.toBeInTheDocument();
  });
});
