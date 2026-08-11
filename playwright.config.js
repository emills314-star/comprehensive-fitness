const { defineConfig, devices } = require("@playwright/test");

const hostedBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
const requestedViewport = /^\d+x\d+$/.test(process.env.CF_VIEWPORT || "")
  ? Object.fromEntries(["width", "height"].map((key, index) => [key, Number(process.env.CF_VIEWPORT.split("x")[index])]))
  : null;

module.exports = defineConfig({
  testDir: "./tests/ui",
  outputDir: "artifacts/ui-audit/test-results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["line"],
    ["json", { outputFile: "artifacts/ui-audit/results.json" }],
    ["html", { outputFolder: "artifacts/ui-audit/html", open: "never" }]
  ],
  use: {
    baseURL: hostedBaseUrl || "http://127.0.0.1:8765",
    colorScheme: "light",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: hostedBaseUrl ? undefined : {
    command: "node scripts/serve-local.js",
    url: "http://127.0.0.1:8765",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [
    { name: "mobile", use: { ...devices["iPhone 13 Mini"], browserName: "chromium", ...(requestedViewport ? { viewport: requestedViewport } : {}) } },
    { name: "desktop", use: { browserName: "chromium", viewport: requestedViewport || { width: 1280, height: 900 } } }
  ]
});
