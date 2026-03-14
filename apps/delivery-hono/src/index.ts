import type { DeliveryArtifactLoader, RoutePointer } from "@/artifact-loader";
import {
  renderMissingArtifact,
  renderPublishedArtifact,
  renderRoutePointerMissing,
  renderTenantMissing,
} from "@/render-response";
import { resolveSiteFromRequest, type TenantConfig } from "@/site-resolver";

export type DeliveryAdapter = {
  fetch: (request: Request) => Promise<Response>;
};

async function resolvePointer(
  loader: DeliveryArtifactLoader,
  input: { tenantId: string; locale: string; path: string },
): Promise<RoutePointer | null> {
  return loader.loadRoutePointer(input);
}

export function createDeliveryAdapter(input: {
  tenants: readonly TenantConfig[];
  loader: DeliveryArtifactLoader;
}): DeliveryAdapter {
  const { tenants, loader } = input;
  return {
    fetch: async (request: Request) => {
      const resolvedSite = resolveSiteFromRequest(request, tenants);
      if (!resolvedSite) {
        return renderTenantMissing();
      }

      const pointer = await resolvePointer(loader, {
        tenantId: resolvedSite.tenantId,
        locale: resolvedSite.locale,
        path: resolvedSite.routePath,
      });
      if (!pointer) {
        return renderRoutePointerMissing(resolvedSite.routePath);
      }

      const artifact = await loader.loadArtifact({
        tenantId: resolvedSite.tenantId,
        artifactKey: pointer.artifactKey,
      });
      if (!artifact) {
        return renderMissingArtifact(pointer.artifactKey);
      }
      return renderPublishedArtifact(artifact);
    },
  };
}
