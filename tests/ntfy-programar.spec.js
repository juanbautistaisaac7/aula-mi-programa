// E1b2 · Programar los avisos en ntfy (con la app cerrada). Nunca se habla con ntfy.sh de
// verdad: todo pasa por page.route. Registro sincronizado de lo programado: state.ntfySched.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, fixture, seedState, readBackups, storedState, expectNothingLost } = require("./helpers");

const TOPIC = "aula-CCCCCCCCCCCCCCCCCCCCCC";
const NOW = "2026-11-04T11:00:00-03:00";

test.beforeEach(async ({ page }) => {
  await setClock(page, NOW);
  await page.route("https://ntfy.sh/**", r => r.fulfill({ status: 599, body: "no real ntfy in tests" }));
});

/* Mock de ntfy: guarda cada pedido y contesta 200 (o lo que diga `mode.status`). */
async function mockNtfy(page, mode = {}) {
  const log = [];
  await page.route("https://ntfy.sh/**", async route => {
    const rq = route.request(), u = new URL(rq.url());
    if (mode.offline) return route.abort();
    log.push({ method: rq.method(), path: u.pathname, at: u.searchParams.get("at"), title: u.searchParams.get("title"), body: rq.postData() || "" });
    await route.fulfill({ status: mode.status || 200, contentType: "application/json", body: '{"id":"x"}', headers: { "access-control-allow-origin": "*" } });
  });
  return log;
}

/* Un parcial pasado mañana (sin hora → 9:00; avisos 7 d y 1 d por defecto) y tres tareas:
   una hoy 18:00 con aviso 30 min antes, una lejos (fuera de la ventana) y una sin hora. */
async function seedPlan(page) {
  await page.evaluate(topic => {
    state.settings.ntfy = Object.assign(defaultNtfy(), { on: true, topic });
    state.evals.push({ id: "ev1", name: "Álgebra", type: "parcial", date: "2026-11-06", status: "pendiente" });
    state.tasks.push({ id: "t1", title: "Entregar TP de Física", date: "2026-11-04", time: "18:00", reminders: [{ amount: 30, unit: "min" }], status: "pend", estMin: 30 });
    state.tasks.push({ id: "t2", title: "Lejos", date: "2026-11-20", time: "10:00", reminders: [{ amount: 1, unit: "h" }], status: "pend", estMin: 30 });
    state.tasks.push({ id: "t3", title: "Sin hora", date: "2026-11-04", reminders: [{ amount: 1, unit: "h" }], status: "pend", estMin: 30 });
  }, TOPIC);
}

test("migración al esquema 8: el estado de Bauti sobrevive, con copia previa, idempotente y sin pisar lo que llegó por la sync", async ({ page }) => {
  const old = fixture("estado-v2.6.json");
  old.meta.schema = 7;
  old.settings.ntfy = { on: false, server: "https://ntfy.sh", topic: "", generic: false };
  await seedState(page, old);
  const errors = await openApp(page);
  const r = await page.evaluate(() => ({ schema: state.meta.schema, sched: state.ntfySched }));
  expect(r.schema).toBe(8);
  expect(r.sched).toEqual({});
  for (const c of ["tasks", "evals", "subjects", "projects", "notes", "habits", "sessions"]) {
    expect(await page.evaluate(c => fullState()[c], c)).toEqual(old[c]);
  }
  const st = await storedState(page);
  expectNothingLost(old, st, ["meta.lastSave", "meta.lastBackup", "meta.schema", "settings.reminderDefaults"]);
  expect((await readBackups(page)).filter(b => String(b.key).startsWith("premig-v7"))).toHaveLength(1);
  const again = await page.evaluate(() => {
    const a = JSON.stringify(fullState()); state.meta.schema = 7; migrateState(state);
    const s2 = { ntfySched: { "t:x:30": { seq: "aulaabc", at: 1, topic: "aula-AAAAAAAAAAAAAAAAAAAAAA", server: "https://ntfy.sh", extra: 1 } } };
    MIGRATIONS.find(m => m.to === 8).run(s2);
    const s3 = { ntfySched: "basura" }; MIGRATIONS.find(m => m.to === 8).run(s3);
    return { same: a === JSON.stringify(fullState()), kept: s2.ntfySched, fixed: s3.ntfySched };
  });
  expect(again.same).toBe(true);
  expect(again.kept["t:x:30"].extra).toBe(1);
  expect(again.fixed).toEqual({});
  // no aparecen marcas de sync en tareas ni parciales (no se "tocaron")
  expect(Object.keys(st.sync.stamps).filter(k => /^(tasks|evals):/.test(k))).toEqual([]);
  expect(errors).toEqual([]);
});

