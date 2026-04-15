import { render, screen, waitFor } from "@testing-library/react";
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
  AuthOauthButtons: () => null,
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
  });

  it("starts resend cooldown and shows a success toast after requesting a code", async () => {
    render(
      <LoginEmailCodePane
        seed={{ email: "demo@example.com", autoRequest: true, keepSession: true }}
        requestLoading={false}
        verifyLoading={false}
        onRequestCode={async () => ({ expiresIn: 600, retryAfter: 20 })}
        onSubmit={async () => undefined}
        onBackToPassword={() => undefined}
        reducedMotion
        itemVariants={{}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Resend in 00:20" })).toBeDisabled();
    });

    expect(mockedNotifications.notifySuccessText).toHaveBeenCalledWith("auth:LOGIN_CODE_SENT");
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
  });
});
