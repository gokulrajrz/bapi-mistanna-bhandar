import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/live-browser",
  use: { baseURL: "http://localhost:5175", headless: true },
  webServer: {
    command: "npm run dev -- --port 5175 --strictPort",
    url: "http://localhost:5175",
    reuseExistingServer: !process.env.CI,
    env: { VITE_DEMO_MODE: "false" },
  },
  timeout: 30000,
  reporter: "list",
});
