import { createManagementSdk } from "../src";

const sdk = createManagementSdk({
  baseUrl: "https://api.arclayer.test",
  token: () => process.env.ARCLAYER_MANAGEMENT_TOKEN,
});

async function run() {
  const models = await sdk.content.models.list({
    page: 1,
    projectId: "project_public_id",
    size: 20,
  });

  const published = await sdk.releases.publish({
    projectId: "project_public_id",
  });

  console.log(models.items.length, published.requestId);
}

void run();
