// E1c · Respaldo local de los avisos (con Aula abierta): no repite lo que ya mandó ntfy y
// mira todos los años aunque haya un año viejo a la vista.
const { test, expect } = require("@playwright/test");
const { openApp, setClock } = require("./helpers");

const TOPIC = "aula-DDDDDDDDDDDDDDDDDDDDDD";

test.beforeEach(async ({ page }) => {
  await setClock(page, "2026-11-04T11:00:00-03:00");
  await page.route("https://ntfy.sh/**", r => r.fulfill({ status: 200, body: "{}", headers: { "access-control-allow-origin": "*" } }));
  await page.addInitScript(() => {
    window.__notifs = [];
    window.Notification = class { constructor(t, o) { window.__notifs.push(o.body); } static get permission() { return "granted"; } static requestPermission() { return Promise.resolve("granted"); } };
  });
});

async function seed(page) {
  await page.evaluate(() => {
    state.settings.notif = true;
    state.tasks.push({ id: "a1", title: "Avisada por ntfy", date: "2026-11-04", time: "11:20", reminders: [{ amount: 30, unit: "min" }], status: "pend", estMin: 30 });
    state.tasks.push({ id: "a2", title: "Solo local", date: "2026-11-04", time: "11:25", reminders: [{ amount: 30, unit: "min" }], status: "pend", estMin: 30 });
  });
}

test("con ntfy activo, lo que ya programó ntfy no suena dos veces; lo demás sí", async ({ page }) => {
  const errors = await openApp(page);
  await seed(page);
  const r = await page.evaluate(topic => {
    state.settings.ntfy = Object.assign(defaultNtfy(), { on: true, topic });
    const at = Date.parse("2026-11-04T10:50:00-03:00");
    state.ntfySched = { "t:a1:30": { seq: "aulax", at, topic, server: "https://ntfy.sh" } };
    window.__notifs.length = 0; checkReminders();
    return window.__notifs.slice();
  }, TOPIC);
  expect(r.some(x => x.includes("Avisada por ntfy"))).toBe(false);
  expect(r).toContain("Solo local · en 30 min");
  // lo que ya sonó sigue en el registro (la pasada de ntfy no lo cancela ni lo borra enseguida)
  await page.evaluate(() => ntfyPlan());
  expect(await page.evaluate(() => Object.keys(state.ntfySched))).toContain("t:a1:30");
  expect(errors).toEqual([]);
});

test("con ntfy apagado suena todo con la app abierta (como antes)", async ({ page }) => {
  const errors = await openApp(page);
  await seed(page);
  const r = await page.evaluate(() => { window.__notifs.length = 0; checkReminders(); return window.__notifs.slice(); });
  expect(r).toEqual(expect.arrayContaining(["Avisada por ntfy · en 30 min", "Solo local · en 30 min"]));
  expect(errors).toEqual([]);
});

test("mirando un año viejo, los avisos del año actual suenan igual y ntfy no los cancela", async ({ page }) => {
  const errors = await openApp(page);
  await seed(page);
  const r = await page.evaluate(topic => {
    state.settings.ntfy = Object.assign(defaultNtfy(), { on: true, topic });
    state.tasks.push({ id: "a3", title: "Más tarde", date: "2026-11-04", time: "20:00", reminders: [{ amount: 1, unit: "h" }], status: "pend", estMin: 30 });
    state.years.push({ id: "yviejo", name: "2025", start: "2025-03-01", end: "2025-12-31" });
    return ntfyPlan().then(() => {
      setActiveYear("yviejo");
      const hidden = !state.tasks.some(t => t.id === "a3");
      window.__notifs.length = 0; checkReminders();
      return ntfyPlan().then(() => ({ hidden, notifs: window.__notifs.slice(), sched: Object.keys(state.ntfySched) }));
    });
  }, TOPIC);
  expect(r.hidden).toBe(true);
  // a1 y a2 son del año actual (no están en state.tasks con el año viejo a la vista) y suenan igual
  expect(r.notifs).toEqual(expect.arrayContaining(["Avisada por ntfy · en 30 min", "Solo local · en 30 min"]));
  expect(r.sched).toContain("t:a3:60");
  expect(errors).toEqual([]);
});
