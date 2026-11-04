// B4 · Pasar tareas a otro día: sección Mañana en Hoy, arrastrar (mouse y dedo) y "Mover a…".
const { test, expect } = require("@playwright/test");
const { openApp, setClock, reload } = require("./helpers");

// Miércoles 4 de noviembre de 2026, 10:00 (hora ARG).
test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T10:00:00-03:00"); });

const isTouch = page => page.evaluate(() => matchMedia("(hover:none)").matches);

/** Toques reales de pantalla táctil (CDP): Chrome genera pointer events de tipo "touch". */
async function touch(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  return {
    start: (x, y) => send("touchStart", [{ x, y }]),
    move: (x, y) => send("touchMove", [{ x, y }]),
    end: () => send("touchEnd", []),
  };
}
const center = async loc => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

async function seed(page) {
  return page.evaluate(() => {
    const a = quickAddTask({ title: "Leer apunte", date: "2026-11-04", estMin: 60 });
    const b = quickAddTask({ title: "Hacer TP", date: "2026-11-04", estMin: 30 });
    const c = quickAddTask({ title: "Repasar", date: "2026-11-05" });
    go("today");
    return { a: a.id, b: b.id, c: c.id };
  });
}

test("Hoy muestra la sección Mañana aunque esté vacía", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { quickAddTask({ title: "Algo", date: "2026-11-04" }); go("today"); });
  const zone = page.locator('#view [data-dropdate="2026-11-05"]');
  await expect(zone).toBeVisible();
  await expect(zone.locator("h3")).toContainText("Mañana");
  await expect(zone.locator(".empty")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Mover a…: cada opción da la fecha exacta, y se puede deshacer", async ({ page }) => {
  const errors = await openApp(page);
  const ids = await seed(page);
  await page.evaluate(id => openMoveSheet(id), ids.a);
  const sheet = page.locator("#sheet");
  await expect(sheet).toBeVisible();
  const opt = n => sheet.getByRole("button", { name: new RegExp("^" + n) });
  await expect(opt("Mañana")).toContainText("jue 5");
  await expect(opt("Pasado mañana")).toContainText("vie 6");
  await expect(opt("En 3 días")).toContainText("sáb 7");
  await expect(opt("Próximo lunes")).toContainText("lun 9");
  await expect(opt("En 1 semana")).toContainText("mié 11");
  // ya está hoy: la opción "Hoy" no se ofrece
  await expect(opt("Hoy")).toHaveCount(0);
  await opt("Próximo lunes").click();
  await expect(sheet).toBeHidden();
  expect(await page.evaluate(id => taskById(id).date, ids.a)).toBe("2026-11-09");
  await expect(page.locator("#toast")).toContainText("lun 9");
  await page.locator("#toast button", { hasText: "Deshacer" }).click();
  expect(await page.evaluate(id => taskById(id).date, ids.a)).toBe("2026-11-04");
  await expect(page.locator('#view [data-dropdate="2026-11-04"] .task', { hasText: "Leer apunte" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Mover a…: elegir fecha, y persiste al recargar", async ({ page }) => {
  const errors = await openApp(page);
  const ids = await seed(page);
  await page.evaluate(id => openMoveSheet(id), ids.b);
  await page.locator("#sheet .sheetopt", { hasText: "Elegir fecha" }).click();
  await page.fill("#mv_date", "2026-11-20");
  await page.locator("#sheet button", { hasText: "Mover" }).last().click();
  expect(await page.evaluate(id => taskById(id).date, ids.b)).toBe("2026-11-20");
  await reload(page);
  expect(await page.evaluate(id => taskById(id).date, ids.b)).toBe("2026-11-20");
  expect(errors).toEqual([]);
});

test("una tarea flexible (solo vence) se agenda sin perder el vencimiento; una pospuesta vuelve a pendiente", async ({ page }) => {
  const errors = await openApp(page);
  const id = await page.evaluate(() => { const t = quickAddTask({ title: "Flexible", due: "2026-11-10" }); t.status = "post"; return t.id; });
  await page.evaluate(id => moveTaskTo(id, "2026-11-05"), id);
  const t = await page.evaluate(id => taskById(id), id);
  expect(t.date).toBe("2026-11-05");
  expect(t.due).toBe("2026-11-10");
  expect(t.status).toBe("pend");
  expect(errors).toEqual([]);
});

test("las tareas que se repiten no se mueven de día", async ({ page }) => {
  const errors = await openApp(page);
  const id = await page.evaluate(() => quickAddTask({ title: "Gym", recur: { kind: "daily", start: "2026-11-01" } }).id);
  await page.evaluate(id => openMoveSheet(id), id);
  await expect(page.locator("#sheet")).toBeHidden();
  expect(await page.evaluate(id => moveTaskTo(id, "2026-11-06"), id)).toBe(false);
  expect(await page.evaluate(id => taskById(id).recur.start, id)).toBe("2026-11-01");
  expect(errors).toEqual([]);
});

test("en desktop, el botón Mover… de la fila abre el menú", async ({ page }) => {
  const errors = await openApp(page);
  test.skip(await isTouch(page), "en táctil se usa mantener apretado");
  const ids = await seed(page);
  const row = page.locator(`#view .task[data-id="${ids.a}"]`);
  await row.hover();
  await row.locator(".tactions button", { hasText: "Mover" }).click();
  await expect(page.locator("#sheet")).toBeVisible();
  await page.locator("#sheet .sheetopt", { hasText: "Mañana" }).first().click();
  expect(await page.evaluate(id => taskById(id).date, ids.a)).toBe("2026-11-05");
  expect(errors).toEqual([]);
});

test("en desktop, arrastrar con el mouse de Hoy a Mañana mueve la tarea (y se deshace)", async ({ page }) => {
  const errors = await openApp(page);
  test.skip(await isTouch(page), "prueba de mouse");
  const ids = await seed(page);
  const h = await center(page.locator(`#view .task[data-id="${ids.a}"] .drag`));
  const target = await center(page.locator(`#view .task[data-id="${ids.c}"]`));
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(h.x, h.y + 10, { steps: 3 });
  await page.mouse.move(target.x, target.y + 10, { steps: 12 });
  await expect(page.locator(`#view [data-dropdate="2026-11-05"]`)).toHaveClass(/over/);
  await page.mouse.up();
  expect(await page.evaluate(id => taskById(id).date, ids.a)).toBe("2026-11-05");
  // quedó después de "Repasar" (soltaste en la mitad de abajo)
  expect(await page.evaluate(() => tasksOn("2026-11-05").map(t => t.title))).toEqual(["Repasar", "Leer apunte"]);
  await expect(page.locator(`#view [data-dropdate="2026-11-05"] .task`, { hasText: "Leer apunte" })).toBeVisible();
  await page.locator("#toast button", { hasText: "Deshacer" }).click();
  expect(await page.evaluate(id => taskById(id).date, ids.a)).toBe("2026-11-04");
  expect(errors).toEqual([]);
});

test("en desktop, arrastrar dentro de Hoy sigue cambiando el orden", async ({ page }) => {
  const errors = await openApp(page);
  test.skip(await isTouch(page), "prueba de mouse");
  const ids = await seed(page);
  expect(await page.evaluate(() => tasksOn("2026-11-04").map(t => t.title))).toEqual(["Hacer TP", "Leer apunte"]);
  const h = await center(page.locator(`#view .task[data-id="${ids.a}"] .drag`));
  const bx = await page.locator(`#view .task[data-id="${ids.b}"]`).boundingBox();
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(h.x, h.y - 6, { steps: 2 });
  await page.mouse.move(bx.x + 40, bx.y + 4, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => tasksOn("2026-11-04").map(t => t.title))).toEqual(["Leer apunte", "Hacer TP"]);
  expect(await page.evaluate(id => taskById(id).date, ids.a)).toBe("2026-11-04");
  expect(errors).toEqual([]);
});

test("en el celu, mantener apretada y arrastrar con el dedo pasa la tarea a Mañana", async ({ page }) => {
  const errors = await openApp(page);
  test.skip(!(await isTouch(page)), "prueba táctil");
  const ids = await seed(page);
  const tc = await touch(page);
  const from = await center(page.locator(`#view .task[data-id="${ids.b}"] .tt`));
  await tc.start(from.x, from.y);
  await page.waitForTimeout(550); // mantener apretado
  await expect(page.locator(`#view .task[data-id="${ids.b}"]`)).toHaveClass(/lifted/);
  const zone = page.locator('#view [data-dropdate="2026-11-05"]');
  await zone.scrollIntoViewIfNeeded().catch(() => {});
  const to = await center(zone.locator(".task").first());
  for (let i = 1; i <= 10; i++) await tc.move(from.x, from.y + (to.y + 12 - from.y) * i / 10);
  await expect(zone).toHaveClass(/over/);
  await tc.end();
  expect(await page.evaluate(id => taskById(id).date, ids.b)).toBe("2026-11-05");
  await expect(page.locator("#sheet")).toBeHidden(); // arrastrar no abre el menú
  await expect(page.locator("#modalbg")).not.toHaveClass(/open/); // ni el editor
  expect(errors).toEqual([]);
});

test("en el celu, mantener apretada sin mover abre Mover a…; deslizar rápido no mueve nada", async ({ page }) => {
  const errors = await openApp(page);
  test.skip(!(await isTouch(page)), "prueba táctil");
  const ids = await seed(page);
  const tc = await touch(page);
  const p = await center(page.locator(`#view .task[data-id="${ids.a}"] .tt`));
  // deslizar sin esperar = scroll, no arrastre
  await tc.start(p.x, p.y);
  for (let i = 1; i <= 6; i++) await tc.move(p.x, p.y - i * 12);
  await page.waitForTimeout(500);
  await tc.end();
  await expect(page.locator("#sheet")).toBeHidden();
  expect(await page.evaluate(id => taskById(id).date, ids.a)).toBe("2026-11-04");
  await expect(page.locator(".task.lifted")).toHaveCount(0);
  // mantener apretado y soltar = menú
  const q = await center(page.locator(`#view .task[data-id="${ids.a}"] .tt`));
  await tc.start(q.x, q.y);
  await page.waitForTimeout(550);
  await tc.end();
  await expect(page.locator("#sheet")).toBeVisible();
  await expect(page.locator("#modalbg")).not.toHaveClass(/open/); // no se abre el editor encima
  const opt = page.locator("#sheet .sheetopt", { hasText: "En 1 semana" });
  const box = await opt.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44); // se toca cómodo con el pulgar
  await opt.tap();
  expect(await page.evaluate(id => taskById(id).date, ids.a)).toBe("2026-11-11");
  expect(errors).toEqual([]);
});

