export type PublishRoutePointer = {
  tenantId: string;
  locale: string;
  path: string;
  artifactKey: string;
};

export type PublishArtifact = {
  tenantId: string;
  artifactKey: string;
  kind: "html" | "json";
  payload?: Record<string, unknown>;
  html?: string;
};

export type PublishContract = {
  routePointers: PublishRoutePointer[];
  artifacts: PublishArtifact[];
};

export type ExportBundleFile = {
  path: string;
  content: string;
};

export type ExportBundle = {
  target: "nextjs";
  files: ExportBundleFile[];
  publishContract: PublishContract;
  requiresHostedRuntime: false;
};

export function buildNextjsExportBundle(contract: PublishContract): ExportBundle {
  const metadata = JSON.stringify(
    {
      target: "nextjs",
      routePointers: contract.routePointers.length,
      artifacts: contract.artifacts.length,
      contractVersion: "v1",
    },
    null,
    2,
  );
  return {
    target: "nextjs",
    publishContract: contract,
    requiresHostedRuntime: false,
    files: [
      { path: "data/publish-contract.json", content: JSON.stringify(contract, null, 2) },
      { path: "export-meta.json", content: metadata },
    ],
  };
}
