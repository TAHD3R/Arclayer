import publishContract from "@/data/publish-contract.json";

type RoutePointer = {
  tenantId: string;
  locale: string;
  path: string;
  artifactKey: string;
};

type Artifact = {
  tenantId: string;
  artifactKey: string;
  kind: "json" | "html";
  payload?: Record<string, unknown>;
  html?: string;
};

type PublishContract = {
  routePointers: RoutePointer[];
  artifacts: Artifact[];
};

const contract = publishContract as PublishContract;
const artifactMap = new Map(contract.artifacts.map((artifact) => [artifact.artifactKey, artifact]));

export function resolveArtifactByPath(path: string): Artifact | null {
  const route = contract.routePointers.find((pointer) => pointer.path === path);
  if (!route) {
    return null;
  }
  return artifactMap.get(route.artifactKey) ?? null;
}
