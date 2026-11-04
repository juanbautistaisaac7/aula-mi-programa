// X2 · En el celu la fila de una tarea usa todo el ancho disponible.
const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers");

test("el texto de la tarea ocupa casi todo el ancho de la fila (en táctil no hay acciones invisibles)", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { quickAddTask({ title: "Un título bastante largo para ver si se corta a la mitad de la pantalla", date: todayISO() }); go("today"); });
  const row = page.locator("#view .task").first();
  const r = await row.evaluate(el => ({ row: el.getBoundingClientRect().width, info: el.querySelector(".tinfo").getBoundingClientRect().width, touch: matchMedia("(hover:none)").matches, act: getComputedStyle(el.querySelector(".tactions")).display }));
  if (r.touch) {
    expect(r.act).toBe("none");
    expect(r.info / r.row).toBeGreaterThan(0.7);
  } else {
    expect(r.act).not.toBe("none"); // en desktop siguen las acciones al pasar el mouse
  }
  expect(errors).toEqual([]);
});
