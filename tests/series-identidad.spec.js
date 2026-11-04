// A3 · Las series son explícitas (seriesId). Dos tareas sueltas con el mismo título NO son serie.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, createQuickTask, fixture, seedState, expectNothingLost } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

const seriesTitles = page => page.evaluate(() => buildSeries().filter(s => s.kind === "group").map(s => s.title + ":" + s.tasks.length));

test("dos tareas simples con el mismo título y materia no son una serie", async ({ page }) => {
  const errors = await openApp(page);
  await createQuickTask(page, "Repasar", { date: "2026-11-05" });
  await createQuickTask(page, "Repasar", { date: "2026-11-06" });
  expect(await seriesTitles(page)).toEqual([]);
  expect(await page.evaluate(() => state.tasks.filter(t => t.title === "Repasar" && t.seriesId).length)).toBe(0);
  await page.evaluate(() => go("series"));
  await expect(page.locator("#view")).not.toContainText("Repasar");
  expect(errors).toEqual([]);
});

test("un período de 5 días es una serie, con un seriesId compartido", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => openQuickTask("2026-11-05"));
  await page.fill("#qt_title", "Estudiar PE");
  // (C1) "Todos los días (período)" ahora es Repetir → Todos los días → hasta una fecha
  await page.selectOption("#qt_rep", "daily");
  await page.selectOption("#qt_repend", "until");
  await page.fill("#qt_repuntil", "2026-11-09");
  await page.press("#qt_title", "Enter");
  const ids = await page.evaluate(() => [...new Set(state.tasks.filter(t => t.title === "Estudiar PE").map(t => t.seriesId))]);
  expect(ids).toHaveLength(1);
  expect(ids[0]).toBeTruthy();
  expect(await seriesTitles(page)).toEqual(["Estudiar PE:5"]);
  // Una tarea suelta con el mismo título, creada aparte, no se mete en la serie
  await createQuickTask(page, "Estudiar PE", { date: "2026-11-10" });
  expect(await seriesTitles(page)).toEqual(["Estudiar PE:5"]);
  expect(errors).toEqual([]);
});

test("extender una serie suma días a la misma serie; duplicar una ocurrencia no", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const sid = "sr-x";
    for (const d of ["2026-11-05", "2026-11-06"]) quickAddTask({ title: "Leer", date: d, seriesId: sid });
  });
  const key = await page.evaluate(() => buildSeries()[0].key);
  await page.evaluate(k => openSeriesModal(k), key);
  await page.locator(".srmore summary").click(); // (C2a) extender quedó en "Más opciones"
  await page.fill("#sr_until", "2026-11-08");
  await page.getByRole("button", { name: "Agregar días" }).click();
  expect(await seriesTitles(page)).toEqual(["Leer:4"]);
  await page.evaluate(() => duplicateTask(state.tasks.find(t => t.title === "Leer").id));
  expect(await page.evaluate(() => state.tasks.find(t => t.title === "Leer (copia)").seriesId)).toBeFalsy();
  expect(await seriesTitles(page)).toEqual(["Leer:4"]);
  expect(errors).toEqual([]);
});

test("migración: el período real del fixture queda como serie y las 'Repasar' sueltas no", async ({ page }) => {
  const old = fixture("estado-v2.6.json");
  await seedState(page, old);
  const errors = await openApp(page);
  expect(await seriesTitles(page)).toEqual(["Repasar unidad 3:5"]);
  const r = await page.evaluate(() => ({
    period: [...new Set(state.tasks.filter(t => t.title === "Repasar unidad 3").map(t => t.seriesId))],
    loose: state.tasks.filter(t => t.title === "Repasar").map(t => t.seriesId || null)
  }));
  expect(r.period).toHaveLength(1);
  expect(r.period[0]).toBeTruthy();
  expect(r.loose).toEqual([null, null]);
  expectNothingLost(old, await page.evaluate(() => state), ["meta.lastSave", "meta.lastBackup"]);
  expect(errors).toEqual([]);
});

test("heurística de migración: casos borde", async ({ page }) => {
  const errors = await openApp(page);
  const r = await page.evaluate(() => {
    const T = (title, date, createdAt, estMin = 60, extra = {}) => Object.assign({ id: uid(), title, date, createdAt, estMin, subjectId: "s1", projectId: null, status: "pend", recur: null }, extra);
    const s = normalizeState(baseState());
    s.tasks = [
      // período con un día borrado en el medio y minutos editados al final (sigue siendo serie)
      T("A", "2026-11-01", "2026-10-30"), T("A", "2026-11-02", "2026-10-30"), T("A", "2026-11-04", "2026-10-30", 120), T("A", "2026-11-05", "2026-10-30", 120),
      // extendida días después con "Agregar días" (sigue siendo la misma serie)
      T("A", "2026-11-06", "2026-11-03"), T("A", "2026-11-07", "2026-11-03"),
      // dos creadas el mismo día para días no seguidos: tareas sueltas
      T("B", "2026-11-03", "2026-11-03"), T("B", "2026-11-07", "2026-11-03"),
      // dos el mismo día y la misma fecha: sueltas
      T("C", "2026-11-03", "2026-11-03"), T("C", "2026-11-03", "2026-11-03"),
      // dos seguidas creadas juntas pero con distinto tiempo: sueltas (no hay forma de saber)
      T("D", "2026-11-03", "2026-11-01", 30), T("D", "2026-11-04", "2026-11-01", 90),
      // dos seguidas creadas juntas con el mismo tiempo: período de 2 días
      T("E", "2026-11-03", "2026-11-01"), T("E", "2026-11-04", "2026-11-01"),
      // misma materia y título pero creadas en días distintos: sueltas
      T("F", "2026-11-03", "2026-11-01"), T("F", "2026-11-04", "2026-11-02"),
      // ya tenía seriesId: se respeta
      T("G", "2026-11-03", "2026-11-01", 60, { seriesId: "keep" })
    ];
    migrateState(s);
    const by = {};
    for (const t of s.tasks) (by[t.title] = by[t.title] || []).push(t.seriesId || null);
    const groups = {};
    for (const [k, v] of Object.entries(by)) groups[k] = new Set(v).size === 1 && v[0] ? "serie" : v.every(x => !x) ? "sueltas" : "mezcla:" + JSON.stringify(v);
    groups.G = by.G[0];
    return groups;
  });
  expect(r).toEqual({ A: "serie", B: "sueltas", C: "sueltas", D: "sueltas", E: "serie", F: "sueltas", G: "keep" });
  expect(errors).toEqual([]);
});
