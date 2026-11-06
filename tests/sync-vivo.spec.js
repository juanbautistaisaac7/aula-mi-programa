// S2 · Los cambios llegan solos (≤ 15 s) y se puede actualizar a mano.
// Dos "dispositivos" (dos contextos) contra la función real con un KV falso; red mockeada.
const { test, expect, devices } = require("@playwright/test");
const path = require("path");
const { pathToFileURL } = require("url");
const { openApp } = require("./helpers");

const KEY = "Zx9_kLm2Qa7-Rt5vWb3nYp";
const loadFn = () => import(pathToFileURL(path.join(__dirname, "..", "functions", "api", "sync.js")).href);
function fakeKV() { const m = new Map(); return { m, get: async k => m.has(k) ? m.get(k) : null, put: async (k, v) => { m.set(k, v); } }; }
async function device(browser, server, opts = {}) {
  const { onRequest } = await loadFn();
  const ctx = await browser.newContext({ ...(opts.mobile ? devices["Pixel 7"] : {}), baseURL: "http://localhost:4173", serviceWorkers: "block", timezoneId: "America/Argentina/Buenos_Aires", locale: "es-AR" });
  const page = await ctx.newPage();
  const net = { gets: 0, fullGets: 0, sameGets: 0, puts: 0, bytes: 0 };
  await page.route("**/api/sync", async route => {
    const r = route.request();
    if (r.method() === "PUT") net.puts++; else net.gets++;
    const req = new Request("https://aula.test/api/sync", { method: r.method(), headers: r.headers(), body: r.method() === "PUT" ? r.postData() : undefined });
    const res = await onRequest({ request: req, env: server.env });
    const body = await res.text();
    if (r.method() === "GET") { net.bytes += body.length; if (body.includes('"same":true')) net.sameGets++; else net.fullGets++; }
    await route.fulfill({ status: res.status, body, headers: { "content-type": "application/json" } });
  });
  if (opts.clock) await page.clock.install();
  const errors = await openApp(page);
  return { ctx, page, net, errors };
}
const titles = page => page.evaluate(() => state.tasks.map(t => t.title).sort());
const status = page => page.evaluate(() => syncStat.kind);
const connect = async d => { await d.page.evaluate(k => syncConnect(k), KEY); await expect.poll(() => status(d.page)).toBe("ok"); };

test.describe("S2 · función: 'sin cambios' barato", () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== "desktop", "no usa navegador"); });
  test("GET con la versión que ya tengo responde corto; con otra, el documento entero", async () => {
    const { onRequest } = await loadFn();
    const env = { AULA_KV: fakeKV() };
    const req = (method, body, have) => new Request("https://aula.test/api/sync", { method, body: body ? JSON.stringify(body) : undefined,
      headers: Object.assign({ authorization: "Bearer " + KEY, "content-type": "application/json" }, have != null ? { "x-aula-have": String(have) } : {}) });
    const big = { tasks: Array.from({ length: 200 }, (_, i) => ({ id: "t" + i, title: "Tarea número " + i })) };
    expect((await onRequest({ request: req("PUT", { baseVersion: 0, data: big }), env })).status).toBe(200);
    let r = await onRequest({ request: req("GET", null, 1), env });
    expect(r.status).toBe(200);
    const txt = await r.text();
    expect(JSON.parse(txt)).toEqual({ version: 1, same: true });
    expect(txt.length).toBeLessThan(40);
    r = await onRequest({ request: req("GET", null, 0), env });
    expect((await r.json()).data).toEqual(big);
    r = await onRequest({ request: req("GET", null, "basura"), env }); // un valor raro: documento entero, nunca error
    expect((await r.json()).version).toBe(1);
    r = await onRequest({ request: req("GET"), env });
    expect((await r.json()).data).toEqual(big);
  });
});

