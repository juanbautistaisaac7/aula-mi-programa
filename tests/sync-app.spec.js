// S1b · Dos "dispositivos" (dos contextos de navegador) sincronizando contra la
// función real (functions/api/sync.js) con un KV falso. La red está mockeada.
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
const titles = page => page.evaluate(() => state.tasks.map(t => t.title).sort());
const sync = page => page.evaluate(() => syncNow());
const status = page => page.evaluate(() => syncStat.kind);

test.describe("sincronización entre dos dispositivos", () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== "desktop", "dos contextos: alcanza con uno"); });

  test("crear, editar y borrar cruzado: terminan iguales y lo borrado no revive", async ({ browser }) => {
    const server = { env: { AULA_KV: fakeKV() } };
    const A = await device(browser, server), B = await device(browser, server);
    await A.page.evaluate(() => { ["Leer apunte", "Hacer TP", "Repasar"].forEach(t => quickAddTask({ title: t, date: todayISO(), estMin: 30 })); change(); });
    await A.page.evaluate(k => syncConnect(k), KEY); await expect.poll(() => status(A.page)).toBe("ok");
    await expect(A.page.locator("#saveTxt")).toHaveText("sincronizado");
    await B.page.evaluate(k => syncConnect(k), KEY); await expect.poll(() => status(B.page)).toBe("ok");
    expect(await titles(B.page)).toEqual(["Hacer TP", "Leer apunte", "Repasar"]);
    await expect(B.page.locator("#view")).toContainText("Leer apunte"); // se redibujó
    // B edita una y borra otra; A crea una nueva
    await B.page.evaluate(async () => {
      const t = state.tasks.find(x => x.title === "Hacer TP"); t.estMin = 95;
      state.tasks = state.tasks.filter(x => x.title !== "Repasar"); change();
    });
    await A.page.evaluate(() => { quickAddTask({ title: "Ver clase", date: todayISO() }); change(); });
    await sync(B.page); await sync(A.page); await sync(B.page); await sync(A.page);
    expect(await titles(A.page)).toEqual(["Hacer TP", "Leer apunte", "Ver clase"]);
    expect(await titles(B.page)).toEqual(await titles(A.page));
    expect(await A.page.evaluate(() => state.tasks.find(x => x.title === "Hacer TP").estMin)).toBe(95);
    // otra vuelta no revive "Repasar" ni sube nada si no cambió nada
    const puts = A.net.puts + B.net.puts;
    await sync(A.page); await sync(B.page);
    expect(await titles(A.page)).not.toContain("Repasar");
    expect(A.net.puts + B.net.puts).toBe(puts);
    // primera fusión con datos: copia de seguridad antes
    expect((await readBackups(B.page)).some(b => String(b.key).startsWith("presync-"))).toBe(true);
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close(); await B.ctx.close();
  });

  test("primera vez con datos en los dos lados: se suman, no se reemplaza nada", async ({ browser }) => {
    const server = { env: { AULA_KV: fakeKV() } };
    const A = await device(browser, server), B = await device(browser, server);
    await A.page.evaluate(() => { ["A1", "A2", "A3"].forEach(t => quickAddTask({ title: t, date: todayISO() })); state.settings.accent = "#0e7490"; change(); });
    await B.page.evaluate(() => { ["B1", "B2"].forEach(t => quickAddTask({ title: t, date: todayISO() })); change(); });
    // una tarea de cada lado vinculada a "su" Economía (ids distintos)
    for (const d of [A, B]) await d.page.evaluate(n => { quickAddTask({ title: n, date: todayISO(), subjectId: state.subjects.find(x => x.name === "Economía").id }); change(); }, d === A ? "EcoA" : "EcoB");
    await A.page.evaluate(k => syncConnect(k), KEY); await expect.poll(() => status(A.page)).toBe("ok");
    await B.page.evaluate(k => syncConnect(k), KEY); await expect.poll(() => status(B.page)).toBe("ok");
    await sync(A.page);
    await sync(B.page);
    expect(await titles(A.page)).toEqual(["A1", "A2", "A3", "B1", "B2", "EcoA", "EcoB"]);
    expect(await titles(B.page)).toEqual(["A1", "A2", "A3", "B1", "B2", "EcoA", "EcoB"]);
    for (const d of [A, B]) {
      const eco = await d.page.evaluate(() => { const ids = new Set(state.subjects.map(x => x.id)); const e = state.subjects.filter(x => x.name === "Economía"); return { n: e.length, ok: state.tasks.filter(t => t.title.startsWith("Eco")).every(t => t.subjectId === e[0].id && ids.has(t.subjectId)) }; });
      expect(eco).toEqual({ n: 1, ok: true });
    }
    expect(await B.page.evaluate(() => state.settings.accent)).toBe("#0e7490");
    // las dos copias traían las 10 materias de ejemplo con ids distintos: quedan 10, no 20
    expect(await A.page.evaluate(() => state.subjects.length)).toBe(10);
    expect(await B.page.evaluate(() => state.subjects.map(x => x.id).sort())).toEqual(await A.page.evaluate(() => state.subjects.map(x => x.id).sort()));
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close(); await B.ctx.close();
  });

  test("sin conexión no se pierde nada y sube al volver; se sincroniza solo después de un cambio", async ({ browser }) => {
    const server = { env: { AULA_KV: fakeKV() } };
    const A = await device(browser, server), B = await device(browser, server);
    await A.page.evaluate(k => syncConnect(k), KEY); await expect.poll(() => status(A.page)).toBe("ok");
    await B.page.evaluate(k => syncConnect(k), KEY); await expect.poll(() => status(B.page)).toBe("ok");
    B.net.down = true;
    await B.page.evaluate(() => { quickAddTask({ title: "Hecha en el colectivo", date: todayISO() }); change(); });
    await sync(B.page);
    expect(await status(B.page)).toBe("offline");
    await expect(B.page.locator("#saveTxt")).toHaveText("sin conexión · se sube después");
    expect(await titles(B.page)).toContain("Hecha en el colectivo");
    B.net.down = false;
    await B.page.evaluate(() => { quickAddTask({ title: "Otra", date: todayISO() }); change(); }); // dispara la sync sola (a los ~4 s)
    await expect.poll(() => status(B.page), { timeout: 10000 }).toBe("ok");
    await sync(A.page);
    expect(await titles(A.page)).toEqual(["Hecha en el colectivo", "Otra"].sort());
    // sin conexión, el navegador anota el pedido fallido: es esperado
    expect([...A.errors, ...B.errors].filter(e => !e.includes("ERR_INTERNET_DISCONNECTED"))).toEqual([]);
    await A.ctx.close(); await B.ctx.close();
  });

  test("si otro dispositivo escribe en el medio (409), se vuelve a fusionar sin perder nada", async ({ browser }) => {
    const server = { env: { AULA_KV: fakeKV() } };
    const A = await device(browser, server), B = await device(browser, server);
    await A.page.evaluate(k => syncConnect(k), KEY); await expect.poll(() => status(A.page)).toBe("ok");
    await B.page.evaluate(k => syncConnect(k), KEY); await expect.poll(() => status(B.page)).toBe("ok");
    await A.page.evaluate(() => { quickAddTask({ title: "De A", date: todayISO() }); });
    await B.page.evaluate(() => { quickAddTask({ title: "De B", date: todayISO() }); });
    // justo antes de que B suba, A sube lo suyo
    B.net.beforePut = () => sync(A.page);
    await sync(B.page);
    expect(await status(B.page)).toBe("ok");
    await sync(A.page);
    expect(await titles(A.page)).toEqual(["De A", "De B"]);
    expect(await titles(B.page)).toEqual(["De A", "De B"]);
    expect([...A.errors, ...B.errors].filter(e => !e.includes("409"))).toEqual([]);
    await A.ctx.close(); await B.ctx.close();
  });

  test("sin KV vinculado avisa y la app sigue andando igual; código inválido no se acepta", async ({ browser }) => {
    const server = { env: {} };
    const A = await device(browser, server);
    expect(await A.page.evaluate(() => syncConnect("corto"))).toBe(false);
    await A.page.evaluate(k => syncConnect(k), KEY);
    await expect.poll(() => status(A.page)).toBe("nokv");
    await expect(A.page.locator("#saveTxt")).toHaveText("falta activar la sincronización");
    await A.page.evaluate(() => { quickAddTask({ title: "Igual se guarda", date: todayISO() }); change(); });
    await A.page.evaluate(() => persist());
    expect(await titles(A.page)).toEqual(["Igual se guarda"]);
    await A.page.evaluate(() => syncDisconnect());
    await expect(A.page.locator("#saveTxt")).toHaveText("todo guardado");
    expect(A.errors.filter(e => !e.includes("503"))).toEqual([]);
    await A.ctx.close();
  });
  test("G1 · años: el año nuevo llega al otro dispositivo, cada uno ve el suyo y nada se mezcla ni se borra", async ({ browser }) => {
    const server = { env: { AULA_KV: fakeKV() } };
    const A = await device(browser, server), B = await device(browser, server);
    await A.page.evaluate(() => { quickAddTask({ title: "Del 3.º", date: todayISO() }); change(); });
    await A.page.evaluate(k => syncConnect(k), KEY); await expect.poll(() => status(A.page)).toBe("ok");
    await B.page.evaluate(k => syncConnect(k), KEY); await expect.poll(() => status(B.page)).toBe("ok");
    // A crea el 4.º año y agrega una tarea ahí
    await A.page.evaluate(() => { createYear({ name: "4.º año · 2027", start: "2027-03-01", end: "2028-02-29", subjects: [] }); quickAddTask({ title: "Del 4.º", date: todayISO() }); change(); });
    await sync(A.page); await sync(B.page);
    // B no había elegido año: pasa a ver el más nuevo, con lo suyo
    expect(await B.page.evaluate(() => [state.years.length, activeYear().name])).toEqual([2, "4.º año · 2027"]);
    expect(await titles(B.page)).toEqual(["Del 4.º"]);
    // B mira el 3.º y edita algo ahí; A sigue en el 4.º
    await B.page.evaluate(() => { setActiveYear("y0"); state.tasks.find(t => t.title === "Del 3.º").estMin = 50; change(); });
    await sync(B.page); await sync(A.page); await sync(B.page);
    expect(await titles(A.page)).toEqual(["Del 4.º"]);
    expect(await titles(B.page)).toEqual(["Del 3.º"]);
    expect(await A.page.evaluate(() => fullState().tasks.find(t => t.title === "Del 3.º").estMin)).toBe(50);
    expect(await A.page.evaluate(() => Object.keys(state.sync.tombs).filter(k => !k.startsWith("subjects:")).length)).toBe(0); // las 10 materias de ejemplo duplicadas sí dejan lápida (S1b)
    expect(await B.page.evaluate(() => Object.keys(state.sync.tombs).filter(k => !k.startsWith("subjects:")).length)).toBe(0); // las 10 materias de ejemplo duplicadas sí dejan lápida (S1b)
    // otra vuelta no sube nada (los dos tienen lo mismo aunque vean años distintos)
    const puts = A.net.puts + B.net.puts;
    await sync(A.page); await sync(B.page);
    expect(A.net.puts + B.net.puts).toBe(puts);
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close(); await B.ctx.close();
  });
});
