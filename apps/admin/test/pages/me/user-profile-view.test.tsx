import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserProfileView } from "@/pages/usercenter/profile/components/user-profile-view";

const meQueryState = {
  isLoading: false,
  data: {
    id: "user-1",
    username: "tester",
    email: "tester@example.com",
    displayName: "Tester",
  },
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => meQueryState,
  useMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string; searchStr: string } }) => unknown;
  }) =>
    select({
      location: {
        pathname: "/projects/ws-1/assets",
        searchStr: "?assetId=asset-1",
      },
    }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/stores/use-auth-store", () => ({
  useAuthStore: (selector: (state: { accessToken: string; sessionVersion: number }) => unknown) =>
    selector({
      accessToken: "token",
      sessionVersion: 1,
    }),
}));

vi.mock("@/api/auth", () => ({
  me: vi.fn(),
}));

vi.mock("@/pages/usercenter/profile/components/profile-basics-section", () => ({
  UserProfileBasicsSection: () => <div>profile-basics</div>,
}));

vi.mock("@/pages/usercenter/profile/components/profile-linked-accounts-section", () => ({
  UserLinkedAccountsSection: () => <div>linked-accounts</div>,
}));

vi.mock("@/pages/usercenter/profile/components/profile-account-security-section", () => ({
  UserProfileAccountSecuritySection: () => <div>account-security</div>,
}));

vi.mock("@/pages/usercenter/profile/components/profile-danger-section", () => ({
  UserDangerSection: () => <div>danger-section</div>,
}));

describe("UserProfileView", () => {
  beforeEach(() => {
    meQueryState.isLoading = false;
    meQueryState.data = {
      id: "user-1",
      username: "tester",
      email: "tester@example.com",
      displayName: "Tester",
    };
  });

  it("renders the danger section at the bottom of the profile view", () => {
    render(<UserProfileView mode="dialog" />);

    expect(screen.getByText("profile-basics")).toBeVisible();
    expect(screen.getByText("linked-accounts")).toBeVisible();
    expect(screen.getByText("account-security")).toBeVisible();
    expect(screen.getByText("danger-section")).toBeVisible();
  });

  it("shows an internal loading overlay while the profile query is pending", () => {
    meQueryState.isLoading = true;
    meQueryState.data = undefined as unknown as typeof meQueryState.data;

    render(<UserProfileView mode="dialog" />);

    expect(screen.getByLabelText("ME_TAB_PROFILE")).toBeVisible();
  });
});
