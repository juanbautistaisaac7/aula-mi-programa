// E1a1 · Recordatorios: modelo y migración (esquema 6). La interfaz va en E1a2.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, fixture, seedState, readBackups, storedState, expectNothingLost } = require("./helpers");

const VOLATILES = ["meta.lastSave", "meta.lastBackup", "meta.schema", "settings.reminderDefaults"];

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

test("migración a recordatorios: el estado de Bauti (esquema 5) sobrevive entero, con copia previa e idempotente", async ({ page }) => {
  const old = fixture("estado-v2.6.json");
  old.meta.schema = 5; // como lo tiene hoy el celu (Aula 2.34–2.39)
  await seedState(page, old);
  const errors = await openApp(page);
  const r = await page.evaluate(() => ({ schema: state.meta.schema, def: state.settings.reminderDefaults }));
  expect(r.schema).toBeGreaterThanOrEqual(6);
  expect(r.def).toEqual({ eval: [{ amount: 7, unit: "d" }, { amount: 1, unit: "d" }], task: [] });
  // ningún elemento cambia: los recordatorios son opcionales y no se agregan a nada
  for (const c of ["tasks", "evals", "subjects", "projects", "notes", "habits", "sessions"]) {
    expect(await page.evaluate(c => state[c], c)).toEqual(old[c]);
  }
  const st = await storedState(page);
  expectNothingLost(old, st, VOLATILES);
  const pre = (await readBackups(page)).filter(b => String(b.key).startsWith("premig-v5"));
  expect(pre).toHaveLength(1);
  expect(JSON.parse(pre[0].data).evals).toEqual(old.evals);
  // idempotente, y respeta lo que Bauti ya haya configurado
  const again = await page.evaluate(() => {
    const a = JSON.stringify(fullState()); state.meta.schema = 5; migrateState(state);
    const same = a === JSON.stringify(fullState());
    const s2 = { settings: { reminderDefaults: { eval: [{ amount: 3, unit: "d" }], task: [{ amount: 30, unit: "min" }] } } };
    MIGRATIONS.find(m => m.to === 6).run(s2);
    return { same, kept: s2.settings.reminderDefaults };
  });
  expect(again.same).toBe(true);
  expect(again.kept).toEqual({ eval: [{ amount: 3, unit: "d" }], task: [{ amount: 30, unit: "min" }] });
  // la migración no marca elementos como "cambiados" para la sincronización
  expect(Object.keys(st.sync.stamps).filter(k => !k.startsWith("settings."))).toEqual([]);
  expect(errors).toEqual([]);
});

test("qué recordatorios tiene cada cosa y cuándo suenan", async ({ page }) => {
  const errors = await openApp(page);
  const r = await page.evaluate(() => {
    const ev = { id: "e", date: "2026-11-12", time: "18:00" };
    const evSinHora = { id: "e2", date: "2026-11-12" };
    const evPropio = { id: "e3", date: "2026-11-12", time: "18:00", reminders: [{ amount: 2, unit: "h" }] };
    const evNinguno = { id: "e4", date: "2026-11-12", reminders: [] };
    const tarea = { id: "t", date: "2026-11-05", time: "15:30", reminders: [{ amount: 30, unit: "min" }, { amount: 1, unit: "d" }] };
    const tareaSinHora = { id: "t2", date: "2026-11-05", reminders: [{ amount: 30, unit: "min" }] };
    const tareaSinDefinir = { id: "t3", date: "2026-11-05", time: "15:30" };
    const iso = ms => new Date(ms).toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 16);
    const at = (x, k) => reminderTimes(x, k).map(z => iso(z.at) + " " + reminderLabel(z.r));
    return {
      ev: at(ev, "eval"), evSinHora: at(evSinHora, "eval"), evPropio: at(evPropio, "eval"), evNinguno: at(evNinguno, "eval"),
      tarea: at(tarea, "task"), tareaSinHora: at(tareaSinHora, "task"), tareaSinDefinir: at(tareaSinDefinir, "task"),
      norm: normReminders([{ amount: "30", unit: "min" }, { amount: 30, unit: "min" }, { amount: 0, unit: "h" }, { amount: 2, unit: "semanas" }, { amount: 1, unit: "d" }, { amount: 90, unit: "min" }, null]),
      labels: [{ amount: 1, unit: "min" }, { amount: 1, unit: "h" }, { amount: 3, unit: "h" }, { amount: 1, unit: "d" }, { amount: 7, unit: "d" }].map(reminderLabel)
    };
  });
  expect(r.ev).toEqual(["2026-11-05 18:00 7 días antes", "2026-11-11 18:00 1 día antes"]);
  // un parcial sin hora avisa tomando las 9:00 de ese día
  expect(r.evSinHora).toEqual(["2026-11-05 09:00 7 días antes", "2026-11-11 09:00 1 día antes"]);
  expect(r.evPropio).toEqual(["2026-11-12 16:00 2 h antes"]);
  expect(r.evNinguno).toEqual([]);
  expect(r.tarea).toEqual(["2026-11-04 15:30 1 día antes", "2026-11-05 15:00 30 min antes"]);
  expect(r.tareaSinHora).toEqual([]); // una tarea sin hora no tiene "antes"
  expect(r.tareaSinDefinir).toEqual([]); // las tareas no traen recordatorios por defecto
  // limpia: números válidos, unidades conocidas, sin repetidos, ordenados del más lejano al más cercano
  expect(r.norm).toEqual([{ amount: 1, unit: "d" }, { amount: 90, unit: "min" }, { amount: 30, unit: "min" }]);
  expect(r.labels).toEqual(["1 min antes", "1 h antes", "3 h antes", "1 día antes", "7 días antes"]);
  expect(errors).toEqual([]);
});
