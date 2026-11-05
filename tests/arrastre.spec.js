// C5 · Arrastrar para ordenar tiene que ser fluido (mouse y dedo).
const { test, expect } = require("@playwright/test");
const { openApp, setClock } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T10:00:00-03:00"); });

const isTouch = page => page.evaluate(() => matchMedia("(hover:none)").matches);
async function touch(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  return { start: (x, y) => send("touchStart", [{ x, y }]), move: (x, y) => send("touchMove", [{ x, y }]), end: () => send("touchEnd", []) };
}
const center = async loc => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const orden = page => page.evaluate(() => tasksOn("2026-11-04").map(t => t.title));
const row = (page, title) => page.locator('#view [data-dropdate="2026-11-04"] .task', { hasText: title }).first();

async function seed(page, n = 7) {
  await page.evaluate(n => {
    for (let i = 1; i <= n; i++) { const t = quickAddTask({ title: "Tarea " + String(i).padStart(2, "0"), date: "2026-11-04", estMin: 30 }); t.ord = i; }
    change(); go("today");
    // espía: pointercancel y mediciones de layout durante el arrastre
    window.__cancel = 0; window.addEventListener("pointercancel", () => window.__cancel++, true);
    const orig = Element.prototype.getBoundingClientRect;
    window.__rects = 0;
    Element.prototype.getBoundingClientRect = function () { window.__rects++; return orig.call(this); };
  }, n);
  await expect(page.locator('#view [data-dropdate="2026-11-04"] .task')).toHaveCount(n);
}
const T = i => "Tarea " + String(i).padStart(2, "0");

/** Arrastra con el mouse desde el cuerpo de la fila (no hace falta la manija). */
async function mouseDrag(page, fromTitle, toTitle, half = "below", steps = 20) {
  const a = await center(row(page, fromTitle));
  const b = await row(page, toTitle).boundingBox();
  const ty = half === "below" ? b.y + b.height * 0.75 : b.y + b.height * 0.25;
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(a.x, a.y + (ty > a.y ? 8 : -8), { steps: 2 });
  await page.mouse.move(a.x, ty, { steps });
  await page.mouse.up();
}

test("desktop: arrastrar desde toda la fila, 4 abajo y 2 arriba deja el orden correcto", async ({ page }) => {
  const errors = await openApp(page);
  test.skip(await isTouch(page), "mouse");
  await seed(page);
  expect(await orden(page)).toEqual([1, 2, 3, 4, 5, 6, 7].map(T));
  await mouseDrag(page, T(1), T(5), "below");
  expect(await orden(page)).toEqual([2, 3, 4, 5, 1, 6, 7].map(T));
  await page.waitForTimeout(300); // que termine de asentarse
  await mouseDrag(page, T(6), T(4), "above");
  expect(await orden(page)).toEqual([2, 3, 6, 4, 5, 1, 7].map(T));
  expect(await page.evaluate(() => window.__cancel)).toBe(0);
  // un clic sin mover sigue abriendo el editor
  await page.waitForTimeout(450);
  await row(page, T(7)).locator(".tt").click();
  await expect(page.locator("#modalbg")).toHaveClass(/open/);
  await expect(page.locator("#te_title")).toHaveValue(T(7));
  expect(errors).toEqual([]);
});

