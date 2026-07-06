import { createManagementSdk, isManagementApiError } from "../src";

const sdk = createManagementSdk({
  baseUrl: "https://api.arclayer.test",
  token: () => process.env.ARCLAYER_MANAGEMENT_TOKEN,
});

async function run() {
  try {
    const project = sdk.forProject("project_public_id");

    const models = await project.content.models.list({ page: 1, size: 20 });
    const bootstrap = await project.site.bootstrapSite({
      homepage: {
        fields: {
          heroHeadline: "Managed by Arclayer",
        },
        path: "/",
        publish: true,
        title: "Home",
      },
      publishRelease: true,
      sourceOperations: [
        {
          body: {
            contents: "export const headline = 'Managed by Arclayer';\n",
            language: "typescript",
            role: "content",
          },
          filePath: "src/arclayer/generated-content.ts",
          kind: "upsert",
        },
      ],
    });
    const impact = await project.releases.publishImpact();
    const previewContract = await project.releases.publishPreviewContract();
    const dryRun = await project.releases.dryRun();
    const release = await project.releases.publish();

    const previewToken = await project.site.createPreviewToken({
      body: {
        ttlSeconds: 900,
      },
    });

    console.log(
      models.total,
      bootstrap.homepage.item.data.id,
      bootstrap.sourceManifest?.data.files?.length,
      impact.data.readinessSummary?.ready,
      previewContract.data.routePointers?.length,
      bootstrap.releaseDryRun.data.readinessSummary.ready,
      bootstrap.release?.data.release.releaseNumber,
      dryRun.data.readinessSummary.ready,
      release.data.release.releaseNumber,
      previewToken.data.token,
    );
  } catch (error) {
    if (isManagementApiError(error)) {
      console.error(error.code, error.message, error.requestId);
      console.error(error.details);
      return;
    }
    throw error;
  }
}

void run();
