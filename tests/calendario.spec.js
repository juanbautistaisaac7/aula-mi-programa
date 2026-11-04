// D1 (parte celu) · Calendario estilo iOS: puntos por día, lista del día elegido, crear en ese día, deslizar.
const { test, expect } = require("@playwright/test");
const { openApp, setClock } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

async function datos(page) {
  await page.evaluate(() => {
    quickAddTask({ title: "Leer TP", date: "2026-11-12", time: "18:30", estMin: 45 });
    quickAddTask({ title: "Resumen", date: "2026-11-12", estMin: 30 });
    state.evals.push({ id: "e-cal", name: "Parcial AM2", date: "2026-11-12", time: "09:00", subjectId: null, status: "pend", topics: [] });
    change(); go("calendar");
  });
}

test("en el celu el mes entra en la pantalla y cada día muestra puntos", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "solo mobile");
  const errors = await openApp(page);
  await datos(page);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
  await expect(page.locator('.cal .day[data-date="2026-11-12"] .cdots i')).toHaveCount(3);
  await expect(page.locator('.cal .day[data-date="2026-11-12"] .ev').first()).toBeHidden();
  // hoy está elegido y su lista se ve abajo
  await expect(page.locator(".cal .day.selday")).toHaveAttribute("data-date", "2026-11-04");
  await expect(page.locator("#calday h3")).toContainText("Mié 4 nov");
  expect(errors).toEqual([]);
});

test("tocar un día muestra su lista (parcial y tareas con hora) y deja crear una tarea ese día", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "solo mobile");
  const errors = await openApp(page);
  await datos(page);
  await page.locator('.cal .day[data-date="2026-11-12"]').tap();
  await expect(page.locator(".cal .day.selday")).toHaveAttribute("data-date", "2026-11-12");
  await expect(page.locator("#modalbg")).not.toHaveClass(/open/); // en el celu no abre el resumen
  const list = page.locator("#calday");
  await expect(list).toContainText("Parcial AM2");
  await expect(list).toContainText("09:00");
  await expect(list).toContainText("Leer TP");
  await expect(list).toContainText("18:30");
  await expect(list).toContainText("Resumen");
  await list.getByRole("button", { name: "+ Tarea para el jue 12 nov" }).tap();
  await expect(page.locator("#qt_date")).toHaveValue("2026-11-12");
  await page.fill("#qt_title", "Nueva del 12");
  await page.press("#qt_title", "Enter");
  await expect(list).toContainText("Nueva del 12");
  expect(errors).toEqual([]);
});

test("deslizar y los botones cambian de mes", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "solo mobile");
  const errors = await openApp(page);
  await page.evaluate(() => go("calendar"));
  await page.evaluate(() => { calSwipe({ changedTouches: [{ clientX: 320, clientY: 300 }] }, 0); calSwipe({ changedTouches: [{ clientX: 120, clientY: 310 }] }, 1); });
  await expect(page.locator(".calhead .sub")).toHaveText("Diciembre 2026");
  await expect(page.locator(".cal .day.selday")).toHaveAttribute("data-date", "2026-12-01");
  // un scroll vertical no cambia de mes
  await page.evaluate(() => { calSwipe({ changedTouches: [{ clientX: 200, clientY: 100 }] }, 0); calSwipe({ changedTouches: [{ clientX: 130, clientY: 400 }] }, 1); });
  await expect(page.locator(".calhead .sub")).toHaveText("Diciembre 2026");
  await page.getByRole("button", { name: "Mes anterior" }).tap();
  await page.getByRole("button", { name: "Mes anterior" }).tap();
  await expect(page.locator(".calhead .sub")).toHaveText("Octubre 2026");
  await page.getByRole("button", { name: "Hoy" }).tap();
  await expect(page.locator(".cal .day.selday")).toHaveAttribute("data-date", "2026-11-04");
  expect(errors).toEqual([]);
});

