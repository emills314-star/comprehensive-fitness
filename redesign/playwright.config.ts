import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../tests/redesign",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4175",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone-320", use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 760 } } },
    { name: "phone-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: "npm.cmd run redesign:dev",
    cwd: ".",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
