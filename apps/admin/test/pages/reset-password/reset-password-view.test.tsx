import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResetPasswordView } from "@/pages/reset-password/components/reset-password-view";

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
    t: (key: string) => key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

vi.mock("@/components/layout/admin-logo", () => ({
  AdminFullLogo: () => <div>Arclayer</div>,
}));

vi.mock("@/components/layout/legal-footer", () => ({
  LegalFooter: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

describe("ResetPasswordView", () => {
  it("hides the reset-code field when a token is already present in the link", () => {
    render(
      <ResetPasswordView
        initialToken="token-from-link"
        loading={false}
        onSubmit={async () => undefined}
        onBackToLogin={() => undefined}
      />,
    );

    expect(screen.queryByLabelText("auth:FIELD_RESET_TOKEN_LABEL")).not.toBeInTheDocument();
    expect(screen.getByText("auth:FIELD_RESET_TOKEN_HELP")).toBeInTheDocument();
  });

  it("keeps the reset-code field when no token is present", () => {
    render(
      <ResetPasswordView
        loading={false}
        onSubmit={async () => undefined}
        onBackToLogin={() => undefined}
      />,
    );

    expect(screen.getByLabelText("auth:FIELD_RESET_TOKEN_LABEL")).toBeInTheDocument();
    expect(screen.queryByText("auth:FIELD_RESET_TOKEN_HELP")).not.toBeInTheDocument();
  });
});
