// S1a · Motor de sincronización: marcas de cambio, lápidas y fusión por elemento.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, seedState, fixture, readBackups, storedState } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

test("migración: un estado viejo (esquema 3) gana el lugar de sync sin perder nada, con copia previa", async ({ page }) => {
  const old = fixture("estado-v2.6.json");
  old.meta.schema = 3; // como lo tiene hoy el celu de Bauti (Aula 2.30)
  await seedState(page, old);
  const errors = await openApp(page);
  const r = await page.evaluate(() => ({ schema: state.meta.schema, sync: state.sync, n: [state.tasks.length, state.evals.length, state.subjects.length, state.sessions.length, state.notes.length, state.habits.length] }));
  expect(r.schema).toBe(await page.evaluate(() => SCHEMA_VERSION)); // 4 cuando se escribió; G1 agregó el 5
  expect(r.sync).toEqual({ stamps: {}, tombs: {} });
  expect(r.n).toEqual([old.tasks.length, old.evals.length, old.subjects.length, old.sessions.length, old.notes.length, old.habits.length]);
  // cada tarea quedó idéntica (la migración no toca datos)
  const tasks = await page.evaluate(() => state.tasks);
  expect(tasks).toEqual(old.tasks);
  const pre = (await readBackups(page)).filter(b => String(b.key).startsWith("premig-v3"));
  expect(pre).toHaveLength(1);
  expect(JSON.parse(pre[0].data).tasks).toEqual(old.tasks);
  // idempotente
  const again = await page.evaluate(() => { const a = JSON.stringify(state); migrateState(state); state.meta.schema = 3; migrateState(state); return a === JSON.stringify(state); });
  expect(again).toBe(true);
  expect(errors).toEqual([]);
});

test("al guardar se marca lo que cambió y lo borrado deja lápida", async ({ page }) => {
  const errors = await openApp(page);
  const id = await page.evaluate(async () => {
    const t = quickAddTask({ title: "Leer apunte", date: todayISO(), estMin: 30 });
    await persist();
    return t.id;
  });
  let sy = await page.evaluate(() => state.sync);
  expect(sy.stamps["tasks:" + id]).toBeGreaterThan(0);
  // cambiar un ajuste marca solo ese ajuste
  await page.evaluate(async () => { state.settings.theme = "dark"; await persist(); });
  sy = await page.evaluate(() => state.sync);
  expect(Object.keys(sy.stamps).filter(k => k.startsWith("settings."))).toEqual(["settings.theme"]);
  // borrar deja lápida y saca la marca
  await page.evaluate(async id => { state.tasks = state.tasks.filter(t => t.id !== id); await persist(); }, id);
  sy = await page.evaluate(() => state.sync);
  expect(sy.tombs["tasks:" + id]).toBeGreaterThan(0);
  expect(sy.stamps["tasks:" + id]).toBeUndefined();
  // deshacer (vuelve a aparecer) quita la lápida
  await page.evaluate(async id => { state.tasks.push({ id, title: "Leer apunte", date: todayISO(), estMin: 30, status: "pend" }); await persist(); }, id);
  sy = await page.evaluate(() => state.sync);
  expect(sy.tombs["tasks:" + id]).toBeUndefined();
  // lo guardado en IndexedDB tiene las marcas; meta y timer no se marcan nunca
  const st = await storedState(page);
  expect(Object.keys(st.sync.stamps).some(k => k.startsWith("meta") || k.startsWith("timer"))).toBe(false);
  expect(errors).toEqual([]);
});

test("fusión: unión, gana lo más nuevo, el borrado no revive y los dos lados terminan iguales", async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const T = (id, title, extra) => Object.assign({ id, title }, extra || {});
    const compu = {
      data: { tasks: [T("a", "A compu"), T("b", "B"), T("c", "C"), T("viejo", "sin marca, compu")], settings: { theme: "dark", accent: "#111" }, dayLog: { "2026-11-01": 2 }, meta: { lastSave: 1 }, timer: { run: true } },
      stamps: { "tasks:a": 200, "tasks:b": 100, "settings.theme": 300 },
      tombs: { "tasks:d": 150 }
    };
    const celu = {
      data: { tasks: [T("a", "A celu"), T("c", "C editada"), T("d", "D editada antes del borrado"), T("e", "E nueva en el celu"), T("viejo", "sin marca, celu")], settings: { theme: "light", accent: "#222" }, dayLog: {}, meta: { lastSave: 9 } },
      stamps: { "tasks:a": 100, "tasks:c": 50, "tasks:d": 120, "tasks:e": 400, "settings.accent": 500 },
      tombs: { "tasks:b": 250, "dayLog.2026-11-01": 260 }
    };
    const m1 = syncMerge(compu, celu), m2 = syncMerge(celu, compu);
    const titles = m => m.data.tasks.map(t => t.id + "=" + t.title).sort();
    return { t1: titles(m1), t2: titles(m2), s1: m1.data.settings, s2: m2.data.settings, d1: m1.data.dayLog, meta: m1.data.meta, timer: m1.data.timer,
      tombs: m1.tombs, same: JSON.stringify([titles(m1), m1.data.settings, m1.data.dayLog, Object.entries(m1.tombs).sort()]) === JSON.stringify([titles(m2), m2.data.settings, m2.data.dayLog, Object.entries(m2.tombs).sort()]) };
  });
  // a: gana la compu (200 > 100) · b: borrado en el celu (250) después de editarse (100) → no está
  // c: la editó solo el celu (50 > 0) · d: borrado en la compu (150) después de editarse (120) → no revive
  // e: nueva en el celu · viejo: ninguno tiene marca → los dos eligen lo mismo
  expect(r.t1).toEqual(["a=A compu", "c=C editada", "e=E nueva en el celu", "viejo=sin marca, compu"]);
  expect(r.same).toBe(true);
  expect(r.s1).toEqual({ theme: "dark", accent: "#222" }); // ajustes por campo
  expect(r.d1).toEqual({}); // el día borrado en el celu no vuelve
  expect(r.meta).toEqual({ lastSave: 1 }); // lo local queda como está
  expect(r.timer).toEqual({ run: true });
  expect(r.tombs["tasks:b"]).toBe(250);
  expect(r.tombs["tasks:d"]).toBe(150);
});

test("fusión: editar después de borrar en el otro lado gana la edición; primera vez con datos en los dos lados no pierde nada", async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const a = { data: { tasks: [{ id: "x", title: "editada tarde" }] }, stamps: { "tasks:x": 900 }, tombs: {} };
    const b = { data: { tasks: [] }, stamps: {}, tombs: { "tasks:x": 500 } };
    const m = syncMerge(b, a);
    // primera vez: compu llena (sin marcas) y celu con una tarea nueva
    const compu = { data: { tasks: Array.from({ length: 50 }, (_, i) => ({ id: "t" + i, title: "T" + i })), subjects: [{ id: "s1", name: "AM" }] }, stamps: {}, tombs: {} };
    const celu = { data: { tasks: [{ id: "n1", title: "nueva del celu" }], subjects: [] }, stamps: { "tasks:n1": 10 }, tombs: {} };
    const f = syncMerge(celu, compu);
    return { revive: m.data.tasks.map(t => t.title), tomb: m.tombs["tasks:x"], n: f.data.tasks.length, subj: f.data.subjects.length };
  });
  expect(r.revive).toEqual(["editada tarde"]);
  expect(r.tomb).toBeUndefined();
  expect(r.n).toBe(51);
  expect(r.subj).toBe(1);
});
