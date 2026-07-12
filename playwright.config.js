const { defineConfig, devices } = require("@playwright/test");

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
    baseURL: "http://127.0.0.1:8765",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node scripts/serve-local.js",
    url: "http://127.0.0.1:8765",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [
    { name: "mobile", use: { ...devices["iPhone 13 Mini"], browserName: "chromium" } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } }
  ]
});
