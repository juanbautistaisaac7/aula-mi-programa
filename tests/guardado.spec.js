// X1 · Nada se pierde si cerrás la app justo después de un cambio.
const { test, expect } = require("@playwright/test");
const { openApp, createQuickTask, reload } = require("./helpers");

test("si el navegador corta el guardado en IndexedDB al cerrar, la tarea se recupera igual", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => persist());
  // Desde acá IndexedDB "no llega" a escribir (como cuando el celu mata la app)
  await page.evaluate(() => { const real = db.transaction.bind(db); db.transaction = (s, m) => { if (m === "readwrite") throw new Error("cortado"); return real(s, m); }; });
  await createQuickTask(page, "Tarea de último momento");
  await reload(page);
  expect(await page.evaluate(() => state.tasks.filter(t => t.title === "Tarea de último momento").length)).toBe(1);
  // Y queda consolidada en IndexedDB
  expect(await page.evaluate(async () => JSON.parse(await idbGet("kv", "state")).tasks.some(t => t.title === "Tarea de último momento"))).toBe(true);
  expect(errors).toEqual([]);
});

test("crear y recargar al instante, muchas veces, nunca pierde nada", async ({ page }) => {
  const errors = await openApp(page);
  for (let i = 0; i < 8; i++) {
    await page.evaluate(i => { quickAddTask({ title: "Rápida " + i }); }, i);
    await reload(page);
  }
  const n = await page.evaluate(() => state.tasks.filter(t => /^Rápida /.test(t.title)).length);
  expect(n).toBe(8);
  expect(errors).toEqual([]);
});

test("una copia de emergencia más vieja que IndexedDB no pisa los datos", async ({ page }) => {
  const errors = await openApp(page);
  await createQuickTask(page, "Nueva");
  await page.evaluate(async () => {
    await persist();
    const old = JSON.parse(localStorage.getItem("aula-emergency"));
    old.tasks = old.tasks.filter(t => t.title !== "Nueva"); old.meta.lastSave = 1;
    localStorage.setItem("aula-emergency", JSON.stringify(old));
  });
  await reload(page);
  expect(await page.evaluate(() => state.tasks.some(t => t.title === "Nueva"))).toBe(true);
  expect(errors).toEqual([]);
});
