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
import { Route as SeoSiteRoute } from "@/routes/projects/$projectId/seo/site/index";
import { Route as SeoSiteLocalizationRoute } from "@/routes/projects/$projectId/seo/site/localization/index";
import { Route as WebsiteDomainRoute } from "@/routes/projects/$projectId/website/domain/index";
import { Route as WebsiteReleasesRoute } from "@/routes/projects/$projectId/website/releases/index";

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
      to: "/projects/$projectId/website/config",
      params: { projectId: "project-1" },
      replace: true,
    });
  });

  it("redirects the old content localization settings route into Website Config", () => {
    expectRedirect(ContentLocalizationRoute, {
      to: "/projects/$projectId/website/config",
      params: { projectId: "project-1" },
      replace: true,
    });
  });

  it("redirects the old SEO website config route into Website Config", () => {
    expectRedirect(SeoSiteRoute, {
      to: "/projects/$projectId/website/config",
      params: { projectId: "project-1" },
      replace: true,
    });
  });

  it("redirects the old SEO localization route into Website Config", () => {
    expectRedirect(SeoSiteLocalizationRoute, {
      to: "/projects/$projectId/website/config",
      params: { projectId: "project-1" },
      replace: true,
    });
  });

  it("redirects the old content domain route into Domains", () => {
    expectRedirect(ContentDomainRoute, {
      to: "/projects/$projectId/website/project-releases",
      params: { projectId: "project-1" },
      replace: true,
    });
  });

  it("redirects the old project settings domain route into Domains", () => {
    expectRedirect(SettingsDomainRoute, {
      to: "/projects/$projectId/website/project-releases",
      params: { projectId: "project-1" },
      replace: true,
    });
  });

  it("redirects the old deployments route into Domains", () => {
    expectRedirect(DeploymentsRoute, {
      to: "/projects/$projectId/website/project-releases",
      params: { projectId: "project-1" },
      replace: true,
    });
  });

  it("redirects the old project settings deployments route into Domains", () => {
    expectRedirect(SettingsDeploymentsRoute, {
      to: "/projects/$projectId/website/project-releases",
      params: { projectId: "project-1" },
      replace: true,
    });
  });

  it("redirects the former Website Domain route into Domains", () => {
    expectRedirect(WebsiteDomainRoute, {
      to: "/projects/$projectId/website/project-releases",
      params: { projectId: "project-1" },
      replace: true,
    });
  });

  it("redirects the former Website Releases route into Domains", () => {
    expectRedirect(WebsiteReleasesRoute, {
      to: "/projects/$projectId/website/project-releases",
      params: { projectId: "project-1" },
      replace: true,
    });
  });
});
