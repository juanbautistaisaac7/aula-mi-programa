// S1c · Pantalla de sincronización en Configuración: activar, QR, código, link, desconectar.
const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers");

const KEY = "Zx9_kLm2Qa7-Rt5vWb3nYp";
async function fakeServer(page) {
  let version = 0;
  await page.route("**/api/sync", async route => {
    const r = route.request();
    if (r.method() === "PUT") { version++; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version }) }); }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: 0, data: null }) });
  });
}

test("activar muestra el estado, el QR y el código; desconectar pide confirmación", async ({ page }) => {
  await fakeServer(page);
  const errors = await openApp(page);
  await page.evaluate(() => go("config"));
  const card = page.locator("#synccard");
  await expect(card).toContainText("Sincronizar compu y celu");
  await expect(card.locator("details.syncsetup")).toContainText("AULA_KV");
  await card.getByRole("button", { name: "Activar en este dispositivo" }).click();
  await expect(card.locator(".syncstat")).toContainText("Al día");
  await expect(page.locator("#saveTxt")).toHaveText("al día");
  await expect(card.locator(".syncqr svg")).toBeVisible();
  const key = await page.evaluate(() => syncCfg.key);
  expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/); // 128 bits
  await expect(card.locator(".synccode")).toHaveText(key.replace(/(.{4})/g, "$1 ").trim());
  // no hay scroll horizontal en el celu
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  // el código no va dentro de los datos
  expect(await page.evaluate(k => JSON.stringify(state).includes(k), key)).toBe(false);
  await card.getByRole("button", { name: "Desconectar este dispositivo" }).click();
  await page.locator("#confirmOkBtn").click();
  await expect(card).toContainText("Activar en este dispositivo");
  expect(await page.evaluate(() => syncOn())).toBe(false);
  expect(errors).toEqual([]);
});

test("el link del QR abre Configuración y ofrece conectar", async ({ page }) => {
  await fakeServer(page);
  await page.goto("/#/sync?k=" + KEY);
  await page.waitForFunction(() => typeof state !== "undefined" && state && document.querySelector("#sidebar a"));
  await expect(page).toHaveURL(/#\/config$/); // el código no queda en la barra de direcciones
  await expect(page.locator(".syncinvite")).toContainText("Abriste un link de sincronización");
  await page.getByRole("button", { name: "Conectar este dispositivo" }).click();
  await expect.poll(() => page.evaluate(() => syncCfg && syncCfg.key)).toBe(KEY);
  await expect(page.locator(".syncinvite")).toHaveCount(0);
});

test("ya tengo un código: acepta el código con espacios o el link entero, y rechaza basura", async ({ page }) => {
  await fakeServer(page);
  const errors = await openApp(page);
  await page.evaluate(() => go("config"));
  await page.getByRole("button", { name: "Ya tengo un código" }).click();
  await page.fill("#sync_code", "esto no es un código");
  await page.getByRole("button", { name: "Conectar", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("no parece válido");
  expect(await page.evaluate(() => syncOn())).toBe(false);
  await page.fill("#sync_code", KEY.replace(/(.{4})/g, "$1 "));
  await page.getByRole("button", { name: "Conectar", exact: true }).click();
  await expect.poll(() => page.evaluate(() => syncCfg && syncCfg.key)).toBe(KEY);
  await page.evaluate(() => { syncDisconnect(); ui.syncPaste = true; refreshSyncCard(); });
  await page.fill("#sync_code", "https://aula-pi0.pages.dev/#/sync?k=" + KEY);
  await page.press("#sync_code", "Enter");
  await expect.poll(() => page.evaluate(() => syncCfg && syncCfg.key)).toBe(KEY);
  expect(errors).toEqual([]);
});

test("el generador de QR arma la estructura correcta (verificado además con un lector real)", async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const out = [];
    for (const n of [10, 60, 100, 150, 200]) {
      const q = qrEncode("x".repeat(n)), M = q.modules, s = q.size;
      const finder = (x, y) => [0, 1, 2, 3, 4, 5, 6].every(i => M[y][x + i] && M[y + 6][x + i] && M[y + i][x] && M[y + i][x + 6]) && M[y + 3][x + 3] && !M[y + 1][x + 1];
      const timing = [...Array(s - 16)].every((_, i) => M[6][8 + i] === ((8 + i) % 2 === 0));
      out.push({ v: q.version, size: s === q.version * 4 + 17, f: finder(0, 0) && finder(s - 7, 0) && finder(0, s - 7), timing, dark: M[s - 8][8] });
    }
    let tooLong = false; try { qrEncode("x".repeat(300)); } catch (e) { tooLong = true; }
    return { out, tooLong, same: qrSVG("hola") === qrSVG("hola") };
  });
  expect(r.out.map(x => x.v)).toEqual([1, 4, 6, 8, 10]);
  expect(r.out.every(x => x.size && x.f && x.timing && x.dark)).toBe(true);
  expect(r.tooLong).toBe(true);
  expect(r.same).toBe(true);
});
