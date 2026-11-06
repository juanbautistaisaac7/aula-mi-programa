// L1b · Recorrido pensado de Hoy, Semana, Calendario, Materias, Parciales y Series.
// Cada test corresponde a un hallazgo de docs/AUDITORIA.md (#14 en adelante).
const { test, expect } = require("@playwright/test");
const { abrirEstudio, openApp, setClock, fixture, seedState } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T23:40:00-03:00"); });

async function abrirFixture(page, mod) {
  const s = fixture("estado-v2.6.json");
  if (mod) mod(s);
  await seedState(page, s);
  return openApp(page);
}

test("#14 · una serie sin fin que sí tiene fecha final dice hasta cuándo, no 'sin fin'", async ({ page }) => {
  const errors = await abrirFixture(page);
  await page.evaluate(() => go("series"));
  // "Clase de consulta" (lun y mié) termina el 15/12 en el fixture
  const fila = page.locator(".serrow", { hasText: "Clase de consulta" });
  await expect(fila).toContainText("los lun y mié, hasta el mar 15 dic");
  await expect(fila).not.toContainText("sin fin");
  await expect(page.locator(".serrow", { hasText: "Leer apunte del día" })).toContainText("todos los días, sin fin");
  // y en el editor de la serie
  await fila.click();
  await expect(page.locator("#modalbox")).toContainText("hasta el mar 15 dic");
  await expect(page.locator("#modalbox")).not.toContainText("sin fin");
  expect(errors).toEqual([]);
});

test("#15 · 'cada semana' y 'cada mes' dicen qué día", async ({ page }) => {
  const errors = await abrirFixture(page);
  await page.evaluate(() => go("series"));
  await expect(page.locator(".serrow", { hasText: "Repaso semanal" })).toContainText("todos los sábados");
  await expect(page.locator(".serrow", { hasText: "Pagar cuota" })).toContainText("el 10 de cada mes");
  const r = await page.evaluate(() => [
    recurLabel({ kind: "weekly", days: [], start: "2026-11-02" }),       // lunes
    recurLabel({ kind: "weekly", days: [0] }),
    recurLabel({ kind: "monthly", start: "2026-01-31" }),
    recurLabel({ kind: "daily" })
  ]);
  expect(r).toEqual(["todos los lunes", "todos los domingos", "el 31 de cada mes (o el último día)", "todos los días"]);
  expect(errors).toEqual([]);
});

test("#16 · 'cada mes' el día 31 no se saltea los meses cortos: cae el último día", async ({ page }) => {
  const errors = await abrirFixture(page);
  const r = await page.evaluate(() => {
    const t = { recur: { kind: "monthly", start: "2026-01-31" } };
    const meses = [];
    for (let d = "2026-01-01"; d <= "2026-12-31"; d = addDays(d, 1)) if (occursOn(t, d)) meses.push(d);
    const t30 = { recur: { kind: "monthly", start: "2026-01-30" } };
    const feb30 = ["2026-02-27", "2026-02-28", "2026-03-30", "2026-03-31"].filter(d => occursOn(t30, d));
    const h = { freq: { kind: "monthly", n: 30 }, archived: false };
    const habFeb = ["2026-02-27", "2026-02-28", "2026-03-30", "2026-03-31"].filter(d => habitDueOn(h, d));
    // una serie con fecha (C1) usa la misma regla
    const serie = repeatDates("2026-10-31", { kind: "monthly" }, { type: "count", n: 4 });
    return { meses, feb30, habFeb, serie };
  });
  expect(r.meses).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-31", "2026-11-30", "2026-12-31"]);
  expect(r.feb30).toEqual(["2026-02-28", "2026-03-30"]);
  expect(r.habFeb).toEqual(["2026-02-28", "2026-03-30"]);
  expect(r.serie).toEqual(["2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31"]);
  expect(errors).toEqual([]);
});

