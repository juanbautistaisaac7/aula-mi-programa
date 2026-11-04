// @ts-check
const { defineConfig, devices } = require("@playwright/test");

// Usa el Chrome del sistema si existe (no requiere descargar navegadores).
// Si no hay Chrome, correr: npx playwright install chromium  y borrar "channel".
const fs = require("fs");
const hasChrome = fs.existsSync("/usr/bin/google-chrome");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    timezoneId: "America/Argentina/Buenos_Aires",
    locale: "es-AR",
    serviceWorkers: "block",
    ...(hasChrome ? { channel: "chrome" } : {})
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...(hasChrome ? { channel: "chrome" } : {}) } },
    { name: "mobile", use: { ...devices["Pixel 7"], ...(hasChrome ? { channel: "chrome" } : {}) } }
  ],
  webServer: {
    command: "node tests/serve.mjs 4173",
    url: "http://localhost:4173",
    reuseExistingServer: true
  }
});
