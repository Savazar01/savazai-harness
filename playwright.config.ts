import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: "http://localhost:3055",
    extraHTTPHeaders: {
      "Content-Type": "application/json",
    },
  },
  projects: [
    {
      name: "api",
      testMatch: "**/*.spec.ts",
    },
  ],
});