test("#17 · borrar una materia avisa bien qué pasa con sus tareas y parciales", async ({ page }) => {
  const errors = await abrirFixture(page, s => {
    // una materia con 1 tarea y 1 parcial
    s.subjects.push({ id: "s-x", name: "Física", short: "FI", color: "#0e7490", icon: "Fi", archived: true, order: 9 });
    s.tasks.push(Object.assign({}, s.tasks[0], { id: "t-x", title: "Guía de física", subjectId: "s-x" }));
    s.evals.push(Object.assign({}, s.evals[0], { id: "e-x", name: "Parcial Física", subjectId: "s-x" }));
  });
  const msg = await page.evaluate(() => { let m = ""; const orig = window.doubleDelete; window.doubleDelete = (what) => { m = what; }; deleteSubject("s-x"); window.doubleDelete = orig; return m; });
  expect(msg).toContain("1 tarea");
  expect(msg).not.toMatch(/1 tareas/);
  expect(msg).toContain("1 evaluación");
  expect(errors).toEqual([]);
});

test("#18 · Materias no dice '0 pendientes · 0 m estudiadas'", async ({ page }) => {
  const errors = await abrirFixture(page);
  await page.evaluate(() => go("subjects"));
  const eco = page.locator("#view", { hasText: "Economía" });
  await expect(eco).toContainText("EC · al día · sin tiempo registrado");
  await expect(page.locator("#view")).not.toContainText("0 pendientes");
  await expect(page.locator("#view")).not.toContainText(/(^|[^\d])0 m estudiadas/);
  expect(errors).toEqual([]);
});

test("#7 · Estudio de hoy: el bloque siguiente arranca donde terminó el anterior", async ({ page }) => {
  await setClock(page, "2026-11-04T11:00:00-03:00");
  const errors = await abrirFixture(page, s => { s.dayPlan = {}; });
  await page.evaluate(() => go("home"));
  await abrirEstudio(page); // Q1: en el celu viene plegado (y tiene que seguir abierto al agregar bloques)
  await expect(page.locator("#sb_from")).toHaveValue("14:00");
  await expect(page.locator("#sb_to")).toHaveValue("17:00");
  await page.click("text=Agregar bloque");
  // el siguiente propone 17:00 → 19:00 (no otra vez 14–17, que se pisaría)
  await expect(page.locator("#sb_from")).toHaveValue("17:00");
  await expect(page.locator("#sb_to")).toHaveValue("19:00");
  // superponer un bloque avisa y no lo agrega
  await page.fill("#sb_from", "16:00"); await page.fill("#sb_to", "18:00");
  await page.click("text=Agregar bloque");
  await expect(page.locator("#toast, .toast").first()).toContainText("se superpone");
  expect(await page.evaluate(() => state.dayPlan[todayISO()].blocks.length)).toBe(1);
  // un bloque que termina tarde no propone pasar la medianoche
  await page.fill("#sb_from", "21:00"); await page.fill("#sb_to", "23:00");
  await page.click("text=Agregar bloque");
  await expect(page.locator("#sb_from")).toHaveValue("23:00");
  await expect(page.locator("#sb_to")).toHaveValue("23:59");
  expect(errors).toEqual([]);
});

test("#16 · una serie 'cada mes' el 31 se reconoce y se puede seguir sumando", async ({ page }) => {
  const errors = await abrirFixture(page);
  const r = await page.evaluate(() => {
    const nueva = seriesPattern(["2026-10-31", "2026-11-30", "2026-12-31"]);
    const vieja = seriesPattern(["2026-10-31", "2026-12-31", "2027-01-31"]); // creada antes, salteando noviembre
    return { nueva: nueva.kind, sig: patternNext(nueva, "2026-12-31"), feb: patternNext(nueva, "2027-01-31"), mar: patternNext(nueva, "2027-02-28"), vieja: vieja.kind,
      diez: patternNext(seriesPattern(["2026-10-10", "2026-11-10"]), "2026-11-10") };
  });
  expect(r).toEqual({ nueva: "month", sig: "2027-01-31", feb: "2027-02-28", mar: "2027-03-31", vieja: "month", diez: "2026-12-10" });
  expect(errors).toEqual([]);
});
