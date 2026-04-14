import { useEffect, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RootLayout } from "@/routes/__root";

vi.mock("@tanstack/react-router", () => ({
  createRootRoute: (config: unknown) => config,
  Outlet: () => <div>outlet</div>,
  redirect: vi.fn(),
  useRouterState: () => ({
    pathname: "/",
    isPagePending: false,
  }),
}));

vi.mock("@/components/builtin/route-document-title-manager", () => ({
  RouteDocumentTitleManager: () => null,
}));

vi.mock("@/components/layout/scene-loading-overlay", () => ({
  SceneLoadingOverlay: () => null,
}));

vi.mock("@/components/layout/workspace-first-onboarding-overlay-host", () => ({
  WorkspaceFirstOnboardingOverlayHost: ({
    onBlockingChange,
  }: {
    pathname: string;
    onBlockingChange?: (blocking: boolean) => void;
  }) => {
    useEffect(() => {
      onBlockingChange?.(true);
    }, [onBlockingChange]);
    return <div>workspace-first-onboarding-overlay</div>;
  },
}));

vi.mock("@/lib/routing/scene-registry", () => ({
  resolveSceneKey: () => "global",
  getSceneLayout: () =>
    function Layout(props: { children: ReactNode }) {
      return <div data-testid="scene-layout">{props.children}</div>;
    },
}));

vi.mock("@arclayer/hooks/use-scene-reveal-transition", () => ({
  useSceneRevealTransition: () => ({
    displayedScene: "global",
    overlayVisible: false,
  }),
}));

vi.mock("@/stores/use-preference-store", () => ({
  usePreferencesStore: (selector: (state: { reduceMotion: boolean }) => unknown) =>
    selector({ reduceMotion: false }),
}));

describe("RootLayout workspace-first onboarding overlay", () => {
  it("marks the underlying shell inert while the blocking overlay is active", async () => {
    render(<RootLayout />);

    await waitFor(() => {
      expect(screen.getByTestId("root-scene-shell")).toHaveAttribute("inert");
    });
    expect(screen.getByTestId("root-scene-shell")).toHaveAttribute("aria-hidden", "true");
  });
});