test("en desktop las celdas muestran las tareas y el clic abre el resumen del día", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "solo desktop");
  const errors = await openApp(page);
  await datos(page);
  await expect(page.locator('.cal .day[data-date="2026-11-12"] .ev').first()).toBeVisible();
  await expect(page.locator("#calday")).toBeHidden();
  await page.locator('.cal .day[data-date="2026-11-12"] .dnum').click();
  await expect(page.locator("#modalbg")).toHaveClass(/open/);
  expect(errors).toEqual([]);
});

// D1b · desktop: horas legibles, crear desde la celda, parciales bien marcados, sin desbordes.
test("en desktop las horas del día se leen como '1 h 15 m' y no como decimales", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "solo desktop");
  const errors = await openApp(page);
  await datos(page);
  await page.evaluate(() => { quickAddTask({ title: "Corta", date: "2026-11-13", estMin: 20 }); change(); render(); });
  await expect(page.locator('.cal .day[data-date="2026-11-12"] .dmin')).toHaveText("1 h 15 m");
  await expect(page.locator('.cal .day[data-date="2026-11-13"] .dmin')).toHaveText("20 m");
  const decimales = await page.locator(".cal .dmin").allTextContents();
  expect(decimales.filter(t => /\d[.,]\d/.test(t))).toEqual([]);
  expect(errors).toEqual([]);
});

test("en desktop se crea una tarea en un día desde la celda, sin pasar por el resumen", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "solo desktop");
  const errors = await openApp(page);
  await datos(page);
  const cell = page.locator('.cal .day[data-date="2026-11-19"]');
  await cell.hover();
  const plus = cell.getByRole("button", { name: "Nueva tarea el jue 19 nov" });
  await expect(plus).toBeVisible();
  await plus.click();
  await expect(page.locator("#qt_date")).toHaveValue("2026-11-19");
  await page.fill("#qt_title", "Desde la celda");
  await page.press("#qt_title", "Enter");
  await expect(cell.locator(".ev", { hasText: "Desde la celda" })).toBeVisible();
  // el botón no se ve si no pasás por encima (no ensucia la grilla)
  await page.mouse.move(5, 5);
  await expect(page.locator('.cal .day[data-date="2026-11-20"] .calplus')).toHaveCSS("opacity", "0");
  expect(errors).toEqual([]);
});

test("en desktop los días con parcial se distinguen y el parcial va primero con su hora", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "solo desktop");
  const errors = await openApp(page);
  await datos(page);
  const cell = page.locator('.cal .day[data-date="2026-11-12"]');
  await expect(cell).toHaveClass(/hasev/);
  await expect(page.locator('.cal .day[data-date="2026-11-13"]')).not.toHaveClass(/hasev/);
  const first = cell.locator(".ev").first();
  await expect(first).toHaveClass(/exam/);
  await expect(first).toContainText("09:00");
  await expect(first).toContainText("Parcial AM2");
  await first.click();
  await expect(page).toHaveURL(/#\/eval\/e-cal/);
  expect(errors).toEqual([]);
});

test("en desktop un día con muchas cosas no desborda y '+N más' abre el resumen", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "solo desktop");
  const errors = await openApp(page);
  await datos(page);
  await page.evaluate(() => {
    for (let i = 1; i <= 9; i++) quickAddTask({ title: "Tarea con un título bastante largo número " + i, date: "2026-11-12", estMin: 30 });
    state.evals.push({ id: "e-cal2", name: "Final de Análisis Matemático II con nombre largo", date: "2026-11-12", subjectId: null, status: "pend", topics: [] });
    change(); render();
  });
  const cell = page.locator('.cal .day[data-date="2026-11-12"]');
  const m = await cell.evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth, h: el.getBoundingClientRect().height,
    other: document.querySelector('.cal .day[data-date="2026-11-11"]').getBoundingClientRect().height }));
  expect(m.sw).toBeLessThanOrEqual(m.cw);
  expect(m.h).toBeLessThanOrEqual(m.other + 1); // la fila no se estira por un día lleno
  const more = cell.locator(".more", { hasText: /más/ });
  await expect(more).toHaveText("+10 más");
  await more.click();
  await expect(page.locator("#modalbg")).toHaveClass(/open/);
  await expect(page.locator("#modalbg")).toContainText("Tarea con un título bastante largo número 9");
  expect(errors).toEqual([]);
});
