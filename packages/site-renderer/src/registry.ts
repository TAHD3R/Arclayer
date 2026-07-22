import {
  LandingCta,
  LandingFeatureGrid,
  LandingHero,
  SiteFooter,
  SiteHeader,
  type VisitorComponent,
} from "./components";
import { SiteRendererContractError, SITE_RENDERER_VERSION } from "./contracts";

const VISITOR_COMPONENTS_V1 = Object.freeze({
  "site.header": SiteHeader,
  "landing.hero": LandingHero,
  "landing.feature-grid": LandingFeatureGrid,
  "landing.cta": LandingCta,
  "site.footer": SiteFooter,
} satisfies Record<string, VisitorComponent>);

export type OfficialVisitorComponentKey = keyof typeof VISITOR_COMPONENTS_V1;

export function resolveVisitorComponent(componentKey: string): VisitorComponent {
  const component = VISITOR_COMPONENTS_V1[componentKey as OfficialVisitorComponentKey];
  if (!component) {
    throw new SiteRendererContractError(
      "SITE_RENDERER_COMPONENT_UNKNOWN",
      `No ${SITE_RENDERER_VERSION} visitor component is registered for ${componentKey}`,
    );
  }
  return component;
}

export const officialVisitorComponentKeys = Object.freeze(
  Object.keys(VISITOR_COMPONENTS_V1) as OfficialVisitorComponentKey[],
);
