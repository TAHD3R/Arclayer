import { createManagementSdk } from "../src";

const sdk = createManagementSdk({
  baseUrl: "https://api.arclayer.test",
  token: () => process.env.ARCLAYER_MANAGEMENT_TOKEN,
});

async function run() {
  const models = await sdk.content.models.list({
    workspaceId: "workspace_public_id",
    page: 1,
    size: 20,
  });

  const published = await sdk.releases.publish({
    workspaceId: "workspace_public_id",
  });

  console.log(models.items.length, published.requestId);
}

void run();
