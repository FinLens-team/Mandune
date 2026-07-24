import { defineConfig } from "@playwright/test";

function targetUrl(): string {
  const raw = process.env.E2E_TARGET_URL;
  if (!raw) {
    throw new Error("E2E_TARGET_URL is required; acceptance must name the deployed candidate URL.");
  }

  const url = new URL(raw);
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("E2E_TARGET_URL must be an origin URL without credentials, path, query, or hash.");
  }
  if (url.protocol !== "https:" && !(local && process.env.E2E_ALLOW_INSECURE_LOCALHOST === "1")) {
    throw new Error("E2E_TARGET_URL must use HTTPS (localhost requires E2E_ALLOW_INSECURE_LOCALHOST=1).");
  }
  return url.href;
}

const baseURL = targetUrl();
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  outputDir: "../../test-results/e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 120_000,
  workers: 1,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../../playwright-report" }],
  ],
  use: {
    baseURL,
    ignoreHTTPSErrors: false,
    launchOptions: executablePath ? { executablePath } : undefined,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "mobile-375-reduced-motion",
      use: {
        browserName: "chromium",
        hasTouch: true,
        isMobile: true,
        viewport: { width: 375, height: 812 },
      },
    },
  ],
});
