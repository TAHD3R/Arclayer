import { createManagementSdk, isManagementApiError } from "../src";

const sdk = createManagementSdk({
  baseUrl: "https://api.arclayer.test",
  token: () => process.env.ARCLAYER_MANAGEMENT_TOKEN,
});

async function run() {
  try {
    const impact = await sdk.releases.publishImpact({
      projectId: "project_public_id",
    });
    const previewContract = await sdk.releases.publishPreviewContract({
      projectId: "project_public_id",
    });
    const dryRun = await sdk.releases.dryRun({
      projectId: "project_public_id",
    });
    const release = await sdk.releases.publish({
      projectId: "project_public_id",
    });

    const previewToken = await sdk.site.createPreviewToken({
      body: {
        ttlSeconds: 900,
      },
      projectId: "project_public_id",
    });

    console.log(
      impact.data.readinessSummary?.ready,
      previewContract.data.routePointers?.length,
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
