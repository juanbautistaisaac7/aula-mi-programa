// M1 · En el celu, deslizar una tarea hacia la derecha la borra (con Deshacer).
const { test, expect } = require("@playwright/test");
const { openApp, seedState, fixture } = require("./helpers");

test.beforeEach(({}, info) => { test.skip(info.project.name !== "mobile", "gesto táctil: proyecto mobile"); });

async function setup(page) {
  await page.clock.install({ time: new Date("2026-11-04T11:00:00-03:00") });
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  await page.evaluate(() => go("today"));
  await page.waitForTimeout(100);
  const cdp = await page.context().newCDPSession(page);
  return { errors, cdp };
}
// Desliza la fila de la tarea `id`: dx en px, en `steps` pasos de `ms` cada uno.
async function swipe(page, cdp, id, dx, dy = 0, steps = 12, ms = 16) {
  const box = await page.locator(`#view .task[data-id="${id}"]`).first().boundingBox();
  const x0 = box.x + 40, y0 = box.y + box.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + dx * i / steps, y: y0 + dy * i / steps }] });
    await page.waitForTimeout(ms);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
const has = (page, id) => page.evaluate(id => state.tasks.some(t => t.id === id), id);

test("deslizar lejos borra con Deshacer; soltar antes vuelve a su lugar", async ({ page }) => {
  const { errors, cdp } = await setup(page);
  // corto: no borra y la fila vuelve
  await swipe(page, cdp, "t-2", 90);
  await page.waitForTimeout(300);
  expect(await has(page, "t-2")).toBe(true);
  expect(await page.locator('#view .task[data-id="t-2"]').evaluate(el => el.style.transform || "none")).toMatch(/none|translateX\(0px\)/);
  expect(await page.locator(".swipebg").count()).toBe(0);
  // mientras se desliza se ve el fondo rojo con el tachito
  const box = await page.locator('#view .task[data-id="t-2"]').boundingBox();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 40, y: box.y + 20 }] });
  for (let i = 1; i <= 10; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + 40 + 22 * i, y: box.y + 20 }] }); await page.waitForTimeout(16); }
  await expect(page.locator(".swipebg")).toBeVisible();
  await expect(page.locator(".swipebg")).toHaveClass(/armed/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); // la fila no se sale de la pantalla
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => has(page, "t-2")).toBe(false);
  await expect(page.locator("#toast")).toContainText("Tarea eliminada");
  await expect(page.locator('#view .task[data-id="t-2"]')).toHaveCount(0);
  await page.locator("#toast button").click(); // Deshacer
  expect(await has(page, "t-2")).toBe(true);
  await expect(page.locator('#view .task[data-id="t-2"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("un movimiento rápido aunque corto también borra", async ({ page }) => {
  const { errors, cdp } = await setup(page);
  await swipe(page, cdp, "t-2", 140, 0, 4, 8);
  await expect.poll(() => has(page, "t-2")).toBe(false);
  expect(errors).toEqual([]);
});

test("un gesto vertical es scroll, no borra; hacia la izquierda tampoco", async ({ page }) => {
  const { errors, cdp } = await setup(page);
  await swipe(page, cdp, "t-2", 60, 220);
  await swipe(page, cdp, "t-2", -250);
  await page.waitForTimeout(300);
  expect(await has(page, "t-2")).toBe(true);
  expect(await page.locator(".swipebg").count()).toBe(0);
  // tocar sigue abriendo el editor
  await page.locator('#view .task[data-id="t-2"] .tt').first().tap();
  await expect(page.locator("#modalbox")).toContainText("Editar tarea");
  expect(errors).toEqual([]);
});

test("una tarea de una serie pregunta cuáles borrar", async ({ page }) => {
  const { errors, cdp } = await setup(page);
  const sp = await page.evaluate(() => {
    const t = state.tasks.find(x => seriesPos(x) && document.querySelector(`#view .task[data-id="${x.id}"]`));
    const p = seriesPos(t); return { id: t.id, n: p.n, i: p.i, ids: p.list.map(x => x.id) };
  });
  expect(sp.n).toBeGreaterThan(1);
  await swipe(page, cdp, sp.id, 300);
  await expect(page.locator("#confirmbg")).toHaveClass(/open/);
  await expect(page.locator("#confirmbox")).toContainText("Solo esta");
  // cancelar: no borra nada y la fila vuelve
  await page.locator("#confirmbox").getByRole("button", { name: "Cancelar" }).click();
  expect(await has(page, sp.id)).toBe(true);
  await expect(page.locator(`#view .task[data-id="${sp.id}"]`)).toBeVisible();
  // todas: borra la serie entera, con deshacer
  await swipe(page, cdp, sp.id, 300);
  await page.locator("#confirmbox").getByRole("button", { name: new RegExp("Todas") }).click();
  for (const id of sp.ids) await expect.poll(() => has(page, id)).toBe(false);
  await page.locator("#toast button").click();
  for (const id of sp.ids) expect(await has(page, id)).toBe(true);
  // solo esta
  await swipe(page, cdp, sp.id, 300);
  await page.locator("#confirmbox").getByRole("button", { name: "Solo esta" }).click();
  await expect.poll(() => has(page, sp.id)).toBe(false);
  for (const id of sp.ids.filter(x => x !== sp.id)) expect(await has(page, id)).toBe(true);
  expect(errors).toEqual([]);
});

test("una tarea que se repite avisa que se van todas sus repeticiones", async ({ page }) => {
  const { errors, cdp } = await setup(page);
  const id = await page.evaluate(() => state.tasks.find(t => t.recur && !seriesPos(t) && document.querySelector(`#view .task[data-id="${t.id}"]`)).id);
  await swipe(page, cdp, id, 300);
  await expect(page.locator("#confirmbox")).toContainText("se repite");
  await page.locator("#confirmbox").getByRole("button", { name: "Cancelar" }).click();
  expect(await has(page, id)).toBe(true);
  await swipe(page, cdp, id, 300);
  await page.locator("#confirmbox").getByRole("button", { name: /Borrar con sus repeticiones/ }).click();
  await expect.poll(() => has(page, id)).toBe(false);
  await page.locator("#toast button").click();
  expect(await has(page, id)).toBe(true);
  expect(errors).toEqual([]);
});
