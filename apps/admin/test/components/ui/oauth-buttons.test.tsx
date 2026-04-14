import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthOauthButtons } from "@/components/ui/oauth-buttons";

const { listSSOProvidersMock, preferencesState } = vi.hoisted(() => ({
  listSSOProvidersMock: vi.fn(),
  preferencesState: { themeMode: "light" as const },
}));

vi.mock("@/api/auth-sso", () => ({
  listSSOProviders: (...args: unknown[]) => listSSOProvidersMock(...args),
}));

vi.mock("@/stores/use-preference-store", () => ({
  usePreferencesStore: (selector: (state: typeof preferencesState) => unknown) =>
    selector(preferencesState),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("AuthOauthButtons", () => {
  it("uses text-footnote for the continue-with divider", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [{ provider: "google", label: "Google", start_url: "/oauth/google" }],
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthOauthButtons />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("auth:OAUTH_ACCOUNT_DIVIDER")).toBeInTheDocument();
    });

    expect(screen.getByText("auth:OAUTH_ACCOUNT_DIVIDER").parentElement).toHaveClass(
      "text-footnote",
    );
  });

  it("renders leading auth actions before oauth providers", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [{ provider: "google", label: "Google", start_url: "/oauth/google" }],
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthOauthButtons
          leadingActions={[
            {
              key: "email-code",
              label: "auth:LOGIN_EMAIL_CODE_ACTION",
              onClick: vi.fn(),
            },
          ]}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" })).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveAccessibleName("auth:LOGIN_EMAIL_CODE_ACTION");
  });

  it("renders the email-code action on its own full-width row", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [{ provider: "google", label: "Google", start_url: "/oauth/google" }],
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthOauthButtons
          leadingActions={[
            {
              key: "email-code",
              label: "auth:LOGIN_EMAIL_CODE_ACTION",
              onClick: vi.fn(),
            },
          ]}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" })).toBeInTheDocument();
    });

    const emailCodeButton = screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_ACTION" });
    const googleButton = screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" });

    expect(emailCodeButton).toHaveClass("w-full");
    expect(emailCodeButton).toHaveClass("px-4");
    expect(emailCodeButton.parentElement).not.toBe(googleButton.parentElement);
  });
});