test("en desktop, una tarea que se repite se reordena dentro de Hoy pero no se pasa a Mañana", async ({ page }) => {
  const errors = await openApp(page);
  test.skip(await isTouch(page), "prueba de mouse");
  const ids = await page.evaluate(() => {
    const a = quickAddTask({ title: "Hacer TP", date: "2026-11-04", estMin: 10 });
    const r = quickAddTask({ title: "Gym", estMin: 90, recur: { kind: "daily", start: "2026-11-01" } });
    const c = quickAddTask({ title: "Repasar", date: "2026-11-05" });
    go("today");
    return { a: a.id, r: r.id, c: c.id };
  });
  expect(await page.evaluate(() => tasksOn("2026-11-04").map(t => t.title))).toEqual(["Hacer TP", "Gym"]);
  const h = await center(page.locator(`#view [data-dropdate="2026-11-04"] .task[data-id="${ids.r}"] .drag`));
  const bx = await page.locator(`#view .task[data-id="${ids.a}"]`).boundingBox();
  await page.mouse.move(h.x, h.y); await page.mouse.down();
  await page.mouse.move(h.x, h.y - 6, { steps: 2 });
  await page.mouse.move(bx.x + 40, bx.y + 4, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => tasksOn("2026-11-04").map(t => t.title))).toEqual(["Gym", "Hacer TP"]);
  // a Mañana no
  const h2 = await center(page.locator(`#view [data-dropdate="2026-11-04"] .task[data-id="${ids.r}"] .drag`));
  const to = await center(page.locator(`#view .task[data-id="${ids.c}"]`));
  await page.mouse.move(h2.x, h2.y); await page.mouse.down();
  await page.mouse.move(h2.x, h2.y + 8, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator("#toast")).toContainText("se repiten");
  expect(await page.evaluate(id => taskById(id).recur.start, ids.r)).toBe("2026-11-01");
  expect(errors).toEqual([]);
});
