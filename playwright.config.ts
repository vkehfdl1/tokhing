import { defineConfig, devices } from "@playwright/test";
import localSupabase from "./scripts/local-supabase-env.mjs";

const { loadLocalSupabaseEnv } = localSupabase;
Object.assign(process.env, loadLocalSupabaseEnv());
delete process.env.NO_COLOR;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: ".omo/evidence/playwright-report",
        open: "never",
      },
    ],
  ],
  outputDir: ".omo/evidence/playwright-artifacts",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
      },
    },
  ],
  webServer: {
    command: "npm run dev:local",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
