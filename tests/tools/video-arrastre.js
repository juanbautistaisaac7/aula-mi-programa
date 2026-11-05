// C5 · Graba en video el arrastre (desktop con mouse y celu con el dedo).
// Uso: node tests/tools/video-arrastre.js   (con el servidor de tests en :4173)
const { chromium, devices } = require("playwright");
const fs = require("fs"), path = require("path");
const out = path.join(__dirname, "..", "..", "docs", "capturas");
const seed = () => {
  ["Leer apunte de límites", "Resolver práctica 3", "Repasar teoría de grafos", "Hacer TP de Base de Datos", "Ver clase grabada", "Armar resumen de Economía"]
    .forEach((title, i) => { const t = quickAddTask({ title, date: todayISO(), estMin: 30 + i * 15 }); t.ord = i; });
  ["Practicar parcial", "Leer capítulo 4"].forEach(title => quickAddTask({ title, date: addDays(todayISO(), 1), estMin: 45 }));
  change(); go("today");
};
(async () => {
  const browser = await chromium.launch(fs.existsSync("/usr/bin/google-chrome") ? { channel: "chrome" } : {});
  for (const [name, opts] of [["desktop", { viewport: { width: 1100, height: 760 } }], ["mobile", devices["Pixel 7"]]]) {
    const dir = path.join(out, "tmp-" + name);
    const ctx = await browser.newContext({ ...opts, colorScheme: "light", timezoneId: "America/Argentina/Buenos_Aires", locale: "es-AR", serviceWorkers: "block", recordVideo: { dir, size: opts.viewport || { width: 412, height: 915 } } });
    const page = await ctx.newPage();
    await page.goto("http://localhost:4173/");
    await page.waitForFunction(() => typeof state !== "undefined" && state && state.tasks && document.querySelector("#sidebar a"));
    await page.evaluate(seed);
    await page.waitForTimeout(600);
    const box = async t => page.locator("#view .task", { hasText: t }).first().boundingBox();
    if (name === "desktop") {
      const drag = async (from, to, frac) => {
        const a = await box(from), b = await box(to);
        await page.mouse.move(a.x + 120, a.y + a.height / 2, { steps: 8 }); await page.mouse.down();
        await page.mouse.move(a.x + 120, b.y + b.height * frac, { steps: 45 });
        await page.waitForTimeout(250); await page.mouse.up(); await page.waitForTimeout(700);
      };
      await drag("Leer apunte", "Ver clase", 0.8);
      await drag("Armar resumen", "Resolver", 0.2);
      await drag("Repasar teoría", "Practicar parcial", 0.8);
    } else {
      const cdp = await ctx.newCDPSession(page);
      const send = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
      const drag = async (from, to, frac) => {
        const a = await box(from), b = await box(to);
        const x = a.x + 100, y0 = a.y + a.height / 2, y1 = b.y + b.height * frac;
        await send("touchStart", [{ x, y: y0 }]); await page.waitForTimeout(650);
        for (let i = 1; i <= 40; i++) { await send("touchMove", [{ x, y: y0 + (y1 - y0) * i / 40 }]); await page.waitForTimeout(16); }
        await page.waitForTimeout(250); await send("touchEnd", []); await page.waitForTimeout(800);
      };
      await drag("Leer apunte", "Ver clase", 0.8);
      await drag("Armar resumen", "Resolver", 0.2);
    }
    const v = page.video(); await ctx.close();
    fs.renameSync(await v.path(), path.join(out, `C5-arrastre-${name}.webm`)); fs.rmSync(dir, { recursive: true, force: true });
    console.log("C5-arrastre-" + name + ".webm");
  }
  await browser.close();
})();
