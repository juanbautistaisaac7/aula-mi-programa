// B5 · La lista completa se limpia sola: las hechas hace más de N días no se muestran (no se borran).
const { test, expect } = require("@playwright/test");
const { openApp, setClock, reload } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T10:00:00-03:00"); });

async function seed(page) {
  await page.evaluate(() => {
    const mk = (title, doneAt, extra = {}) => { const t = quickAddTask(Object.assign({ title, date: doneAt || "2026-11-06" }, extra)); if (doneAt !== undefined) { t.status = "done"; t.doneAt = doneAt; } return t; };
    mk("Pendiente", undefined);
    mk("Hecha anteayer", "2026-11-02");
    mk("Hecha justo hace 7", "2026-10-28");
    mk("Hecha hace 8", "2026-10-27");
    mk("Hecha hace un mes", "2026-10-01");
    const v = mk("Vieja sin doneAt", null, { date: "2026-09-10" }); // datos viejos: hecha sin fecha de completada
    go("list");
  });
}
const titles = page => page.locator("#view .task .tt").allInnerTexts();

test("por defecto se ocultan las hechas hace más de 7 días, sin borrarlas", async ({ page }) => {
  const errors = await openApp(page);
  await seed(page);
  const t = (await titles(page)).join("|");
  expect(t).toContain("Pendiente");
  expect(t).toContain("Hecha anteayer");
  expect(t).toContain("Hecha justo hace 7");
  expect(t).not.toContain("Hecha hace 8");
  expect(t).not.toContain("Hecha hace un mes");
  expect(t).not.toContain("Vieja sin doneAt");
  await expect(page.locator("#view .oldDone")).toContainText("3");
  expect(await page.evaluate(() => state.tasks.length)).toBe(6); // nada se borró
  expect(errors).toEqual([]);
});

test("'Mostrar hechas antiguas' las vuelve a mostrar, y se pueden volver a ocultar", async ({ page }) => {
  const errors = await openApp(page);
  await seed(page);
  await page.locator("#view .oldDone button").click();
  expect((await titles(page)).join("|")).toContain("Hecha hace un mes");
  await expect(page.locator("#view .task")).toHaveCount(6);
  await page.locator("#view .oldDone button").click();
  await expect(page.locator("#view .task")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("filtrar por estado 'hecha' muestra todas, aunque sean antiguas", async ({ page }) => {
  const errors = await openApp(page);
  await seed(page);
  await page.evaluate(() => { ui.listFilters.status = "done"; render(); });
  await expect(page.locator("#view .task")).toHaveCount(5);
  expect(errors).toEqual([]);
});

test("el plazo se ajusta en Configuración y persiste; 'Nunca' no oculta nada", async ({ page }) => {
  const errors = await openApp(page);
  await seed(page);
  await page.evaluate(() => go("config"));
  await page.selectOption("#cfg_donekeep", "3");
  await page.evaluate(() => go("list"));
  const t = (await titles(page)).join("|");
  expect(t).toContain("Hecha anteayer");
  expect(t).not.toContain("Hecha justo hace 7");
  await reload(page);
  expect(await page.evaluate(() => state.settings.doneKeepDays)).toBe(3);
  await page.evaluate(() => go("config"));
  await page.selectOption("#cfg_donekeep", "0");
  await page.evaluate(() => go("list"));
  await expect(page.locator("#view .task")).toHaveCount(6);
  await expect(page.locator("#view .oldDone")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("pasa el tiempo: una tarea hecha hoy desaparece sola de la lista a los 8 días", async ({ page }) => {
  const errors = await openApp(page);
  const id = await page.evaluate(() => { const t = quickAddTask({ title: "Hecha hoy", date: todayISO() }); t.status = "done"; t.doneAt = todayISO(); change(); go("list"); return t.id; });
  await expect(page.locator("#view .task", { hasText: "Hecha hoy" })).toHaveCount(1);
  await page.clock.setSystemTime(new Date("2026-11-12T10:00:00-03:00"));
  await page.evaluate(() => render());
  await expect(page.locator("#view .task", { hasText: "Hecha hoy" })).toHaveCount(0);
  expect(await page.evaluate(id => taskById(id).status, id)).toBe("done");
  expect(errors).toEqual([]);
});
