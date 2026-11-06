// Q1 · Hallazgos de la revisión del 5/11 en el celu (con el fixture).
const { test, expect } = require("@playwright/test");
const { openApp, setClock, seedState, fixture } = require("./helpers");

const NOW = "2026-11-04T11:00:00-03:00";

async function abrirConFixture(page, hash) {
  await setClock(page, NOW);
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(150);
  return errors;
}

/** Títulos de ≤ 25 caracteres que ocupan más de un renglón. */
function titulosPartidos(page) {
  return page.$$eval("#view .task[data-id] .tt", els => els.map(el => {
    const txt = el.textContent.replace(/\s+/g, " ").trim();
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 18;
    // medimos solo el texto del título (sin etiquetas): un rango sobre el primer nodo de texto
    const tn = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (!tn) return null;
    const r = document.createRange(); r.selectNodeContents(tn);
    const lines = new Set([...r.getClientRects()].map(x => Math.round(x.top))).size;
    return { t: tn.textContent.trim(), len: tn.textContent.trim().length, lines, lh, full: txt };
  }).filter(x => x && x.len <= 25 && x.lines > 1));
}

// Fuera del describe: corre también en desktop con la ventana angosta, que es el caso de un
// teléfono que dice "tengo hover" (Android con mouse, algunos Samsung, o una captura de página completa):
// ahí las acciones invisibles de la fila se comían la mitad del ancho.
test("Q1 · los títulos cortos entran en un renglón en Hoy e Inicio, haya hover o no", async ({ page }, info) => {
  if (info.project.name === "desktop") await page.setViewportSize({ width: 412, height: 900 });
  const errors = await abrirConFixture(page, "#/today");
  expect(await titulosPartidos(page)).toEqual([]);
  await page.evaluate(() => go("home")); await page.waitForTimeout(150);
  expect(await titulosPartidos(page)).toEqual([]);
  // en desktop ancho siguen las acciones al pasar el mouse
  if (info.project.name === "desktop") {
    await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(100);
    expect(await page.locator("#view .task[data-id] .tactions").first().evaluate(e => getComputedStyle(e).display)).not.toBe("none");
  }
  expect(errors).toEqual([]);
});

