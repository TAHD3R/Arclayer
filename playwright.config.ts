import { defineConfig } from "@playwright/test";

const ACCEPTANCE_ROOT = "/tmp/arclayer-browser-acceptance";

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
  outputDir: `${ACCEPTANCE_ROOT}/artifacts`,
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: `${ACCEPTANCE_ROOT}/report` }],
  ],
  use: {
    browserName: "chromium",
    ignoreHTTPSErrors: false,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
