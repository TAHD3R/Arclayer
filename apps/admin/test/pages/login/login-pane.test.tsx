import { render } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";

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

vi.mock("@/components/ui/oauth-buttons", () => ({
  AuthOauthButtons: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

describe("LoginPane oauth section", () => {
  it("hides the oauth wrapper when no oauth providers render", () => {
    const { container } = render(
      <LoginPane
        onSubmit={() => undefined}
        loading={false}
        initialKeepSession={false}
        onForgotPassword={() => undefined}
        onSwitchToRegister={() => undefined}
        publicRegisterEnabled
        reducedMotion
        itemVariants={{}}
      />,
    );

    const oauthWrapper = container.querySelector(".pt-1\\.5");
    expect(oauthWrapper).toHaveClass("empty:hidden");
    expect(oauthWrapper).toBeEmptyDOMElement();
  });
});
