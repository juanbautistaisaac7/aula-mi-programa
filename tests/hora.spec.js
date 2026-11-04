// B1 · Hora opcional en tareas: crear, editar, ordenar y mostrar.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, reload } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

test("se crea una tarea con hora desde el modal rápido y persiste", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => openQuickTask("2026-11-04"));
  await page.fill("#qt_title", "Consulta con el profe");
  await page.fill("#qt_time", "18:30");
  await page.locator("#modalbox").getByRole("button", { name: "Crear tarea" }).click();
  await reload(page);
  expect(await page.evaluate(() => state.tasks.find(t => t.title === "Consulta con el profe").time)).toBe("18:30");
  await page.evaluate(() => go("today"));
  await expect(page.locator("#view .task", { hasText: "Consulta con el profe" }).locator(".ttime")).toHaveText("18:30");
  expect(errors).toEqual([]);
});

test("sin fecha no se ofrece hora; una tarea sin hora no guarda hora", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => openQuickTask());
  await page.selectOption("#qt_mode", "none");
  await expect(page.locator("#qt_time")).toBeHidden();
  await page.selectOption("#qt_mode", "d");
  await expect(page.locator("#qt_time")).toBeVisible();
  await page.fill("#qt_title", "Sin hora");
  await page.press("#qt_title", "Enter");
  expect(await page.evaluate(() => state.tasks.find(t => t.title === "Sin hora").time)).toBeNull();
  expect(errors).toEqual([]);
});

test("se edita y se borra la hora desde el detalle", async ({ page }) => {
  const errors = await openApp(page);
  const id = await page.evaluate(() => quickAddTask({ title: "Leer", date: todayISO() }).id);
  await page.evaluate(id => openTaskEditor(id), id);
  await page.fill("#te_time", "09:15");
  await page.locator("#modalbox").getByRole("button", { name: "Guardar" }).click();
  expect(await page.evaluate(id => taskById(id).time, id)).toBe("09:15");
  await page.evaluate(id => openTaskEditor(id), id);
  await expect(page.locator("#te_time")).toHaveValue("09:15");
  await page.fill("#te_time", "");
  await page.locator("#modalbox").getByRole("button", { name: "Guardar" }).click();
  expect(await page.evaluate(id => taskById(id).time, id)).toBeNull();
  expect(errors).toEqual([]);
});

test("en Hoy, Semana y Calendario las con hora van primero y en orden; las sin hora después", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    const d = todayISO();
    quickAddTask({ title: "Sin hora A", date: d, prio: 2 });
    quickAddTask({ title: "A las 20", date: d, time: "20:00" });
    quickAddTask({ title: "Sin hora B", date: d });
    quickAddTask({ title: "A las 8", date: d, time: "08:00" });
    quickAddTask({ title: "A las 13", date: d, time: "13:00" });
  });
  const expected = ["A las 8", "A las 13", "A las 20", "Sin hora A", "Sin hora B"];
  await page.evaluate(() => go("today"));
  const card = page.locator("#view .card", { has: page.locator("h3", { hasText: "Programadas para hoy" }) });
  const titles = await card.locator(".task .tt").allInnerTexts();
  expect(titles).toHaveLength(5);
  expect(titles.map(x => expected.find(e => x.includes(e)))).toEqual(expected);

  await page.evaluate(() => go("week"));
  const wk = await page.locator("#view .wday.today .wtask").allInnerTexts();
  expect(wk.map(x => expected.find(e => x.includes(e)))).toEqual(expected);
  expect(wk[0]).toContain("08:00");

  await page.evaluate(() => go("calendar"));
  const cal = await page.locator("#view .day.today .ev").allInnerTexts();
  expect(cal[0]).toContain("08:00");
  expect(cal[0]).toContain("A las 8");
  expect(errors).toEqual([]);
});

test("las tareas con hora no se reordenan a mano (no tienen ↑↓ ni manija)", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { quickAddTask({ title: "Con hora", date: todayISO(), time: "10:00" }); quickAddTask({ title: "Libre", date: todayISO() }); });
  await page.evaluate(() => go("today"));
  const timed = page.locator("#view .task", { hasText: "Con hora" });
  await expect(timed.locator(".drag[title]")).toHaveCount(0);
  await expect(timed.locator('button[title^="Subir"]')).toHaveCount(0);
  await expect(page.locator("#view .task", { hasText: "Libre" }).locator(".drag[title]")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("con formato de 12 h se muestra como a. m. / p. m.", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { state.settings.hourFmt = 12; quickAddTask({ title: "Tarde", date: todayISO(), time: "18:30" }); quickAddTask({ title: "Mañana", date: todayISO(), time: "09:00" }); go("today"); });
  await expect(page.locator("#view .task", { hasText: "Tarde" }).locator(".ttime")).toHaveText("6:30 p. m.");
  await expect(page.locator("#view .task", { hasText: "Mañana" }).locator(".ttime")).toHaveText("9 a. m.");
  expect(errors).toEqual([]);
});

test("los parciales tienen hora y se ve en la semana", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { state.evals.push({ id: "ev1", name: "Parcial BD", kind: "parcial", date: todayISO(), time: "18:00", status: "prep", subjectId: null, topics: [] }); go("week"); });
  await expect(page.locator("#view .wday.today .wtask").first()).toContainText("18:00");
  await page.evaluate(() => openEvalEditor("ev1"));
  await expect(page.locator("#ev_time")).toHaveValue("18:00");
  expect(errors).toEqual([]);
});