test("programa solo lo que entra en las próximas 48 h, con «at» y sequence id; una segunda pasada no repite nada", async ({ page }) => {
  const errors = await openApp(page);
  const log = await mockNtfy(page);
  await seedPlan(page);
  await page.evaluate(() => ntfyPlan());
  const posts = log.filter(x => x.method === "POST");
  expect(posts).toHaveLength(2);
  const byAt = Object.fromEntries(posts.map(p => [p.at, p]));
  const atTask = String(Date.parse("2026-11-04T17:30:00-03:00") / 1000);
  const atEval = String(Date.parse("2026-11-05T09:00:00-03:00") / 1000);
  expect(Object.keys(byAt).sort()).toEqual([atTask, atEval].sort());
  expect(byAt[atTask].body).toContain("Entregar TP de Física");
  expect(byAt[atTask].body).toContain("30 min");
  expect(byAt[atEval].body).toContain("Álgebra");
  for (const p of posts) expect(p.path).toMatch(new RegExp("^/" + TOPIC + "/aula[a-z0-9]+$"));
  const sched = await page.evaluate(() => state.ntfySched);
  expect(Object.keys(sched).sort()).toEqual(["e:ev1:1440", "t:t1:30"]);
  await page.evaluate(() => ntfyPlan());
  expect(log.filter(x => x.method === "POST")).toHaveLength(2);
  // lo programado viaja por la sync como claves sueltas (se fusionan por elemento)
  const st = await storedState(page);
  expect(Object.keys(st.sync.stamps).filter(k => k.startsWith("ntfySched.")).sort()).toEqual(["ntfySched.e:ev1:1440", "ntfySched.t:t1:30"]);
  expect(errors).toEqual([]);
});

test("mover la hora cancela el aviso viejo y programa el nuevo; completar o borrar lo cancela", async ({ page }) => {
  const errors = await openApp(page);
  const log = await mockNtfy(page);
  await seedPlan(page);
  await page.evaluate(() => ntfyPlan());
  const old = await page.evaluate(() => state.ntfySched["t:t1:30"].seq);
  log.length = 0;
  await page.evaluate(() => { state.tasks.find(t => t.id === "t1").time = "20:00"; return ntfyPlan(); });
  expect(log.map(x => x.method)).toEqual(["DELETE", "POST"]);
  expect(log[0].path).toBe("/" + TOPIC + "/" + old);
  expect(log[1].at).toBe(String(Date.parse("2026-11-04T19:30:00-03:00") / 1000));
  const now = await page.evaluate(() => state.ntfySched["t:t1:30"]);
  expect(now.seq).not.toBe(old);
  log.length = 0;
  await page.evaluate(() => { state.tasks.find(t => t.id === "t1").status = "done"; state.evals = state.evals.filter(e => e.id !== "ev1"); return ntfyPlan(); });
  expect(log.map(x => x.method)).toEqual(["DELETE", "DELETE"]);
  expect(await page.evaluate(() => state.ntfySched)).toEqual({});
  // las lápidas de avisos de hace más de una semana se limpian; las recientes no
  const tb = await page.evaluate(() => { state.sync.tombs["ntfySched.viejo"] = Date.now() - 8 * 864e5; return ntfyPlan().then(() => Object.keys(state.sync.tombs).filter(k => k.startsWith("ntfySched."))); });
  expect(tb).not.toContain("ntfySched.viejo");
  // un 404 al cancelar (ya llegó o el servidor no lo tiene) también cuenta como cancelado
  await page.evaluate(() => { state.tasks.find(t => t.id === "t1").status = "pend"; return ntfyPlan(); });
  await page.unrouteAll({ behavior: "ignoreErrors" });
  const log2 = await mockNtfy(page, { status: 404 });
  await page.evaluate(() => { state.tasks.find(t => t.id === "t1").status = "done"; return ntfyPlan(); });
  expect(log2.map(x => x.method)).toEqual(["DELETE"]);
  expect(await page.evaluate(() => state.ntfySched)).toEqual({});
  // el 404 lo anota el navegador como "Failed to load resource" (no es un error de la app)
  expect(errors.filter(e => !/Failed to load resource/.test(e))).toEqual([]);
});

