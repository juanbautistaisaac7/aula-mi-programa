// Tests de humo: la app carga, se crean tareas y los datos persisten.
// Son la red de seguridad mínima: si alguno falla, NO se commitea.
const { test, expect } = require("@playwright/test");
const { openApp, createQuickTask, reload } = require("./helpers");

test("la app carga sin errores de consola", async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.locator("body")).toBeVisible();
  expect(errors).toEqual([]);
});

test("crear una tarea simple: aparece, persiste y NO es una serie", async ({ page }) => {
  const errors = await openApp(page);
  await createQuickTask(page, "Leer apunte de límites");
  const tasks = await page.evaluate(() => state.tasks.filter(t => t.title === "Leer apunte de límites"));
  expect(tasks).toHaveLength(1);
  expect(tasks[0].recur).toBeFalsy();

  await reload(page);
  const after = await page.evaluate(() => state.tasks.filter(t => t.title === "Leer apunte de límites").length);
  expect(after).toBe(1);
  expect(errors).toEqual([]);
});

test("todas las vistas del menú renderizan sin errores", async ({ page }) => {
  const errors = await openApp(page);
  const unique = await page.evaluate(() => VIEWS.map(v => v[0]).concat(["list"]));
  expect(unique.length).toBeGreaterThan(3);
  for (const v of unique) {
    await page.evaluate(v => go(v), v);
    await page.waitForTimeout(50);
  }
  expect(errors).toEqual([]);
});