test.describe("S2 · cambios en vivo entre dos dispositivos", () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== "desktop", "dos contextos: alcanza con uno"); });

  test("un cambio en la compu llega solo al celu en ≤ 15 s; sin cambios no redibuja ni sube nada", async ({ browser }) => {
    const server = { env: { AULA_KV: fakeKV() } };
    const A = await device(browser, server), B = await device(browser, server, { clock: true });
    await connect(A); await connect(B);
    await B.page.clock.runFor(11000); // una vuelta "sin cambios" para llegar a régimen
    await expect.poll(() => B.net.sameGets).toBeGreaterThan(0);
    // sin cambios: no redibuja, no sube, y la respuesta es chica
    await B.page.evaluate(() => { window.__renders = 0; const r = render; render = function () { window.__renders++; return r.apply(this, arguments); }; });
    const before = { ...B.net };
    for (let i = 1; i <= 3; i++) { // de a una vuelta por vez (si no, el reloj simulado corta el pedido a los 20 s)
      await B.page.clock.runFor(10000);
      await expect.poll(() => B.net.sameGets - before.sameGets).toBe(i);
    }
    expect(B.net.puts).toBe(before.puts);
    expect(B.net.fullGets).toBe(before.fullGets);
    expect((B.net.bytes - before.bytes) / (B.net.gets - before.gets)).toBeLessThan(60);
    expect(await B.page.evaluate(() => window.__renders)).toBe(0);
    // A crea una tarea y la sube
    await A.page.evaluate(() => { quickAddTask({ title: "Hecha en la compu", date: todayISO() }); change(); return syncNow(); });
    expect(await titles(B.page)).not.toContain("Hecha en la compu");
    await B.page.clock.runFor(15000);
    await expect.poll(() => titles(B.page)).toContain("Hecha en la compu");
    await expect(B.page.locator("#view")).toContainText("Hecha en la compu");
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close(); await B.ctx.close();
  });

  test("lo que cambio acá se sube aunque el otro lado no haya cambiado", async ({ browser }) => {
    const server = { env: { AULA_KV: fakeKV() } };
    const A = await device(browser, server), B = await device(browser, server);
    await connect(A); await connect(B);
    await B.page.evaluate(() => syncNow()); // B ya conoce la versión: la próxima pasada pregunta "¿hay algo nuevo?"
    await B.page.evaluate(() => { quickAddTask({ title: "Desde el celu", date: todayISO() }); return syncNow(); });
    expect(B.net.sameGets).toBeGreaterThan(0);
    await A.page.evaluate(() => syncNow());
    expect(await titles(A.page)).toContain("Desde el celu");
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close(); await B.ctx.close();
  });

  test("con un formulario abierto no te pisa lo que escribís: se aplica al cerrar", async ({ browser }) => {
    const server = { env: { AULA_KV: fakeKV() } };
    const A = await device(browser, server), B = await device(browser, server, { clock: true });
    await connect(A); await connect(B);
    await B.page.evaluate(() => openQuickTask());
    await B.page.fill("#qt_title", "Estoy escribiendo esto");
    await A.page.evaluate(() => { quickAddTask({ title: "Remota", date: todayISO() }); change(); return syncNow(); });
    await B.page.clock.runFor(30000);
    await B.page.waitForTimeout(300);
    expect(await titles(B.page)).not.toContain("Remota");
    await expect(B.page.locator("#qt_title")).toHaveValue("Estoy escribiendo esto");
    await expect(B.page.locator("#modalbg")).toHaveClass(/open/);
    await B.page.press("#qt_title", "Enter"); // guarda y cierra
    await B.page.clock.runFor(5000);
    await expect.poll(() => titles(B.page)).toEqual(["Estoy escribiendo esto", "Remota"]);
    await A.page.evaluate(() => syncNow());
    expect(await titles(A.page)).toEqual(["Estoy escribiendo esto", "Remota"]);
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close(); await B.ctx.close();
  });

  test("volver a la app (focus / pageshow / online) sincroniza enseguida", async ({ browser }) => {
    const server = { env: { AULA_KV: fakeKV() } };
    const A = await device(browser, server), B = await device(browser, server);
    await connect(A); await connect(B);
    for (const ev of ["focus", "pageshow", "online"]) {
      await A.page.evaluate(t => { quickAddTask({ title: t, date: todayISO() }); change(); return syncNow(); }, "Por " + ev);
      await B.page.waitForTimeout(2100); // entre dos disparadores seguidos hay una pausa mínima
      await B.page.evaluate(e => window.dispatchEvent(new Event(e)), ev);
      await expect.poll(() => titles(B.page), { timeout: 4000 }).toContain("Por " + ev);
    }
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close(); await B.ctx.close();
  });
});

test.describe("S2 · actualizar a mano", () => {
  test("tocar el indicador de arriba fuerza la sincronización: Actualizando… → Al día", async ({ browser }, info) => {
    test.skip(info.project.name !== "desktop", "dos contextos: alcanza con uno");
    const server = { env: { AULA_KV: fakeKV() } };
    const A = await device(browser, server), B = await device(browser, server);
    await connect(A); await connect(B);
    await expect(B.page.locator("#saveTxt")).toHaveText("al día");
    await A.page.evaluate(() => { quickAddTask({ title: "Para el botón", date: todayISO() }); change(); return syncNow(); });
    let release; const gate = new Promise(r => release = r);
    await B.page.route("**/api/sync", async route => { await gate; await route.fallback(); }); // frena la respuesta para ver el "Actualizando…"
    await B.page.locator("#saveInd").click();
    await expect(B.page.locator("#saveTxt")).toHaveText("actualizando…");
    release();
    await expect(B.page.locator("#saveTxt")).toHaveText("al día · recién");
    expect(await titles(B.page)).toContain("Para el botón");
    const box = await B.page.locator("#saveInd").boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close(); await B.ctx.close();
  });

  test("en el celu, tirar hacia abajo desde arriba actualiza (y un tirón corto o de costado no)", async ({ browser }, info) => {
    test.skip(info.project.name !== "mobile", "gesto táctil: proyecto mobile");
    const server = { env: { AULA_KV: fakeKV() } };
    const A = await device(browser, server), B = await device(browser, server, { mobile: true });
    await connect(A); await connect(B);
    await B.page.evaluate(() => go("today"));
    await A.page.evaluate(() => { quickAddTask({ title: "Tirando para abajo", date: todayISO() }); change(); return syncNow(); });
    const cdp = await B.ctx.newCDPSession(B.page);
    const pull = async (dx, dy, steps = 8) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 200 }] });
      for (let i = 1; i <= steps; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200 + dx * i / steps, y: 200 + dy * i / steps }] });
        await B.page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    const gets = () => B.net.gets;
    // tirón corto: no actualiza
    let g = gets();
    await pull(0, 50);
    await B.page.waitForTimeout(400);
    expect(gets()).toBe(g);
    // de costado: no actualiza
    await pull(180, 60);
    await B.page.waitForTimeout(400);
    expect(gets()).toBe(g);
    // tirón largo: aparece el indicador y actualiza
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 200 }] });
    for (let i = 1; i <= 10; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: 200 + 26 * i }] }); await B.page.waitForTimeout(16); }
    await expect(B.page.locator("#ptr")).toHaveClass(/ready/);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => titles(B.page)).toContain("Tirando para abajo");
    await expect(B.page.locator("#view")).toContainText("Tirando para abajo");
    await expect(B.page.locator("#ptr")).not.toHaveClass(/on/);
    expect(gets()).toBeGreaterThan(g);
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close(); await B.ctx.close();
  });
});
