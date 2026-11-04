// Saca capturas de una vista con el fixture cargado: desktop y mobile, claro y oscuro.
// Uso: node tests/tools/capturar.js <id-item> <vista>[/<id>] [fixture]
//   ej: node tests/tools/capturar.js A1 backups
// Opcional: CLOCK="2026-11-04T00:30:00-03:00" (hora simulada), ACTION="openTaskEditor('t-3')" (JS a correr antes
// de la captura), NAME=sufijo (para no pisar capturas de la misma vista).
// Requiere el servidor de tests corriendo (npm run serve) en :4173.
const { chromium, devices } = require("playwright");
const fs = require("fs"), path = require("path");
const [item, view = "home", fx = "estado-v2.6.json"] = process.argv.slice(2);
const state = fs.readFileSync(path.join(__dirname, "..", "fixtures", fx), "utf8");
const out = path.join(__dirname, "..", "..", "docs", "capturas");
(async () => {
  const browser = await chromium.launch(fs.existsSync("/usr/bin/google-chrome") ? { channel: "chrome" } : {});
  for (const [dev, opts] of [["desktop", { viewport: { width: 1280, height: 800 } }], ["mobile", devices["Pixel 7"]]]) {
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({ ...opts, colorScheme: theme, timezoneId: "America/Argentina/Buenos_Aires", locale: "es-AR", serviceWorkers: "block" });
      const page = await ctx.newPage();
      await page.clock.install({ time: new Date(process.env.CLOCK || "2026-11-04T11:00:00-03:00") });
      await page.goto("http://localhost:4173/manifest.webmanifest");
      await page.evaluate(async ([json, theme]) => {
        const s = JSON.parse(json); s.settings.theme = theme; json = JSON.stringify(s);
        await new Promise((res, rej) => { const rq = indexedDB.open("aula-db", 1);
          rq.onupgradeneeded = () => { rq.result.createObjectStore("kv"); rq.result.createObjectStore("backups"); };
          rq.onsuccess = () => { const tx = rq.result.transaction("kv", "readwrite"); tx.objectStore("kv").put(json, "state"); tx.oncomplete = () => { rq.result.close(); res(); }; };
          rq.onerror = () => rej(rq.error); });
      }, [state, theme]);
      await page.goto("http://localhost:4173/#/" + view);
      await page.waitForFunction(() => typeof state !== "undefined" && state && state.tasks);
      if (process.env.ACTION) await page.evaluate(process.env.ACTION);
      await page.waitForTimeout(400);
      const file = path.join(out, `${item}-${process.env.NAME || view.replace(/\//g, "-")}-${dev}-${theme}.png`);
      await page.screenshot({ path: file });
      console.log(file);
      await ctx.close();
    }
  }
  await browser.close();
})();
