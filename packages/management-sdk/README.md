# @arclayer/management-sdk

Management SDK for building Arclayer website-builder workflows from external
tools, scripts, and AI runtimes.

The SDK is intentionally project-first: create or select a project, then operate
on its source tree, content models, content items, domains, releases, site
settings, and AI workspace actions through one typed facade.

## What It Is For

- Create a real enterprise landing-site project from an AI workspace action.
- Bootstrap homepage content, reusable block models, route bindings, hierarchy
  nodes, component bindings, source files, and release readiness checks.
- Read and mutate a project's React + Vite source tree.
- Manage website content models and content items without dropping to raw
  OpenAPI calls.
- Run release dry-runs, publish releases, verify domains, and create preview
  tokens.
- Keep AI build actions tied to real project services instead of mock or
  proposal-only flows.

## Framework Policy

React + Vite is the default project framework.

Use `framework: "react_vite"` unless the caller explicitly requests Astro.
Astro is supported as `framework: "astro"` for the source/content/preview/editor
workflow through Astro pages plus React islands. Do not select Astro implicitly;
that keeps the default project shape predictable for the Admin editor and source
CRUD tools.

## Quick Start

```ts
import { createManagementSdk } from "@arclayer/management-sdk";

const sdk = createManagementSdk({
  baseUrl: "https://api.arclayer.localhost",
  token: () => process.env.ARCLAYER_MANAGEMENT_TOKEN,
});

const project = sdk.forProject("project_public_id");
const overview = await project.getOverview();
const source = await project.source.getStructure();

console.log(overview.site.data.siteId, source.data.appEntryFile?.path);
```

## Create An Enterprise Landing Site

`siteBuilder.createEnterpriseLandingSite()` is the highest-level product flow.
It asks the AI workspace action surface to create the real project, then links
the resulting project to site settings, homepage content, source structure,
models, domains, release readiness, and editor navigation.

```ts
const result = await sdk.siteBuilder.createEnterpriseLandingSite({
  brandName: "Northstar Advisory",
  canonicalUrl: "https://northstar.example.com",
  description: "Operational finance guidance for growing teams.",
  framework: "react_vite",
  googleAnalyticsMeasurementId: "G-REPLACE_ME",
  heroHeadline: "Finance operations that scale with the business.",
  heroSubheading:
    "Northstar Advisory helps leadership teams plan cash, reporting, and growth systems.",
  primaryCtaLabel: "Book a strategy call",
  publishRelease: true,
  sections: [
    {
      body: "Forecasting, board reporting, and operating rhythms built around the team.",
      key: "planning",
      title: "Strategic planning",
    },
  ],
  timezone: "America/New_York",
  workspaceId: "workspace_public_id",
});

console.log({
  editorPath: result.summary.editorPath,
  projectId: result.projectId,
  primaryDomain: result.primaryDomain?.hostname,
  release: result.bootstrap.release?.data.release.releaseNumber,
  routePath: result.createProjectSiteStructure?.routePath,
  summary: result.summary,
  sourceEntry: result.sourceStructure.data.appEntryFile?.path,
});
```

The result includes:

- `project`: project-scoped SDK facade.
- `settings`: patched website, SEO, analytics, and localization settings.
- `sourceSettings`: patched source framework/build settings.
- `sourceStructure`: readable source tree and selected app entry file.
- `contentModels`: models created or available for the site.
- `bootstrap`: homepage, route bindings, hierarchy nodes, component bindings,
  source manifest, release dry-run, and optional release publish result.
- `domains` and `primaryDomain`: current domain console state.
- `createProjectSiteStructure`: parsed `workspace.create_site_structure` tool
  call emitted by the backend when available.
- `summary`: SDK-level readiness summary with editor path, primary domain,
  homepage item, route path, hierarchy count, component binding count, source
  file count, app entry path, release number, and release readiness.

See `examples/enterprise-landing-site.ts` for an end-to-end script that validates
the generated route, hierarchy, component bindings, source file, content model
field updates, homepage update, and AI follow-up action.

## Update An Enterprise Landing Site

Use `project.site.updateEnterpriseLandingPage()` when an AI runtime or external
tool needs to change an existing generated site. It keeps the common Hostinger /
Relume-style edit path in one typed operation: optional website settings,
optional source file operations, optional homepage content changes, release
dry-run, and optional release publish.

Use `project.source.updateSettings()` for framework, source provider, package
manager, build command, output directory, and artifact strategy changes.

```ts
const project = sdk.forProject("project_public_id");

const update = await project.site.updateEnterpriseLandingPage({
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
      defaultDescription:
        "Finance operations advisory for teams that need predictable growth.",
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

console.log(
  update.homepage?.publishedVersion?.data.versionNumber,
  update.sourceStructure?.data.appEntryFile?.path,
  update.releaseDryRun.data.readinessSummary.ready,
  update.release?.data.release.releaseNumber,
);
```

