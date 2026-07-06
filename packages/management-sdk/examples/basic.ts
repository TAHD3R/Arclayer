import { createManagementSdk } from "../src";

const sdk = createManagementSdk({
  baseUrl: "https://api.arclayer.test",
  token: () => process.env.ARCLAYER_MANAGEMENT_TOKEN,
});

async function run() {
  const project = sdk.forProject("project_public_id");

  const overview = await project.getOverview();
  const source = await project.source.getStructure();
  const action = await project.ai.executeWorkspaceAction({
    body: {
      message: "Read the project source and summarize the editable site structure.",
      mode: "build",
      workspaceId: "workspace_public_id",
    },
  });

  console.log(
    overview.site.data.siteId,
    source.data.tree.map((node) => node.path),
    source.data.appEntryFile?.path,
    action.data.navigation?.path,
  );
}

void run();
