export type RoutePointer = {
  tenantId: string;
  locale: string;
  path: string;
  artifactKey: string;
};

export type PublishedArtifact = {
  artifactKey: string;
  kind: "html" | "json";
  html?: string;
  payload?: Record<string, unknown>;
  etag?: string;
};

export type DeliveryArtifactLoader = {
  loadRoutePointer(input: { tenantId: string; locale: string; path: string }): Promise<RoutePointer | null>;
  loadArtifact(input: { tenantId: string; artifactKey: string }): Promise<PublishedArtifact | null>;
};

function makeRouteKey(input: { tenantId: string; locale: string; path: string }): string {
  return `${input.tenantId}::${input.locale}::${input.path}`;
}

function makeArtifactKey(input: { tenantId: string; artifactKey: string }): string {
  return `${input.tenantId}::${input.artifactKey}`;
}

export class InMemoryArtifactLoader implements DeliveryArtifactLoader {
  private readonly routePointers = new Map<string, RoutePointer>();
  private readonly artifacts = new Map<string, PublishedArtifact>();

  constructor(input: {
    routePointers: readonly RoutePointer[];
    artifacts: readonly (PublishedArtifact & { tenantId: string })[];
  }) {
    for (const pointer of input.routePointers) {
      this.routePointers.set(makeRouteKey(pointer), pointer);
    }
    for (const artifact of input.artifacts) {
      this.artifacts.set(makeArtifactKey(artifact), artifact);
    }
  }

  async loadRoutePointer(input: { tenantId: string; locale: string; path: string }): Promise<RoutePointer | null> {
    return this.routePointers.get(makeRouteKey(input)) ?? null;
  }

  async loadArtifact(input: { tenantId: string; artifactKey: string }): Promise<PublishedArtifact | null> {
    return this.artifacts.get(makeArtifactKey(input)) ?? null;
  }
}
