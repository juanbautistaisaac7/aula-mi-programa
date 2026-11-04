// A4b · Menú lateral más corto y Configuración ordenada.
const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers");

async function openMenu(page) {
  if (!(await page.evaluate(() => document.body.classList.contains("sb-open")))) await page.click("#btnMenu");
}

test("el menú tiene 3 grupos y 14 entradas como máximo; Historial y Copias no están sueltos", async ({ page }) => {
  const errors = await openApp(page);
  await openMenu(page);
  const r = await page.evaluate(() => ({
    secs: [...document.querySelectorAll("#sidebar .sec")].map(e => e.textContent),
    links: [...document.querySelectorAll("#sidebar a")].map(a => a.textContent.trim())
  }));
  expect(r.secs.length).toBe(3);
  expect(r.links.length).toBeLessThanOrEqual(14);
  expect(r.links).not.toContain("Historial");
  expect(r.links).not.toContain("Copias de seguridad");
  expect(r.links).toContain("Configuración");
  expect(errors).toEqual([]);
});

test("Historial y Copias de seguridad se abren desde Configuración y vuelven", async ({ page }) => {
  const errors = await openApp(page);
  for (const [btn, title] of [["Historial", "Historial"], ["Copias de seguridad", "Copias de seguridad"]]) {
    await page.evaluate(() => go("config"));
    await page.locator("#view").getByRole("button", { name: btn, exact: true }).click();
    await expect(page.locator("#view h2")).toHaveText(title);
    // En el menú queda marcada Configuración
    await expect(page.locator("#sidebar a.on")).toHaveText("Configuración");
    await page.locator("#view").getByRole("button", { name: "‹ Configuración" }).click();
    await expect(page.locator("#view h2").first()).toHaveText("Configuración");
  }
  expect(errors).toEqual([]);
});

test("Configuración: preferencias de tiempo juntas, sin tarjeta vacía", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => go("config"));
  const pref = page.locator("#view .card", { has: page.locator("h3", { hasText: "Preferencias" }) });
  await expect(pref).toContainText("Primer día de la semana");
  await expect(pref.locator("#cfg_dayend")).toBeVisible();
  const ap = page.locator("#view .card", { has: page.locator("h3", { hasText: "Apariencia" }) });
  await expect(ap).not.toContainText("Mi día termina");
  expect(errors).toEqual([]);
});

test("el archivo basura MANIFE~1.WEB ya no existe", async () => {
  expect(require("fs").existsSync(require("path").join(__dirname, "..", "MANIFE~1.WEB"))).toBe(false);
});
