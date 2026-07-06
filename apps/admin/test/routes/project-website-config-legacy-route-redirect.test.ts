import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((payload: Record<string, unknown>) => ({
  __redirect: payload,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  redirect: (payload: Record<string, unknown>) => redirectMock(payload),
}));

import { Route as ContentGeneralRoute } from "@/routes/projects/$projectId/content/general/index";
import { Route as ContentDomainRoute } from "@/routes/projects/$projectId/content/domain/index";
import { Route as ContentLocalizationRoute } from "@/routes/projects/$projectId/content/localization/index";
import { Route as DeploymentsRoute } from "@/routes/projects/$projectId/deployments/index";
import { Route as SettingsDeploymentsRoute } from "@/routes/projects/$projectId/settings/deployments/index";
import { Route as SettingsDomainRoute } from "@/routes/projects/$projectId/settings/domain/index";

function expectRedirect(
  route: unknown,
  expected: {
    to: string;
    params: { projectId: string };
    replace: true;
  },
) {
  const beforeLoad = (
    route as {
      beforeLoad?: (input: { params: { projectId: string } }) => void;
    }
  ).beforeLoad;

  expect(beforeLoad).toBeTypeOf("function");

  try {
    beforeLoad?.({ params: expected.params });
    throw new Error("expected redirect");
  } catch (error) {
    expect(redirectMock).toHaveBeenCalledWith(expected);
    expect(error).toEqual({ __redirect: expected });
  }
}

describe("legacy project website config content routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects the old content general settings route into Website Config", () => {
    expectRedirect(ContentGeneralRoute, {
      to: "/projects/$projectId/seo/site",
      params: { projectId: "project-1" },
      replace: true,
    });
  });

  it("redirects the old content localization settings route into Website Config", () => {
    expectRedirect(ContentLocalizationRoute, {
      to: "/projects/$projectId/seo/site/localization",
      params: { projectId: "project-1" },
      replace: true,
    });
  });

  it("redirects the old content domain route into Website Domain", () => {
    expectRedirect(ContentDomainRoute, {
      to: "/projects/$projectId/website/domain",
      params: { projectId: "project-1" },
      replace: true,
    });
  });

  it("redirects the old project settings domain route into Website Domain", () => {
    expectRedirect(SettingsDomainRoute, {
      to: "/projects/$projectId/website/domain",
      params: { projectId: "project-1" },
      replace: true,
    });
  });

  it("redirects the old deployments route into Website Releases", () => {
    expectRedirect(DeploymentsRoute, {
      to: "/projects/$projectId/website/releases",
      params: { projectId: "project-1" },
      replace: true,
    });
  });

  it("redirects the old project settings deployments route into Website Releases", () => {
    expectRedirect(SettingsDeploymentsRoute, {
      to: "/projects/$projectId/website/releases",
      params: { projectId: "project-1" },
      replace: true,
    });
  });
});
