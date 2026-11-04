// C1 · Crear repeticiones sin pensar: control "Repetir" con vista previa de las fechas exactas.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, reload } = require("./helpers");

// Miércoles 4 de noviembre de 2026.
test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T10:00:00-03:00"); });

async function open(page, title = "Practicar") {
  await page.evaluate(() => openQuickTask("2026-11-10")); // martes 10
  await page.fill("#qt_title", title);
}
const created = (page, title = "Practicar") => page.evaluate(t => state.tasks.filter(x => x.title === t).map(x => ({ date: x.date, sid: x.seriesId || null, recur: x.recur, min: x.estMin })).sort((a, b) => String(a.date).localeCompare(String(b.date))), title);
const save = page => page.locator("#modalbox").getByRole("button", { name: /Crear/ }).click();

test("por defecto no se repite: crea una sola tarea, sin serie", async ({ page }) => {
  const errors = await openApp(page);
  await open(page);
  await expect(page.locator("#qt_rep")).toHaveValue("none");
  await expect(page.locator("#qt_preview")).toBeHidden();
  await save(page);
  const ts = await created(page);
  expect(ts).toEqual([{ date: "2026-11-10", sid: null, recur: null, min: 60 }]);
  expect(errors).toEqual([]);
});

test("cada 3 días, 5 veces: la vista previa dice las fechas exactas y se crean esas 5 en una serie", async ({ page }) => {
  const errors = await openApp(page);
  await open(page);
  await page.selectOption("#qt_rep", "interval");
  await page.fill("#qt_repn", "3");
  await page.selectOption("#qt_repend", "count");
  await page.fill("#qt_repcount", "5");
  await expect(page.locator("#qt_preview")).toContainText("Se van a crear 5 tareas");
  await expect(page.locator("#qt_preview")).toContainText("mar 10 nov");
  await expect(page.locator("#qt_preview")).toContainText("vie 13 nov");
  await expect(page.locator("#qt_preview")).toContainText("dom 22 nov");
  await expect(page.locator("#modalbox").getByRole("button", { name: /Crear/ })).toContainText("5");
  await save(page);
  const ts = await created(page);
  expect(ts.map(t => t.date)).toEqual(["2026-11-10", "2026-11-13", "2026-11-16", "2026-11-19", "2026-11-22"]);
  expect(new Set(ts.map(t => t.sid)).size).toBe(1);
  expect(ts[0].sid).toBeTruthy();
  expect(ts.every(t => !t.recur)).toBe(true);
  // deshacer borra las 5
  await page.locator("#toast button", { hasText: "Deshacer" }).click();
  expect(await created(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("ciertos días de la semana hasta una fecha", async ({ page }) => {
  const errors = await openApp(page);
  await open(page);
  await page.selectOption("#qt_rep", "days");
  await page.locator('#qt_repdays [data-wd="1"]').click(); // lunes
  await page.locator('#qt_repdays [data-wd="4"]').click(); // jueves
  await page.selectOption("#qt_repend", "until");
  await page.fill("#qt_repuntil", "2026-11-23");
  await expect(page.locator("#qt_preview")).toContainText("Se van a crear 4 tareas");
  await save(page);
  expect((await created(page)).map(t => t.date)).toEqual(["2026-11-12", "2026-11-16", "2026-11-19", "2026-11-23"]);
  expect(errors).toEqual([]);
});

test("todos los días, cada semana y cada mes", async ({ page }) => {
  const errors = await openApp(page);
  const dates = await page.evaluate(() => ({
    daily: repeatDates("2026-11-10", { kind: "daily" }, { type: "count", n: 3 }),
    weekly: repeatDates("2026-11-10", { kind: "weekly" }, { type: "until", date: "2026-12-01" }),
    monthly: repeatDates("2026-11-10", { kind: "monthly" }, { type: "count", n: 3 }),
    month31: repeatDates("2026-10-31", { kind: "monthly" }, { type: "count", n: 3 }),
  }));
  expect(dates.daily).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
  expect(dates.weekly).toEqual(["2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01"]);
  expect(dates.monthly).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
  expect(dates.month31).toEqual(["2026-10-31", "2026-12-31", "2027-01-31"]); // noviembre no tiene 31: se saltea
  expect(errors).toEqual([]);
});

test("sin fin: crea UNA tarea que se repite (no 1000), y la vista previa muestra las próximas", async ({ page }) => {
  const errors = await openApp(page);
  await open(page, "Gym");
  await page.selectOption("#qt_rep", "weekly");
  await page.selectOption("#qt_repend", "never");
  await expect(page.locator("#qt_preview")).toContainText("Sin fin");
  await expect(page.locator("#qt_preview")).toContainText("mar 17 nov");
  await save(page);
  const ts = await created(page, "Gym");
  expect(ts).toHaveLength(1);
  expect(ts[0].recur).toMatchObject({ kind: "weekly", start: "2026-11-10" });
  await reload(page);
  expect(await page.evaluate(() => tasksOn("2026-11-24").map(t => t.title))).toContain("Gym");
  expect(await page.evaluate(() => tasksOn("2026-11-25").map(t => t.title))).not.toContain("Gym");
  expect(errors).toEqual([]);
});

test("errores claros: sin días elegidos, fecha final antes del inicio, demasiadas", async ({ page }) => {
  const errors = await openApp(page);
  await open(page);
  await page.selectOption("#qt_rep", "days");
  await expect(page.locator("#qt_preview")).toContainText("Elegí al menos un día");
  await page.selectOption("#qt_rep", "daily");
  await page.selectOption("#qt_repend", "until");
  await page.fill("#qt_repuntil", "2026-11-01");
  await expect(page.locator("#qt_preview")).toContainText("posterior");
  await save(page);
  expect(await created(page)).toEqual([]);
  await page.selectOption("#qt_repend", "count");
  await page.fill("#qt_repcount", "500");
  await expect(page.locator("#qt_preview")).toContainText("120");
  expect(errors).toEqual([]);
});

test("en el celu los controles de Repetir entran en pantalla y se tocan cómodos", async ({ page }) => {
  const errors = await openApp(page);
  await open(page);
  await page.selectOption("#qt_rep", "days");
  const w = await page.evaluate(() => innerWidth);
  const b = await page.locator('#qt_repdays [data-wd="0"]').boundingBox();
  expect(b.x + b.width).toBeLessThanOrEqual(w);
  expect(b.height).toBeGreaterThanOrEqual(36);
  expect(errors).toEqual([]);
});