test("mensaje genérico: no sale el nombre de la tarea; cambiarlo reprograma", async ({ page }) => {
  const errors = await openApp(page);
  const log = await mockNtfy(page);
  await seedPlan(page);
  await page.evaluate(() => { state.settings.ntfy.generic = true; return ntfyPlan(); });
  const posts = log.filter(x => x.method === "POST");
  expect(posts).toHaveLength(2);
  for (const p of posts) {
    expect(p.body + p.title).not.toContain("Física");
    expect(p.body + p.title).not.toContain("Álgebra");
    expect(p.body).toBe("Tenés un aviso de Aula");
  }
  log.length = 0;
  await page.evaluate(() => { state.settings.ntfy.generic = false; return ntfyPlan(); });
  expect(log.filter(x => x.method === "DELETE")).toHaveLength(2);
  expect(log.filter(x => x.method === "POST")).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("dos dispositivos: lo que programó uno llega por la sync y el otro no lo repite", async ({ page }) => {
  const errors = await openApp(page);
  const log = await mockNtfy(page);
  await seedPlan(page);
  await page.evaluate(() => ntfyPlan());
  // lo que "el otro dispositivo" tendría después de fusionar: las mismas tareas y el registro
  const fromA = await page.evaluate(() => JSON.parse(JSON.stringify({ sched: state.ntfySched })));
  log.length = 0;
  const r = await page.evaluate(a => {
    // B: mismo contenido pero sin registro; la fusión le trae el de A
    const L = { data: Object.assign({}, fullState(), { ntfySched: {} }), stamps: {}, tombs: {} };
    const R = { data: { ntfySched: a.sched }, stamps: Object.fromEntries(Object.keys(a.sched).map(k => ["ntfySched." + k, 5])), tombs: {} };
    const m = syncMerge(L, R);
    state.ntfySched = m.data.ntfySched;
    return Object.keys(state.ntfySched).sort();
  }, fromA);
  expect(r).toEqual(["e:ev1:1440", "t:t1:30"]);
  await page.evaluate(() => ntfyPlan());
  expect(log).toEqual([]);
  // y el sequence id es el mismo en los dos: si llegaran a programar a la vez, ntfy lo trata como el mismo aviso
  expect(await page.evaluate(() => { const w = ntfyWanted(Date.now()); return w.get("t:t1:30").seq === state.ntfySched["t:t1:30"].seq; })).toBe(true);
  expect(errors).toEqual([]);
});

test("sin conexión no registra nada y reintenta después; desconectar cancela lo pendiente", async ({ page }) => {
  const errors = await openApp(page);
  await mockNtfy(page, { offline: true });
  await seedPlan(page);
  await page.evaluate(() => ntfyPlan());
  expect(await page.evaluate(() => state.ntfySched)).toEqual({});
  await page.unrouteAll({ behavior: "ignoreErrors" });
  const log = await mockNtfy(page);
  await page.evaluate(() => ntfyPlan());
  expect(log.filter(x => x.method === "POST")).toHaveLength(2);
  log.length = 0;
  await page.evaluate(() => go("config"));
  await page.locator(".ntfycard").getByRole("button", { name: "Desconectar" }).click();
  await page.locator("#confirmOkBtn").click();
  await expect.poll(() => log.filter(x => x.method === "DELETE").length).toBe(2);
  for (const d of log) expect(d.path.startsWith("/" + TOPIC + "/")).toBe(true);
  await expect.poll(() => page.evaluate(() => Object.keys(state.ntfySched).length)).toBe(0);
  expect(errors.filter(e => !/Failed to load resource|ERR_FAILED/.test(e))).toEqual([]);
});

test("la tarjeta de Configuración dice cuántos avisos hay programados y el próximo", async ({ page }) => {
  const errors = await openApp(page);
  await mockNtfy(page);
  await seedPlan(page);
  await page.evaluate(() => ntfyPlan());
  await page.evaluate(() => go("config"));
  const card = page.locator(".ntfycard");
  await expect(card).toContainText("2 avisos programados");
  await expect(card).toContainText("17:30");
  await expect(card).not.toContainText("Por ahora llega la prueba");
  expect(errors).toEqual([]);
});
