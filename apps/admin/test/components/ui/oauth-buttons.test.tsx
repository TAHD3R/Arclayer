import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthOauthButtons } from "@/components/ui/oauth-buttons";
import { STORAGE_KEYS } from "@/constants/storage";

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
  beforeEach(() => {
    localStorage.clear();
    listSSOProvidersMock.mockReset();
    preferencesState.themeMode = "light";
  });

  function renderButtons(props: React.ComponentProps<typeof AuthOauthButtons> = {}) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthOauthButtons {...props} />
      </QueryClientProvider>,
    );
  }

  it("uses text-footnote for the continue-with divider", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [{ provider: "google", label: "Google", start_url: "/oauth/google" }],
    });

    renderButtons();

    await waitFor(() => {
      expect(screen.getByText("auth:OAUTH_ACCOUNT_DIVIDER")).toBeInTheDocument();
    });

    expect(screen.getByText("auth:OAUTH_ACCOUNT_DIVIDER").parentElement).toHaveClass(
      "text-footnote",
    );
  });

  it("renders the divider before oauth providers by default", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [{ provider: "google", label: "Google", start_url: "/oauth/google" }],
    });

    renderButtons({
      dividerLabelKey: "auth:LOGIN_EMAIL_STEP_DIVIDER",
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" })).toBeInTheDocument();
      expect(screen.getByText("auth:LOGIN_EMAIL_STEP_DIVIDER")).toBeInTheDocument();
    });

    const dividerLabel = screen.getByText("auth:LOGIN_EMAIL_STEP_DIVIDER");
    const providerButton = screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" });
    expect(
      dividerLabel.compareDocumentPosition(providerButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders leading auth actions before oauth providers", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [{ provider: "google", label: "Google", start_url: "/oauth/google" }],
    });

    renderButtons({
      leadingActions: [
        {
          key: "email-code",
          label: "auth:LOGIN_EMAIL_CODE_ACTION",
          onClick: vi.fn(),
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" })).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveAccessibleName("auth:LOGIN_EMAIL_CODE_ACTION");
  });

  it("renders a single oauth provider as a full-width button", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [{ provider: "google", label: "Google", start_url: "/oauth/google" }],
    });

    renderButtons();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" })).toBeInTheDocument();
    });

    const button = screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" });
    expect(button).toHaveClass("w-full");
    expect(screen.getByText("auth:OAUTH_GOOGLE")).toBeInTheDocument();
  });

  it("keeps a single oauth provider disabled and busy while that provider is loading", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [{ provider: "google", label: "Google", start_url: "/oauth/google" }],
    });

    renderButtons({ loadingProvider: "google" });

    const button = await screen.findByRole("button", { name: "auth:OAUTH_GOOGLE" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("auth:OAUTH_GOOGLE")).not.toBeInTheDocument();
    expect(screen.queryByText("Google")).not.toBeInTheDocument();
  });

  it("renders two oauth providers in a compact two-column grid", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [
        { provider: "google", label: "Google", start_url: "/oauth/google" },
        { provider: "github", label: "GitHub", start_url: "/oauth/github" },
      ],
    });

    renderButtons();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "auth:OAUTH_GITHUB" })).toBeInTheDocument();
    });

    const googleButton = screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" });
    const grid = googleButton.parentElement;
    expect(grid).toHaveClass("grid");
    expect(grid).toHaveClass("grid-cols-2");
    expect(grid).not.toHaveClass("overflow-x-auto");
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.queryByText("auth:OAUTH_GOOGLE")).not.toBeInTheDocument();
    expect(screen.queryByText("auth:OAUTH_GITHUB")).not.toBeInTheDocument();
  });

  it("renders three oauth providers as icon-only buttons with tooltip labels", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [
        { provider: "google", label: "Google", start_url: "/oauth/google" },
        { provider: "github", label: "GitHub", start_url: "/oauth/github" },
        { provider: "microsoft", label: "Microsoft", start_url: "/oauth/microsoft" },
      ],
    });

    renderButtons();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "auth:OAUTH_GITHUB" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Microsoft" })).toBeInTheDocument();
    });

    const grid = screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" }).parentElement;
    expect(grid).toHaveClass("grid");
    expect(grid).toHaveClass("grid-cols-3");
    expect(screen.queryByText("Google")).not.toBeInTheDocument();
    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
    expect(screen.queryByText("Microsoft")).not.toBeInTheDocument();
  });

  it("renders the password-login action on its own full-width row", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [{ provider: "google", label: "Google", start_url: "/oauth/google" }],
    });

    renderButtons({
      leadingActions: [
        {
          key: "password-login",
          label: "auth:LOGIN_EMAIL_CODE_USE_PASSWORD",
          onClick: vi.fn(),
        },
      ],
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "auth:LOGIN_EMAIL_CODE_USE_PASSWORD" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" })).toBeInTheDocument();
    });

    const passwordButton = screen.getByRole("button", {
      name: "auth:LOGIN_EMAIL_CODE_USE_PASSWORD",
    });
    const googleButton = screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" });

    expect(passwordButton).toHaveClass("w-full");
    expect(passwordButton.parentElement).not.toBe(googleButton.parentElement);
  });

  it("shows the last-used badge on the remembered oauth provider", async () => {
    localStorage.setItem(STORAGE_KEYS.authLastSsoProvider, "google");
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [
        { provider: "google", label: "Google", start_url: "/oauth/google" },
        { provider: "github", label: "GitHub", start_url: "/oauth/github" },
      ],
    });

    renderButtons();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" })).toBeInTheDocument();
    });

    const googleButton = screen.getByRole("button", { name: "auth:OAUTH_GOOGLE" });
    expect(within(googleButton).getByText("auth:OAUTH_LAST_USED")).toBeInTheDocument();
  });

  it("renders the email-code action on its own full-width row", async () => {
    listSSOProvidersMock.mockResolvedValueOnce({
      providers: [{ provider: "google", label: "Google", start_url: "/oauth/google" }],
    });

    renderButtons({
      leadingActions: [
        {
          key: "email-code",
          label: "auth:LOGIN_EMAIL_CODE_ACTION",
          onClick: vi.fn(),
        },
      ],
    });

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
