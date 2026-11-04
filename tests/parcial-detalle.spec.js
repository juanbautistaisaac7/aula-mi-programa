// X3 · Detalle del parcial: un número grande arriba (días + preparación) y el resto en una fila compacta.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, seedState, fixture } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

test("arriba: días que faltan y preparación; abajo una sola fila con los demás números", async ({ page }, info) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  await page.evaluate(() => go("eval", "e-pe2"));
  const hero = page.locator("#view .evhero");
  await expect(hero.locator(".evdays")).toHaveText("8");
  await expect(hero).toContainText("días");
  await expect(hero).toContainText("jue 12 nov");
  const prep = await page.evaluate(() => evalPrep(evalById("e-pe2")));
  await expect(hero.locator(".evprep")).toHaveText(prep + "%");
  // las 6 tarjetas grandes ya no están
  await expect(page.locator("#view .grid3 .statnum")).toHaveCount(0);
  const stats = page.locator("#view .evstat");
  await expect(stats).toHaveCount(4);
  const tops = await stats.evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1); // en una fila, también en el celu
  if (info.project.name === "mobile") {
    // las tareas del parcial empiezan antes: el resumen entero entra en la primera pantalla
    const b = await page.locator("#view .evstats").evaluate(el => el.getBoundingClientRect().bottom);
    expect(b).toBeLessThan(await page.evaluate(() => window.innerHeight));
  }
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("un parcial que ya pasó lo dice en el número grande", async ({ page }) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  await page.evaluate(() => go("eval", "e-ec1"));
  await expect(page.locator("#view .evhero")).toContainText("ya pasó");
  expect(errors).toEqual([]);
});

// X5 · En el celu, los botones no se parten: cada botón en un renglón, sin cortar su texto.
test("los botones del encabezado y de 'Tareas y plan' no se parten ni se apretujan", async ({ page }) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  await page.evaluate(() => go("eval", "e-pe2"));
  await expect(page.locator("#view .evhero")).toBeVisible();
  // ningún botón de la vista ocupa dos renglones
  const multi = await page.locator("#view .vhead .btn, #view .evplanh .btn").evaluateAll(bs => bs
    .filter(b => { const lh = parseFloat(getComputedStyle(b).lineHeight) || 16; return b.scrollHeight - parseFloat(getComputedStyle(b).paddingTop) - parseFloat(getComputedStyle(b).paddingBottom) > lh * 1.5; })
    .map(b => b.textContent.trim()));
  expect(multi).toEqual([]);
  // las acciones del encabezado van juntas, en un mismo renglón
  const tops = await page.locator("#view .vhead .vacts .btn").evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().top)));
  expect(tops.length).toBe(3);
  expect(new Set(tops).size).toBe(1);
  // el título de "Tareas y plan de estudio" no se parte en dos renglones
  const t = page.locator("#view .evplanh .evplant");
  const h = await t.evaluate(el => el.getBoundingClientRect().height);
  const lh = await t.evaluate(el => parseFloat(getComputedStyle(el).lineHeight) || 18);
  expect(h).toBeLessThan(lh * 1.5);
  // el selector de dificultad del tema nuevo muestra su texto entero
  const sel = await page.locator("#tp_diff").evaluate(s => s.getBoundingClientRect().width);
  expect(sel).toBeGreaterThanOrEqual(80);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
