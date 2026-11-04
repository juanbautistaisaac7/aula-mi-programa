// X6 · El service worker no puede quedar vacío ni desfasado de la versión de la app
// (en la corrida de X3 sw.js se commiteó vacío por accidente y ningún test lo notó).
const { test, expect } = require("@playwright/test");
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");

test("sw.js existe, tiene sus handlers y su CACHE_VERSION coincide con APP_VERSION", async () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  expect(sw.length).toBeGreaterThan(500);
  for (const ev of ["install", "activate", "fetch"]) expect(sw).toContain(`addEventListener("${ev}"`);
  const appV = app.match(/const APP_VERSION = "([\d.]+)"/)[1];
  const cacheV = sw.match(/const CACHE_VERSION = "aula-v([\d.]+)"/)[1];
  expect(cacheV).toBe(appV);
  // todo lo que el shell cachea existe y no está vacío
  for (const f of ["index.html", "app.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"]) {
    expect(sw).toContain(`"./${f}"`);
    expect(fs.statSync(path.join(root, f)).size).toBeGreaterThan(100);
  }
});
