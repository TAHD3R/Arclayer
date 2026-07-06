import { createManagementSdk, isManagementApiError } from "../src";

const projectId = requiredEnv("ARCLAYER_PROJECT_ID");

const sdk = createManagementSdk({
  baseUrl: process.env.ARCLAYER_API_URL ?? "https://api.arclayer.localhost",
  token: () => requiredEnv("ARCLAYER_MANAGEMENT_TOKEN"),
});

async function run() {
  try {
    const project = sdk.forProject(projectId);
    const result = await project.site.updateEnterpriseLandingPage({
      changeSummary: "Refresh enterprise landing page positioning.",
      fields: {
        heroHeadline: "Predictable finance operations for scaling teams.",
        heroSubheading:
          "Turn planning, reporting, and cash visibility into a weekly operating system.",
      },
      publishHomepage: true,
      publishRelease: true,
      siteSettings: {
        seo: {
          defaultDescription: "Finance operations advisory for teams that need predictable growth.",
          sitemapEnabled: true,
        },
        site: {
          name: "Northstar Advisory",
        },
      },
      sourceOperations: [
        {
          body: {
            contents:
              "export const proofPoint = 'Trusted by operating teams that need finance clarity.';\n",
            language: "typescript",
            role: "content",
          },
          filePath: "src/arclayer/proof-point.ts",
          kind: "upsert",
        },
      ],
    });

    console.log({
      appEntryPath: result.sourceStructure?.data.appEntryFile?.path,
      homepageItemId: result.homepage?.item.id,
      homepagePublishedVersion: result.homepage?.publishedVersion?.data.versionNumber,
      releaseReady: result.releaseDryRun.data.readinessSummary.ready,
      releaseNumber: result.release?.data.release.releaseNumber,
      sourceFiles: result.sourceStructure?.data.manifest.files?.map((file) => file.path),
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
