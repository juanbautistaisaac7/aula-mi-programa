// A2 · "Mi día termina a las…": lo que marcás pasada la medianoche cuenta para el día anterior.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, reload, fixture, seedState } = require("./helpers");

/** Marca hecha la tarea tocando su casilla en la vista Hoy y cierra el diálogo de tiempo. */
async function completeInToday(page, title) {
  await page.evaluate(() => go("today"));
  const row = page.locator("#view .task", { hasText: title }).first();
  await row.locator(".cb").click();
  await page.locator("#confirmbox").getByRole("button", { name: "Guardar" }).click();
}

test("tarea del martes marcada el miércoles 00:10 cuenta el martes", async ({ page }) => {
  await setClock(page, "2026-11-04T00:10:00-03:00");
  const errors = await openApp(page);
  await page.evaluate(() => quickAddTask({ title: "Guía de martes", date: "2026-11-03", estMin: 30 }));
  // Para la app sigue siendo martes: la tarea está en "Programadas para hoy", no atrasada
  await page.evaluate(() => go("today"));
  await expect(page.locator("#view")).toContainText("martes 3 de noviembre");
  await completeInToday(page, "Guía de martes");
  const r = await page.evaluate(() => { const t = state.tasks.find(x => x.title === "Guía de martes"); return { doneAt: t.doneAt, log: state.dayLog["2026-11-03"], logW: state.dayLog["2026-11-04"], ses: state.sessions.filter(s => s.taskId === t.id).map(s => s.date) }; });
  expect(r.doneAt).toBe("2026-11-03");
  expect(r.log.tasksDone).toBe(1);
  expect(r.logW).toBeUndefined();
  expect(r.ses).toEqual(["2026-11-03"]);
  expect(errors).toEqual([]);
});

test("tarea del martes marcada el miércoles 15:00 cuenta el miércoles", async ({ page }) => {
  await setClock(page, "2026-11-04T15:00:00-03:00");
  const errors = await openApp(page);
  await page.evaluate(() => quickAddTask({ title: "Guía de martes", date: "2026-11-03", estMin: 30 }));
  await completeInToday(page, "Guía de martes"); // aparece en "Atrasadas"
  const r = await page.evaluate(() => { const t = state.tasks.find(x => x.title === "Guía de martes"); return { doneAt: t.doneAt, log: state.dayLog["2026-11-04"] }; });
  expect(r.doneAt).toBe("2026-11-04");
  expect(r.log.tasksDone).toBe(1);
  expect(errors).toEqual([]);
});

test("recurrentes: marcar a las 00:10 completa la ocurrencia del día anterior", async ({ page }) => {
  await setClock(page, "2026-11-04T00:10:00-03:00");
  const errors = await openApp(page);
  await page.evaluate(() => quickAddTask({ title: "Leer todos los días", recur: { kind: "daily", start: "2026-11-01" }, estMin: 20 }));
  await completeInToday(page, "Leer todos los días");
  const done = await page.evaluate(() => state.tasks.find(x => x.title === "Leer todos los días").recurDone);
  expect(done).toEqual({ "2026-11-03": 1 });
  expect(errors).toEqual([]);
});

test("con el ajuste en medianoche, a las 00:10 ya es el día nuevo", async ({ page }) => {
  await setClock(page, "2026-11-04T00:10:00-03:00");
  const errors = await openApp(page);
  await page.evaluate(() => { state.settings.dayEnd = "00:00"; });
  expect(await page.evaluate(() => todayISO())).toBe("2026-11-04");
  await page.evaluate(() => { state.settings.dayEnd = "01:00"; });
  expect(await page.evaluate(() => todayISO())).toBe("2026-11-03");
  await page.evaluate(() => { state.settings.dayEnd = "04:00"; });
  await page.clock.setSystemTime(new Date("2026-11-04T04:00:00-03:00"));
  expect(await page.evaluate(() => todayISO())).toBe("2026-11-04");
  expect(errors).toEqual([]);
});

test("el ajuste se cambia en Configuración y persiste; datos viejos arrancan en 04:00", async ({ page }) => {
  await setClock(page, "2026-11-04T11:00:00-03:00");
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  expect(await page.evaluate(() => state.settings.dayEnd)).toBe("04:00");
  await page.evaluate(() => go("config"));
  await page.selectOption("#cfg_dayend", "02:00");
  await reload(page);
  expect(await page.evaluate(() => state.settings.dayEnd)).toBe("02:00");
  expect(errors).toEqual([]);
});

test("en el detalle se ve y se edita 'completada el' (y se mueve lo que contaba ese día)", async ({ page }) => {
  await setClock(page, "2026-11-04T11:00:00-03:00");
  const errors = await openApp(page);
  await page.evaluate(() => quickAddTask({ title: "Resumen", date: "2026-11-04", estMin: 40 }));
  await completeInToday(page, "Resumen");
  const id = await page.evaluate(() => state.tasks.find(x => x.title === "Resumen").id);
  await page.evaluate(id => openTaskEditor(id), id);
  await expect(page.locator("#te_doneat")).toBeVisible();
  await expect(page.locator("#te_doneat")).toHaveValue("2026-11-04");
  await page.fill("#te_doneat", "2026-11-02");
  await page.locator("#modalbox").getByRole("button", { name: "Guardar" }).click();
  const r = await page.evaluate(id => { const t = taskById(id); return { doneAt: t.doneAt, d2: state.dayLog["2026-11-02"].tasksDone, d4: state.dayLog["2026-11-04"].tasksDone, ses: state.sessions.filter(s => s.taskId === id).map(s => s.date) }; }, id);
  expect(r).toEqual({ doneAt: "2026-11-02", d2: 1, d4: 0, ses: ["2026-11-02"] });
  // Una tarea pendiente no muestra el campo
  await page.evaluate(() => { const t = quickAddTask({ title: "Pendiente" }); openTaskEditor(t.id); });
  await expect(page.locator("#te_doneat")).toBeHidden();
  expect(errors).toEqual([]);
});
