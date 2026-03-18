export type PublishArtifact = {
  artifactKey: string;
  kind: "json";
  payload: unknown;
};

export type PublishContract = {
  routePointers: Array<{
    path: string;
    artifactKey: string;
  }>;
  artifacts: PublishArtifact[];
};

export async function loadPublishContract(): Promise<PublishContract> {
  const module = await import("../../data/publish-contract.json");
  return module.default as PublishContract;
}
