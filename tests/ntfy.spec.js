// E1b1 · Avisos con la app cerrada vía ntfy: modelo (esquema 7) y Configuración.
// Nunca se habla con ntfy.sh de verdad: todo pasa por page.route.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, fixture, seedState, readBackups, storedState, expectNothingLost } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await setClock(page, "2026-11-04T11:00:00-03:00");
  // red de seguridad: si algo intenta salir a ntfy.sh real, el test lo ve
  await page.route("https://ntfy.sh/**", r => r.fulfill({ status: 599, body: "no real ntfy in tests" }));
});

test("migración a ntfy: el estado de Bauti (esquema 6) sobrevive entero, con copia previa e idempotente", async ({ page }) => {
  const old = fixture("estado-v2.6.json");
  old.meta.schema = 6;
  await seedState(page, old);
  const errors = await openApp(page);
  const r = await page.evaluate(() => ({ schema: state.meta.schema, n: state.settings.ntfy }));
  expect(r.schema).toBe(7);
  expect(r.n).toEqual({ on: false, server: "https://ntfy.sh", topic: "", generic: false });
  for (const c of ["tasks", "evals", "subjects", "projects", "notes", "habits", "sessions"]) {
    expect(await page.evaluate(c => state[c], c)).toEqual(old[c]);
  }
  const st = await storedState(page);
  expectNothingLost(old, st, ["meta.lastSave", "meta.lastBackup", "meta.schema", "settings.ntfy", "settings.reminderDefaults"]);
  const pre = (await readBackups(page)).filter(b => String(b.key).startsWith("premig-v6"));
  expect(pre).toHaveLength(1);
  // idempotente y respeta lo que ya estaba (por ejemplo, llegado por la sync desde el otro dispositivo)
  const again = await page.evaluate(() => {
    const a = JSON.stringify(fullState()); state.meta.schema = 6; migrateState(state);
    const same = a === JSON.stringify(fullState());
    const s2 = { settings: { ntfy: { on: true, server: "https://ntfy.sh", topic: "aula-AAAAAAAAAAAAAAAAAAAAAA", generic: true, extra: 1 } } };
    MIGRATIONS.find(m => m.to === 7).run(s2);
    return { same, kept: s2.settings.ntfy };
  });
  expect(again.same).toBe(true);
  expect(again.kept).toEqual({ on: true, server: "https://ntfy.sh", topic: "aula-AAAAAAAAAAAAAAAAAAAAAA", generic: true, extra: 1 });
  expect(Object.keys(st.sync.stamps).filter(k => !k.startsWith("settings."))).toEqual([]);
  expect(errors).toEqual([]);
});

test("Configuración: empezar, copiar, prueba (mockeada), mensaje genérico y desconectar", async ({ page }) => {
  const sent = [];
  const errors = await openApp(page);
  await page.route("https://ntfy.sh/**", async route => {
    const rq = route.request();
    const u = new URL(rq.url()); sent.push({ url: u.origin + u.pathname, method: rq.method(), body: rq.postData(), title: u.searchParams.get("title") });
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"id":"x"}', headers: { "access-control-allow-origin": "*" } });
  });
  await page.evaluate(() => go("config"));
  const card = page.locator(".ntfycard");
  await expect(card).toContainText("Avisos con la app cerrada");
  await card.getByRole("button", { name: "Empezar" }).click();
  const topic = await page.evaluate(() => state.settings.ntfy.topic);
  expect(topic).toMatch(/^aula-[A-Za-z0-9_-]{22}$/);
  await expect(page.locator("#ntfyTopic")).toHaveText(topic);
  await expect(card).not.toContainText("activo");
  // dos temas nuevos nunca son iguales
  expect(await page.evaluate(() => ntfyNewTopic() !== ntfyNewTopic())).toBe(true);
  await card.getByRole("button", { name: "Mandar notificación de prueba" }).click();
  await expect(page.locator("#toast")).toContainText("Notificación de prueba enviada");
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ url: "https://ntfy.sh/" + topic, method: "POST", title: "Aula" });
  await expect(page.locator(".ntfycard .pill", { hasText: "activo" })).toBeVisible();
  expect(await page.evaluate(() => state.settings.ntfy.on)).toBe(true);
  await page.locator(".ntfygen input").check();
  expect(await page.evaluate(() => state.settings.ntfy.generic)).toBe(true);
  await page.locator(".ntfycard").getByRole("button", { name: "Desconectar" }).click();
  await page.locator("#confirmOkBtn").click();
  expect(await page.evaluate(() => ({ on: state.settings.ntfy.on, topic: state.settings.ntfy.topic }))).toEqual({ on: false, topic: "" });
  await expect(page.locator(".ntfycard").getByRole("button", { name: "Empezar" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("sin red la prueba avisa y no marca como activo; ntfySend programa con «at» y respeta acentos", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { state.settings.ntfy = Object.assign(defaultNtfy(), { topic: "aula-BBBBBBBBBBBBBBBBBBBBBB" }); go("config"); });
  await page.route("https://ntfy.sh/**", r => r.abort());
  await page.locator(".ntfycard").getByRole("button", { name: "Mandar notificación de prueba" }).click();
  await expect(page.locator("#toast")).toContainText("No se pudo mandar");
  expect(await page.evaluate(() => state.settings.ntfy.on)).toBe(false);
  let q = null;
  await page.route("https://ntfy.sh/**", async r => { q = new URL(r.request().url()).searchParams; await r.fulfill({ status: 200, body: "{}", headers: { "access-control-allow-origin": "*" } }); });
  const at = Date.parse("2026-11-05T09:00:00-03:00");
  expect(await page.evaluate(at => ntfySend("Parcial 😀 de Álgebra", "mañana", { at }), at)).toBe(true);
  expect(q.get("at")).toBe(String(at / 1000));
  expect(q.get("title")).toBe("Parcial 😀 de Álgebra"); // en la URL viaja en UTF-8, entero
  // errores de red esperados (abort) no cuentan; de la app no tiene que haber ninguno
  expect(errors.filter(e => !/Failed to load resource|ERR_FAILED/.test(e))).toEqual([]);
});