test.describe("Q1 · celu", () => {
  test.beforeEach(({ }, info) => { test.skip(info.project.name !== "mobile", "solo celu"); });

  test("dentro de Atrasadas no se repite «atrasada» en cada fila; la fecha va en rojo suave", async ({ page }) => {
    const errors = await abrirConFixture(page, "#/today");
    const card = page.locator("#view .card", { has: page.locator("h3", { hasText: "Atrasadas" }) });
    await expect(card.locator(".task[data-id]").first()).toBeVisible();
    await expect(card.locator(".pill.bad", { hasText: "atrasada" })).toHaveCount(0);
    await expect(card.locator(".task[data-id] .mins.late").first()).toBeVisible();
    // en otras vistas (la lista completa) la etiqueta sigue sirviendo
    await page.evaluate(() => go("list")); await page.waitForTimeout(150);
    await expect(page.locator("#view .pill.bad", { hasText: "atrasada" }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Inicio en el celu es corto: números en una fila y sin repetir las listas de Hoy", async ({ page }) => {
    const errors = await abrirConFixture(page, "#/home");
    const stats = page.locator("#view .homestats");
    await expect(stats).toBeVisible();
    const tops = await stats.locator(".hs").evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    expect(tops.length).toBe(3);
    expect(new Set(tops).size).toBe(1); // los tres en una sola fila
    expect((await stats.boundingBox()).height).toBeLessThan(110);
    // no se repiten Atrasadas ni la lista entera de Para hoy (eso vive en Hoy)
    await expect(page.locator("#view h3", { hasText: /^Atrasadas/ })).toHaveCount(0);
    const enHoy = await page.evaluate(() => tasksOn(todayISO()).length + overdueTasks().length);
    const filas = await page.locator("#view .task[data-id]").count();
    expect(filas).toBeLessThan(enHoy);
    // acceso claro a la lista completa
    const ver = page.locator("#view button, #view a", { hasText: /Ver todo en Hoy/ });
    await expect(ver).toBeVisible();
    await ver.click();
    await expect(page).toHaveURL(/#\/today$/);
    await page.evaluate(() => go("home")); await page.waitForTimeout(150);
    // el estudio de hoy queda a mano pero plegado
    const est = page.locator("#view details.studyfold");
    await expect(est).toBeVisible();
    expect(await est.evaluate(d => d.open)).toBe(false);
    // mucho más corto que antes (antes: ~2700 px con el fixture)
    const alto = await page.evaluate(() => document.querySelector("#view").scrollHeight);
    expect(alto).toBeLessThan(1700);
    expect(errors).toEqual([]);
  });

  test("el botón de tema se entiende (sol / luna) y tiene 44 px para el dedo", async ({ page }) => {
    const errors = await abrirConFixture(page, "#/today");
    const b = page.locator("#btnTheme");
    const box = await b.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(b.locator("svg")).toHaveCount(1);
    await expect(b).not.toContainText("◐");
    const lab = () => b.getAttribute("aria-label");
    await page.evaluate(() => setTheme("light"));
    expect(await lab()).toMatch(/claro/);
    await expect(b).toHaveAttribute("data-icon", "sun");
    await b.click();
    expect(await lab()).toMatch(/oscuro/);
    await expect(b).toHaveAttribute("data-icon", "moon");
    await b.click();
    expect(await lab()).toMatch(/automático/);
    expect(errors).toEqual([]);
  });
});

// En la compu Inicio sigue completo: Flexibles con la ayuda abajo, chiquita, no metida en el encabezado.
test("Q1 · Flexibles: el encabezado no lleva texto de ayuda metido adentro", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "en el celu Inicio no muestra Flexibles (viven en Hoy)");
  const errors = await abrirConFixture(page, "#/home");
  const card = page.locator("#view .card", { has: page.locator("h3", { hasText: "Flexibles" }) });
  await expect(card).toHaveCount(1);
  const h3 = card.locator("h3");
  await expect(h3).toHaveText("Flexibles próximas a vencer");
  expect((await h3.boundingBox()).height).toBeLessThan(40);
  await expect(card.locator(".zonehint")).toContainText("Hoy");
  expect(errors).toEqual([]);
});

test("Q1 · al angostar la ventana Inicio pasa a resumen y vuelve", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "cambio de ancho");
  const errors = await abrirConFixture(page, "#/home");
  await expect(page.locator("#view h3", { hasText: /^Atrasadas/ })).toHaveCount(1);
  await page.setViewportSize({ width: 412, height: 900 });
  await expect(page.locator("#view h3", { hasText: /^Atrasadas/ })).toHaveCount(0);
  await expect(page.locator("#view .homemore")).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("#view h3", { hasText: /^Atrasadas/ })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("Q1 · Hoy: «Mover todas a hoy» en Atrasadas, con Deshacer", async ({ page }) => {
  const errors = await abrirConFixture(page, "#/today");
  const antes = await page.evaluate(() => overdueTasks().map(t => [t.id, t.date || null, t.due || null]));
  expect(antes.length).toBeGreaterThan(0);
  const card = page.locator("#view .card", { has: page.locator("h3", { hasText: "Atrasadas" }) });
  await card.getByRole("button", { name: "Mover todas a hoy" }).click();
  await expect(page.locator("#view h3", { hasText: /^Atrasadas/ })).toHaveCount(0);
  expect(await page.evaluate(() => overdueTasks().length)).toBe(0);
  await page.locator("#toast button", { hasText: "Deshacer" }).click();
  await expect(page.locator("#view h3", { hasText: /^Atrasadas/ })).toHaveCount(1);
  expect(await page.evaluate(ids => ids.map(([id]) => { const t = taskById(id); return [t.id, t.date || null, t.due || null]; }), antes)).toEqual(antes);
  expect(errors).toEqual([]);
});
