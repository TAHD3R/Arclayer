import {
  createManagementSdk,
  isManagementApiError,
  isManagementSitePageModel,
  readManagementContentModelFieldKeys,
} from "../src";

const workspaceId = requiredEnv("ARCLAYER_WORKSPACE_ID");

const sdk = createManagementSdk({
  baseUrl: process.env.ARCLAYER_API_URL ?? "https://api.arclayer.localhost",
  token: () => requiredEnv("ARCLAYER_MANAGEMENT_TOKEN"),
});

async function run() {
  try {
    const result = await sdk.siteBuilder.createEnterpriseLandingSite({
      brandName: "Northstar Advisory",
      canonicalUrl: "https://northstar.example.com",
      description: "Operational finance guidance for growing teams.",
      framework: "react_vite",
      googleAnalyticsMeasurementId: "G-REPLACE_ME",
      heroHeadline: "Finance operations that scale with the business.",
      heroSubheading:
        "Northstar Advisory helps leadership teams plan cash, reporting, and growth systems without adding process drag.",
      primaryCtaLabel: "Book a strategy call",
      publishRelease: true,
      sections: [
        {
          body: "Forecasting, board reporting, and operating rhythms built around the way your team works.",
          key: "planning",
          title: "Strategic planning",
        },
        {
          body: "A clean KPI layer that keeps finance, sales, and delivery aligned every week.",
          key: "visibility",
          title: "Performance visibility",
        },
      ],
      timezone: "America/New_York",
      workspaceId,
    });

    const appEntryPath = result.sourceStructure.data.appEntryFile?.path;
    if (!appEntryPath) {
      throw new Error("ARCLAYER_ENTERPRISE_LANDING_APP_ENTRY_REQUIRED");
    }
    const pageModel = result.contentModels.items.find(isManagementSitePageModel);
    if (!pageModel) {
      throw new Error("ARCLAYER_ENTERPRISE_LANDING_PAGE_MODEL_REQUIRED");
    }
    const routePaths = result.bootstrap.routeBindings.data.map((binding) => binding.path);
    if (!routePaths.includes("/")) {
      throw new Error("ARCLAYER_ENTERPRISE_LANDING_HOME_ROUTE_REQUIRED");
    }
    const hierarchyItemIds = result.bootstrap.hierarchyNodes.data.map((node) => node.itemId);
    if (!hierarchyItemIds.includes(result.bootstrap.homepage.item.data.id)) {
      throw new Error("ARCLAYER_ENTERPRISE_LANDING_HOME_HIERARCHY_REQUIRED");
    }
    const componentBindings = result.bootstrap.homepageComponentBindings.data.items ?? [];
    if (!componentBindings.some((binding) => binding.componentKey === "landing.hero")) {
      throw new Error("ARCLAYER_ENTERPRISE_LANDING_HERO_BINDING_REQUIRED");
    }
    const aiSiteStructure = result.createProjectSiteStructure;
    if (!aiSiteStructure?.routePath) {
      throw new Error("ARCLAYER_ENTERPRISE_LANDING_AI_ROUTE_REQUIRED");
    }
    if (
      !aiSiteStructure.componentBindings.some((binding) => binding.componentKey === "landing.hero")
    ) {
      throw new Error("ARCLAYER_ENTERPRISE_LANDING_AI_HERO_BINDING_REQUIRED");
    }

    const appFile = await result.project.source.readFile({ filePath: appEntryPath });
    const modelWithTrustSignal = await result.project.content.models.fields.create({
      body: {
        key: "trustSignal",
        label: "Trust signal",
        required: false,
        scalar: "text",
      },
      modelId: pageModel.id,
    });
    const updatedModel = await result.project.content.models.fields.update({
      body: {
        label: "Trust signal line",
      },
      fieldKey: "trustSignal",
      modelId: pageModel.id,
    });
    const fieldKeys = readManagementContentModelFieldKeys(
      updatedModel.data.fieldSchema ? updatedModel.data : modelWithTrustSignal.data,
    );
    await result.project.content.models.fields.reorder({
      body: {
        fieldKeys: [...fieldKeys],
      },
      modelId: pageModel.id,
    });
    await result.project.site.updateHomepageDraft({
      fields: {
        trustSignal: "Trusted by operators who need finance decisions they can defend.",
      },
      publish: true,
    });
    await result.project.ai.executeWorkspaceAction({
      body: {
        message:
          "Update the homepage hero subheading to emphasize predictable cash planning and keep the project source readable.",
        mode: "build",
        workspaceId,
      },
    });

    console.log({
      appBytes: appFile.data.contents.length,
      aiCreateProjectSiteStructure: {
        componentBindingCount: aiSiteStructure.componentBindingCount,
        hierarchyNodeCount: aiSiteStructure.hierarchyNodeCount,
        routePath: aiSiteStructure.routePath,
      },
      contentFieldKeys: fieldKeys,
      editorPath: result.summary.editorPath,
      homepageItemId: result.bootstrap.homepage.item.data.id,
      homepageComponentBindings: componentBindings.map((binding) => ({
        bindingKey: binding.bindingKey,
        componentKey: binding.componentKey,
      })),
      hierarchyItemIds,
      modelKeys: result.contentModels.items.map((model) => model.singularKey),
      primaryDomain: result.primaryDomain?.hostname,
      projectId: result.projectId,
      publishedRelease: result.bootstrap.release?.data.release.releaseNumber,
      ready: result.bootstrap.releaseDryRun.data.readinessSummary.ready,
      routePaths,
      summary: result.summary,
      sourceEntry: appEntryPath,
      sourceFiles: result.sourceStructure.data.manifest.files?.map((file) => file.path),
      sourceTree: result.sourceStructure.data.tree.map((node) => node.path),
    });
  } catch (error) {
    if (isManagementApiError(error)) {
      console.error(error.code, error.message, error.requestId);
      console.error(error.details);
      return;
    }
    throw error;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

void run();
