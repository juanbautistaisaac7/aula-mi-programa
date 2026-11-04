// A1 · Red de seguridad para los datos.
// Carga un estado "viejo" (forma de Aula 2.6, como el que Bauti tiene en el celu)
// y verifica que sobrevive entero a la migración, que antes se guarda una copia
// y que la migración es idempotente.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, reload, fixture, seedState, readBackups, storedState, expectNothingLost } = require("./helpers");

// Campos que la app cambia sola al abrir, con o sin migración.
const VOLATILES = ["meta.lastSave", "meta.lastBackup"];

test.beforeEach(async ({ page }) => {
  await setClock(page, "2026-11-04T11:00:00-03:00");
});

test("el estado de la 2.6 carga, se navega entero sin errores y no pierde nada", async ({ page }) => {
  const old = fixture("estado-v2.6.json");
  await seedState(page, old);
  const errors = await openApp(page);

  // Se cargó lo que había, no un estado nuevo
  const counts = await page.evaluate(() => ({ tasks: state.tasks.length, evals: state.evals.length, subjects: state.subjects.length, sessions: state.sessions.length, schema: state.meta.schema }));
  expect(counts).toEqual({ tasks: old.tasks.length, evals: old.evals.length, subjects: old.subjects.length, sessions: old.sessions.length, schema: await page.evaluate(() => SCHEMA_VERSION) });

  // Todas las vistas (y los detalles) renderizan con datos reales
  const views = await page.evaluate(() => VIEWS.map(v => v[0]).concat(["list"]));
  for (const v of views) {
    await page.evaluate(v => go(v), v);
    await page.waitForTimeout(30);
  }
  for (const [view, id] of [["subject", "s-pe"], ["eval", "e-pe2"], ["project", "p-tp"]]) {
    await page.evaluate(([v, i]) => go(v, i), [view, id]);
    await page.waitForTimeout(30);
  }
  await page.evaluate(() => go("today"));
  await expect(page.locator("#view")).toContainText("Ejercicios guía 5");

  expectNothingLost(old, await page.evaluate(() => state), VOLATILES);
  expectNothingLost(old, await storedState(page), VOLATILES);

  await reload(page);
  expectNothingLost(old, await page.evaluate(() => state), VOLATILES);
  expect(errors).toEqual([]);
});

test("antes de migrar se guarda una copia del estado viejo (con fecha y versión)", async ({ page }) => {
  const old = fixture("estado-v2.6.json");
  await seedState(page, old);
  const errors = await openApp(page);

  const pre = (await readBackups(page)).filter(b => String(b.key).startsWith("premig-"));
  expect(pre).toHaveLength(1);
  expect(pre[0].schema).toBe(1);
  expect(pre[0].version).toBe(await page.evaluate(() => APP_VERSION));
  expect(pre[0].ts).toBeGreaterThan(0);
  expect(pre[0].label).toContain("Antes de actualizar");
  // La copia es el JSON original, sin tocar
  expect(JSON.parse(pre[0].data)).toEqual(old);

  // Al volver a abrir no se migra de nuevo ni se duplica la copia
  await reload(page);
  expect((await readBackups(page)).filter(b => String(b.key).startsWith("premig-"))).toHaveLength(1);

  // Se ve en "Copias de seguridad" y se puede restaurar
  await page.evaluate(() => go("backups"));
  await expect(page.locator("#bklist")).toContainText("Antes de actualizar");
  expect(errors).toEqual([]);
});

test("la migración es idempotente: correrla dos veces da lo mismo", async ({ page }) => {
  const old = fixture("estado-v2.6.json");
  const errors = await openApp(page);
  const r = await page.evaluate(json => {
    const a = normalizeState(JSON.parse(json));
    const first = migrateState(a);
    const once = JSON.stringify(a);
    const second = migrateState(a);
    const b = normalizeState(JSON.parse(once));
    migrateState(b);
    return { first, second, same: once === JSON.stringify(a), sameAfterReload: once === JSON.stringify(b) };
  }, JSON.stringify(old));
  expect(r.first).toEqual({ from: 1, to: await page.evaluate(() => SCHEMA_VERSION) });
  expect(r.second.from).toBe(r.second.to);
  expect(r.same).toBe(true);
  expect(r.sameAfterReload).toBe(true);
  expect(errors).toEqual([]);
});

test("una instalación nueva arranca con el esquema al día y sin copia de migración", async ({ page }) => {
  const errors = await openApp(page);
  expect(await page.evaluate(() => state.meta.schema === SCHEMA_VERSION)).toBe(true);
  expect((await readBackups(page)).filter(b => String(b.key).startsWith("premig-"))).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("restaurar una copia vieja la migra (no queda con esquema viejo)", async ({ page }) => {
  const old = fixture("estado-v2.6.json");
  const errors = await openApp(page);
  await page.evaluate(async json => { await idbPut("backups", "manual-1", { ts: Date.now(), label: "vieja", data: json }); }, JSON.stringify(old));
  await page.evaluate(() => restoreBackup("manual-1"));
  await page.locator("#confirmbox .btn.danger, #confirmbox .btn.primary").last().click();
  await expect.poll(() => page.evaluate(() => state.tasks.length)).toBe(old.tasks.length);
  expect(await page.evaluate(() => state.meta.schema === SCHEMA_VERSION)).toBe(true);
  expectNothingLost(old, await page.evaluate(() => state), VOLATILES);
  expect(errors).toEqual([]);
});
