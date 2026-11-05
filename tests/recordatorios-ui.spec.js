// E1a2 · Recordatorios: "Avisarme" en el editor de parcial y de tarea, y los valores por defecto en Configuración.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, fixture, seedState, storedState } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

const chips = (page, id) => page.locator(`#${id} .remchip .remlbl`);

test("parcial: muestra los avisos por defecto, guardar sin tocar no escribe nada, y se pueden cambiar", async ({ page }) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  await page.evaluate(() => openEvalEditor("e-pe2"));
  await expect(chips(page, "ev_rem")).toHaveText(["7 días antes", "1 día antes"]);
  await expect(page.locator("#ev_rem .remnote")).toContainText("Configuración");
  // guardar sin tocar: el parcial sigue sin lista propia (usa los de Configuración)
  await page.locator(".mfoot .btn.primary").click();
  expect(await page.evaluate(() => "reminders" in evalById("e-pe2"))).toBe(false);

  await page.evaluate(() => openEvalEditor("e-pe2"));
  await page.locator('#ev_rem .remchip button[aria-label="Quitar 7 días antes"]').click();
  await page.locator("#ev_rem .remadd", { hasText: "2 h" }).click();
  // "Otro…": 3 días
  await page.locator("#ev_rem .remother").click();
  await page.locator("#ev_rem_n").fill("3");
  await page.locator("#ev_rem_u").selectOption("d");
  await page.locator("#ev_rem_ok").click();
  await expect(chips(page, "ev_rem")).toHaveText(["3 días antes", "1 día antes", "2 h antes"]);
  await page.locator(".mfoot .btn.primary").click();
  expect(await page.evaluate(() => evalById("e-pe2").reminders)).toEqual([
    { amount: 3, unit: "d" }, { amount: 1, unit: "d" }, { amount: 2, unit: "h" }]);
  // sacar todos = "sin avisos" (lista vacía, no vuelve a los de Configuración)
  await page.evaluate(() => openEvalEditor("e-pe2"));
  for (let i = 0; i < 3; i++) await page.locator("#ev_rem .remchip button").first().click();
  await expect(page.locator("#ev_rem .remnote")).toContainText("Sin avisos");
  await page.locator(".mfoot .btn.primary").click();
  expect(await page.evaluate(() => evalById("e-pe2").reminders)).toEqual([]);
  const st = await storedState(page);
  expect(st.evals.find(e => e.id === "e-pe2").reminders).toEqual([]);
  expect(errors).toEqual([]);
});

test("tarea: sin hora no se puede avisar; con hora se agrega un aviso y queda guardado", async ({ page }) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  await page.evaluate(() => openTaskEditor("t-1"));
  await expect(page.locator("#te_rem .remnote")).toContainText("Poné una hora");
  await expect(page.locator("#te_rem .remadd")).toHaveCount(0);
  await page.locator("#te_time").fill("15:30");
  await page.locator("#te_time").dispatchEvent("change");
  await page.locator("#te_rem .remadd", { hasText: "30 min" }).click();
  await expect(chips(page, "te_rem")).toHaveText(["30 min antes"]);
  await page.locator(".mfoot .btn.primary").click();
  const t = await page.evaluate(() => taskById("t-1"));
  expect(t.time).toBe("15:30");
  expect(t.reminders).toEqual([{ amount: 30, unit: "min" }]);
  // al reabrir se ve, y una tarea que no se tocó no gana la lista
  await page.evaluate(() => openTaskEditor("t-1"));
  await expect(chips(page, "te_rem")).toHaveText(["30 min antes"]);
  await page.locator(".mfoot .btn", { hasText: "Cancelar" }).click();
  await page.evaluate(() => openTaskEditor("t-2"));
  await page.locator(".mfoot .btn.primary").click();
  expect(await page.evaluate(() => "reminders" in taskById("t-2"))).toBe(false);
  expect(errors).toEqual([]);
});

test("Configuración: cambiar los avisos por defecto de los parciales afecta a los que no tienen propios", async ({ page }) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  await page.evaluate(() => go("config"));
  await expect(chips(page, "cfg_rem_eval")).toHaveText(["7 días antes", "1 día antes"]);
  await page.locator('#cfg_rem_eval .remchip button[aria-label="Quitar 7 días antes"]').click();
  await page.locator("#cfg_rem_eval .remadd", { hasText: "3 días" }).click();
  await page.locator("#cfg_rem_task .remadd", { hasText: "1 h" }).click();
  const d = await page.evaluate(() => state.settings.reminderDefaults);
  expect(d).toEqual({ eval: [{ amount: 3, unit: "d" }, { amount: 1, unit: "d" }], task: [{ amount: 1, unit: "h" }] });
  const st = await storedState(page);
  expect(st.settings.reminderDefaults).toEqual(d);
  await page.evaluate(() => openEvalEditor("e-an2"));
  await expect(chips(page, "ev_rem")).toHaveText(["3 días antes", "1 día antes"]);
  expect(errors).toEqual([]);
});

test("con Aula abierta y las notificaciones activadas, cada aviso suena una sola vez a su hora", async ({ page }) => {
  await page.addInitScript(() => {
    window.__notifs = [];
    window.Notification = class { constructor(t, o) { window.__notifs.push(o.body); } static get permission() { return "granted"; } static requestPermission() { return Promise.resolve("granted"); } };
  });
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  const r = await page.evaluate(() => {
    state.settings.notif = true; window.__notifs.length = 0;
    // 11:00: una tarea a las 11:30 con aviso 30 min antes, otra a las 12:00 (todavía no)
    const t = taskById("t-1"); t.date = todayISO(); t.time = "11:30"; t.reminders = [{ amount: 30, unit: "min" }];
    const u = taskById("t-2"); u.date = todayISO(); u.time = "12:00"; u.reminders = [{ amount: 30, unit: "min" }];
    // un parcial mañana a las 11:00 con los avisos por defecto (1 día antes = ahora)
    const e = evalById("e-an2"); e.date = "2026-11-05"; e.time = "11:00";
    checkReminders(); checkReminders();
    return window.__notifs.slice();
  });
  expect(r.filter(x => x.includes("Leer apunte de límites"))).toEqual(["Leer apunte de límites · en 30 min"]);
  expect(r.some(x => x.includes("Ejercicios guía 5"))).toBe(false);
  expect(r.filter(x => x.includes("Recuperatorio AN"))).toEqual(["Recuperatorio AN · en 1 día"]);
  expect(errors).toEqual([]);
});
