import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, test, vi } from "vitest";

import { LoginView } from "@/pages/login/components/login-view";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  getRouteApi: () => ({ useSearch: () => ({}) }),
}));

vi.mock("@/components/ui/oauth-buttons", () => ({
  AuthOauthButtons: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("LoginView register entry visibility", () => {
  test("hides register entry when public register is disabled", () => {
    render(
      <LoginView
        mode="login"
        onModeChange={() => undefined}
        onLoginSubmit={() => undefined}
        onForgotPassword={async () => undefined}
        onRegisterSubmit={() => undefined}
        publicRegisterEnabled={false}
      />,
    );

    expect(screen.queryByText("auth:CREATE_ACCOUNT")).not.toBeInTheDocument();
    expect(screen.getByText("auth:LOGIN_PAGE_TITLE")).toBeInTheDocument();
  });

  test("shows register entry when public register is enabled", () => {
    render(
      <LoginView
        mode="login"
        onModeChange={() => undefined}
        onLoginSubmit={() => undefined}
        onForgotPassword={async () => undefined}
        onRegisterSubmit={() => undefined}
        publicRegisterEnabled
      />,
    );

    expect(screen.getByText("auth:CREATE_ACCOUNT")).toBeInTheDocument();
  });
});
