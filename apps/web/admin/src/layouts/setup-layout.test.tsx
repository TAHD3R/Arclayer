import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: "/setup" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

vi.mock("@/components/common/admin-toggle-locales", () => ({
  AdminLocaleToggle: () => <button type="button">locale</button>,
}));

vi.mock("@/components/common/admin-toggle-theme", () => ({
  AdminThemeModeToggle: () => <button type="button">theme</button>,
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

import { SetupLayout } from "./setup-layout";

describe("SetupLayout", () => {
  test("removes legacy banner and card wrapper", () => {
    const { container } = render(
      <SetupLayout>
        <div>setup-content</div>
      </SetupLayout>,
    );

    expect(screen.queryByText("auth:SLOGAN_TITLE")).not.toBeInTheDocument();
    expect(container.querySelector(".ant-card")).toBeNull();
    expect(screen.getByText("setup-content")).toBeInTheDocument();
  });
});
