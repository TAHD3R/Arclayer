import { defineConfig } from "@playwright/test";

// Debug artifacts root; relative paths resolve against this config file's
// directory, so artifacts stay in output/playwright regardless of invocation cwd.
const OUTPUT_ROOT = "output/playwright";

export default defineConfig({
  testDir: ".",
  testMatch: [
    "apps/app/test/browser/**/*.spec.ts",
    "apps/platform/test/browser/**/*.spec.ts",
  ],
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: `${OUTPUT_ROOT}/artifacts`,
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: `${OUTPUT_ROOT}/report` }],
  ],
  use: {
    browserName: "chromium",
    ignoreHTTPSErrors: false,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
