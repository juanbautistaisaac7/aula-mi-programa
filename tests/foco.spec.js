// X7 · Al abrir un modal, el foco va al primer campo 30 ms después. Si ya tocaste otro campo,
// no se lo tiene que robar: lo que escribías terminaba en el título.
const { test, expect } = require("@playwright/test");
const { openApp, seedState, fixture } = require("./helpers");

test("abrir el editor y escribir enseguida en minutos no cambia el título", async ({ page }) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  const { id, title } = await page.evaluate(() => { const t = state.tasks.find(x => !x.done); return { id: t.id, title: t.title }; });
  await page.evaluate(id => { openTaskEditor(id); const m = document.getElementById("te_min"); m.focus(); }, id);
  await page.keyboard.type("77");
  await page.waitForTimeout(120);
  await expect(page.locator("#te_title")).toHaveValue(title);
  await expect(page.locator("#te_min")).toBeFocused();
  // y si no tocaste nada, el foco sí va al primer campo
  await page.evaluate(() => closeModal());
  await page.evaluate(id => openTaskEditor(id), id);
  await expect(page.locator("#te_title")).toBeFocused();
  expect(errors).toEqual([]);
});