The helper always runs a release dry-run so callers can inspect readiness after
the edit. Publishing is explicit through `publishHomepage` and `publishRelease`;
the SDK does not silently publish just because content or source changed.

## Project-Scoped Workflow

Use `sdk.forProject(projectId)` when the project already exists.

```ts
const project = sdk.forProject("project_public_id");

await project.source.updateSettings({
  framework: "react_vite",
});

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

console.log(bootstrap.releaseDryRun.data.readinessSummary.ready);
```

## Source CRUD

```ts
const manifest = await project.source.getManifest();
const app = await project.source.readFile({ filePath: "src/App.tsx" });

await project.source.upsertFile({
  filePath: "src/arclayer/generated-content.ts",
  body: {
    contents: "export const headline = 'Updated by SDK';\n",
    language: "typescript",
    role: "content",
  },
});

await project.source.applyPatch({
  operations: [
    {
      kind: "upsert",
      filePath: "src/arclayer/site-copy.ts",
      body: {
        contents: "export const cta = 'Talk to us';\n",
        language: "typescript",
        role: "content",
      },
    },
  ],
});

console.log(manifest.data.files?.length, app.data.contents.length);
```

Source writes use the canonical project source endpoints. The SDK does not fake
success; API errors surface as `ManagementApiError`.

## Source Settings

Use the source namespace for project framework and build configuration. This
keeps Project Settings separate from Website Config: public website fields live
under `project.site.patchCoreSettings()` or the site-builder helpers, while
framework/source/build fields live under `project.source.updateSettings()`.

```ts
await project.source.updateSettings({
  artifactStrategy: "object_storage",
  buildCommand: "pnpm build",
  framework: "react_vite",
  outputDirectory: "dist",
  packageManager: "pnpm",
  rootDirectory: ".",
  sourceProvider: "managed",
});

await project.source.updateSettings({
  buildCommand: "pnpm astro build",
  framework: "astro",
  sourceProvider: "git",
});
```

`updateSettings()` only sends fields you provide, so changing `framework` does
not implicitly rewrite package manager, output directory, or artifact strategy.

## Content Models And Content Items

```ts
const models = await project.content.models.list({ page: 1, size: 20 });
const pageModel = models.items.find((model) => model.singularKey === "page");

if (pageModel) {
  await project.content.models.fields.create({
    modelId: pageModel.id,
    body: {
      key: "trustSignal",
      label: "Trust signal",
      required: false,
      scalar: "text",
    },
  });
}

await project.site.updateHomepageDraft({
  fields: {
    trustSignal: "Trusted by teams that need clear operating numbers.",
  },
  publish: true,
});
```

For AI-assisted content model changes, use:

```ts
await project.content.models.updateWithAi({
  message: "Add a proof point field to the page model.",
  modelId: "model_public_id",
  workspaceId: "workspace_public_id",
});
```

## Domains, Preview, And Releases

```ts
const domains = await project.domains.list({ page: 1, size: 100 });
const dryRun = await project.releases.dryRun();
const release = await project.releases.publish();
const previewToken = await project.site.createPreviewToken({
  body: {
    ttlSeconds: 900,
  },
});

console.log(
  domains.items[0]?.hostname,
  dryRun.data.readinessSummary.ready,
  release.data.release.releaseNumber,
  previewToken.data.token,
);
```

## AI Workspace Actions

Project-scoped AI calls automatically inject the target project id:

```ts
const action = await project.ai.executeWorkspaceAction({
  body: {
    message:
      "Update the homepage hero copy and keep the project source tree readable.",
    mode: "build",
    workspaceId: "workspace_public_id",
  },
});

console.log(action.data.navigation?.path);
```

Use global `sdk.ai.executeWorkspaceAction()` for workspace-level operations such
as creating a new project.

## Examples

- `examples/basic.ts`: project overview, source tree, and AI read action.
- `examples/content-release-flow.ts`: homepage bootstrap, source patch,
  release dry-run, publish, and preview token.
- `examples/enterprise-landing-site.ts`: full Hostinger/Relume-style creation
  flow with source, content model, homepage, domain, release, and AI follow-up
  validation.
- `examples/update-enterprise-landing-page.ts`: follow-up edit flow for an
  existing project that patches settings, source, homepage content, release
  readiness, and optional publishing in one call.

## Error Handling

```ts
import { isManagementApiError } from "@arclayer/management-sdk";

try {
  await project.releases.publish();
} catch (error) {
  if (isManagementApiError(error)) {
    console.error(error.code, error.message, error.requestId);
    throw error;
  }
  throw error;
}
```

Errors from the API are explicit. The SDK does not introduce mock responses,
silent fallbacks, or local simulation paths.