test("desktop: el arrastre no mide el layout en cada movimiento y el fantasma va por transform", async ({ page }) => {
  const errors = await openApp(page);
  test.skip(await isTouch(page), "mouse");
  await seed(page);
  const a = await center(row(page, T(1)));
  const b = await row(page, T(7)).boundingBox();
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(a.x, a.y + 10, { steps: 2 }); // empieza el arrastre (acá sí mide, una vez)
  await expect(page.locator(".dragghost")).toHaveCount(1);
  const left0 = await page.locator(".dragghost").evaluate(g => g.style.left);
  await page.evaluate(() => { window.__rects = 0; });
  for (let i = 1; i <= 60; i++) await page.mouse.move(a.x + (i % 7), a.y + 10 + (b.y + b.height * 0.8 - a.y - 10) * i / 60);
  const rects = await page.evaluate(() => window.__rects);
  expect(rects).toBeLessThanOrEqual(2); // O(1): nada por movimiento
  const g = await page.locator(".dragghost").evaluate(g => ({ left: g.style.left, tr: g.style.transform }));
  expect(g.left).toBe(left0); // no se mueve con left/top
  expect(g.tr).toContain("translate3d");
  // las filas se corrieron para abrir el hueco (como en iOS)
  expect(await page.locator("#view .task.shifted").count()).toBeGreaterThan(0);
  await page.mouse.up();
  expect((await orden(page)).at(-1)).toBe(T(1));
  await expect(page.locator(".dragghost")).toHaveCount(0, { timeout: 1000 });
  await expect(page.locator("#view .task.shifted")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("desktop: arrastrar hasta el borde hace auto-scroll y se puede soltar abajo", async ({ page }) => {
  const errors = await openApp(page);
  test.skip(await isTouch(page), "mouse");
  await page.setViewportSize({ width: 1100, height: 520 });
  await seed(page, 24);
  const a = await center(row(page, T(1)));
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(a.x, a.y + 10, { steps: 2 });
  await page.mouse.move(a.x, 512, { steps: 10 });
  await page.waitForTimeout(1500); // el auto-scroll sigue solo mientras estás en el borde
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(y0 + 200);
  await page.mouse.move(a.x, 505, { steps: 2 });
  await page.mouse.up();
  const o = await orden(page);
  expect(o.indexOf(T(1))).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});

test("celu: mantener y arrastrar con el dedo, 4 abajo y 2 arriba, sin cortes ni scroll", async ({ page }) => {
  const errors = await openApp(page);
  test.skip(!(await isTouch(page)), "táctil");
  await seed(page, 6);
  await page.evaluate(() => scrollTo(0, 0));
  const tc = await touch(page);
  const drag = async (fromTitle, toTitle, half) => {
    const a = await center(row(page, fromTitle).locator(".tt"));
    const b = await row(page, toTitle).boundingBox();
    const ty = half === "below" ? b.y + b.height * 0.75 : b.y + b.height * 0.25;
    const sy = await page.evaluate(() => scrollY);
    await tc.start(a.x, a.y);
    await page.waitForTimeout(520);
    for (let i = 1; i <= 16; i++) { await tc.move(a.x, a.y + (ty - a.y) * i / 16); }
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => scrollY)).toBe(sy); // la página no scrolleó sola
    await tc.end();
    await page.waitForTimeout(300);
  };
  await drag(T(1), T(5), "below");
  expect(await orden(page)).toEqual([2, 3, 4, 5, 1, 6].map(T));
  await drag(T(6), T(4), "above");
  expect(await orden(page)).toEqual([2, 3, 6, 4, 5, 1].map(T));
  expect(await page.evaluate(() => window.__cancel)).toBe(0);
  await expect(page.locator("#sheet")).toBeHidden();
  expect(errors).toEqual([]);
});

test("celu: un scroll normal sobre la lista no levanta ninguna tarea", async ({ page }) => {
  const errors = await openApp(page);
  test.skip(!(await isTouch(page)), "táctil");
  await seed(page, 20);
  const tc = await touch(page);
  const a = await center(row(page, T(6)).locator(".tt"));
  await tc.start(a.x, a.y);
  for (let i = 1; i <= 10; i++) await tc.move(a.x, a.y - i * 25);
  await page.waitForTimeout(600);
  await expect(page.locator(".task.lifted, .dragghost")).toHaveCount(0);
  await tc.end();
  expect(await orden(page)).toEqual(Array.from({ length: 20 }, (_, i) => T(i + 1)));
  await expect(page.locator("#sheet")).toBeHidden();
  expect(errors).toEqual([]);
});
