// L1c2 · Configuración con la sincronización activa (hallazgo #28 de docs/AUDITORIA.md).
// Mismo armado que sync-app.spec.js: dos contextos contra la función real con un KV falso.
const { test, expect } = require("@playwright/test");
const path = require("path");
const { pathToFileURL } = require("url");
const { openApp, readBackups } = require("./helpers");

const KEY = "Zx9_kLm2Qa7-Rt5vWb3nYp";
function fakeKV() { const m = new Map(); return { m, get: async k => m.has(k) ? m.get(k) : null, put: async (k, v) => { m.set(k, v); } }; }
async function device(browser, server) {
  const { onRequest } = await import(pathToFileURL(path.join(__dirname, "..", "functions", "api", "sync.js")).href);
  const ctx = await browser.newContext({ baseURL: "http://localhost:4173", serviceWorkers: "block", timezoneId: "America/Argentina/Buenos_Aires", locale: "es-AR" });
  const page = await ctx.newPage();
  const net = { down: false, puts: 0, beforePut: null };
  await page.route("**/api/sync", async route => {
    if (net.down) return route.abort("internetdisconnected");
    const r = route.request();
    if (r.method() === "PUT") { net.puts++; if (net.beforePut) { const f = net.beforePut; net.beforePut = null; await f(); } }
    const req = new Request("https://aula.test/api/sync", { method: r.method(), headers: r.headers(), body: r.method() === "PUT" ? r.postData() : undefined });
    const res = await onRequest({ request: req, env: server.env });
    await route.fulfill({ status: res.status, body: await res.text(), headers: { "content-type": "application/json" } });
  });
  const errors = await openApp(page);
  return { ctx, page, net, errors };
}
const titles = page => page.evaluate(() => fullState().tasks.map(t => t.title).sort());
const status = page => page.evaluate(() => syncStat.kind);

test.describe("reiniciar con la sincronización activa", () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== "desktop", "dos contextos: alcanza con uno"); });

  test("reinicia solo este dispositivo: el otro conserva todo y al reconectar vuelve", async ({ browser }) => {
    const server = { env: { AULA_KV: fakeKV() } };
    const A = await device(browser, server), B = await device(browser, server);
    await A.page.evaluate(() => { ["Leer apunte", "Hacer TP", "Repasar"].forEach(t => quickAddTask({ title: t, date: todayISO(), estMin: 30 })); change(); });
    await A.page.evaluate(k => syncConnect(k), KEY); await expect.poll(() => status(A.page)).toBe("ok");
    await B.page.evaluate(k => syncConnect(k), KEY); await expect.poll(() => status(B.page)).toBe("ok");
    expect(await titles(B.page)).toEqual(["Hacer TP", "Leer apunte", "Repasar"]);

    // A reinicia desde Configuración: la confirmación dice qué pasa con la sincronización
    await A.page.evaluate(() => go("config"));
    await A.page.getByRole("button", { name: "Reiniciar aplicación" }).click();
    await expect(A.page.locator("#confirmbox")).toContainText("otro dispositivo");
    await A.page.locator("#confirmOkBtn").click();
    await A.page.locator("#confirmOkBtn").click();
    await expect.poll(() => A.page.evaluate(() => fullState().tasks.length)).toBe(0);
    expect(await A.page.evaluate(() => syncOn())).toBe(false);
    // no quedaron lápidas que borren lo del otro si algún día se reconecta
    expect(await A.page.evaluate(() => Object.keys(state.sync.tombs || {}).filter(k => k.startsWith("tasks:")).length)).toBe(0);

    // B sigue con todo, aunque sincronice
    await B.page.evaluate(() => syncNow(true)); await expect.poll(() => status(B.page)).toBe("ok");
    expect(await titles(B.page)).toEqual(["Hacer TP", "Leer apunte", "Repasar"]);
    // A vuelve a conectarse con el mismo código: recupera lo de B
    await A.page.evaluate(k => syncConnect(k), KEY); await expect.poll(() => status(A.page)).toBe("ok");
    await expect.poll(() => titles(A.page)).toEqual(["Hacer TP", "Leer apunte", "Repasar"]);
    expect(await titles(B.page)).toEqual(["Hacer TP", "Leer apunte", "Repasar"]);
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close(); await B.ctx.close();
  });
});

test("Configuración en el celu: sin atajos de teclado y botones de 44 px (#29, #30)", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "solo con el dedo");
  const errors = await openApp(page);
  await page.evaluate(() => go("config"));
  await expect(page.getByRole("button", { name: "Ver atajos de teclado" })).toBeHidden();
  const chicos = await page.evaluate(() => [...document.querySelectorAll("#view .card button")].filter(b => b.offsetParent !== null)
    .filter(b => !b.closest(".remchip")) // la × de un aviso: su área táctil se agranda con ::after (ver index.html)
    .filter(b => !b.title?.startsWith("#") && !(b.getAttribute("aria-label") || "").startsWith("Color")).filter(b => b.getBoundingClientRect().height < 43.5).map(b => b.textContent.trim()));
  expect(chicos).toEqual([]);
  const x = page.locator(".remchip button").first();
  expect(await x.evaluate(b => { const a = getComputedStyle(b, "::after"); return parseFloat(a.top) <= -8 && a.position === "absolute"; })).toBe(true);
  expect(errors).toEqual([]);
});
