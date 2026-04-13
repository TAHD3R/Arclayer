import { render } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";

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
  AuthOauthButtons: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

describe("RegisterPane oauth section", () => {
  it("hides the oauth wrapper when no oauth providers render", () => {
    const { container } = render(
      <RegisterPane
        onEmailSubmit={async () => false}
        onSubmit={async () => undefined}
        emailCheckLoading={false}
        loading={false}
        registerSeed={null}
        onSwitchToLogin={() => undefined}
        reducedMotion
        itemVariants={{}}
      />,
    );

    const oauthWrapper = container.querySelector(".pt-1\\.5");
    expect(oauthWrapper).toHaveClass("empty:hidden");
    expect(oauthWrapper).toBeEmptyDOMElement();
  });
});
