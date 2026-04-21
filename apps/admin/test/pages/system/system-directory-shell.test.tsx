import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemDirectoryShell } from "@/pages/system/directory/system-directory-shell";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";

let pathname = "/system/tenants/users";
const navigateSpy = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateSpy,
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

vi.mock("@/hooks/use-current-user-profile", () => ({
  useCurrentUserProfile: vi.fn(),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    description,
    action,
    extra,
    children,
  }: {
    title: string;
    description?: string;
    action?: React.ReactNode;
    extra?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      <div>{action}</div>
      <div>{extra}</div>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/builtin/forbidden-page", () => ({
  ForbiddenView: () => <div>forbidden</div>,
}));

vi.mock("@arclayer/ui/chrome-tabs", () => ({
  ChromeTabs: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ChromeTabsList: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ChromeTabsTrigger: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
}));

describe("SystemDirectoryShell", () => {
  beforeEach(() => {
    pathname = "/system/tenants/users";
    navigateSpy.mockReset();
    vi.mocked(useCurrentUserProfile).mockReturnValue({
      isSuperAdmin: true,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      profile: { isSuperAdmin: true },
    } as unknown as ReturnType<typeof useCurrentUserProfile>);
  });

  it("renders the directory title and tabs for super admins", () => {
    render(
      <SystemDirectoryShell>
        <div>directory body</div>
      </SystemDirectoryShell>,
    );

    expect(screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_TITLE")).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_DESC")).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_TAB_USERS")).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_TAB_ORGANIZATIONS"),
    ).toBeInTheDocument();
    expect(screen.getByText("directory body")).toBeInTheDocument();
  });
});
