// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: ["**/ugly-padlet*.spec.js"],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 1000 },
    trace: "on-first-retry",
  },
  webServer: {
    command: "node tests/server.js",
    url: "http://127.0.0.1:4173/ugly-padlet-test.html",
    reuseExistingServer: !process.env["CI"],
    timeout: 10_000,
  },
});
