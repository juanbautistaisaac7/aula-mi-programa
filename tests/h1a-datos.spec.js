// H1a · Datos confiables: tiempo con un toque al completar y registro de cuándo se movió cada tarea.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, reload, seedState, fixture } = require("./helpers");

// Jueves 5 de noviembre de 2026, 18:00 (hora ARG).
test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-05T18:00:00-03:00"); });

const totalMin = page => page.evaluate(() => state.sessions.reduce((a, s) => a + s.min, 0));

test("completar 10 tareas con un toque cada una: todas suman su estimado, sin ventanas que bloqueen", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { for (let i = 1; i <= 10; i++) quickAddTask({ title: "Tarea " + i, date: todayISO(), estMin: 30 }); go("today"); });
  for (let i = 1; i <= 10; i++) {
    const row = page.locator("#view .task", { hasText: "Tarea " + i + "" }).filter({ hasNotText: "Tarea " + i + "0" }).first();
    await row.locator(".cb").click();
    await expect(page.locator("#confirmbg")).not.toHaveClass(/open/); // nada que tapar la lista
  }
  expect(await totalMin(page)).toBe(300);
  const bar = page.locator("#donebar");
  await expect(bar).toHaveClass(/open/);
  await expect(bar).toContainText("Tarea 10");
  // corregir la última con un chip: reemplaza, no suma doble
  await bar.getByRole("button", { name: "+30 m" }).click();
  expect(await totalMin(page)).toBe(330);
  await expect(page.evaluate(() => state.tasks.find(t => t.title === "Tarea 10").realMin)).resolves.toBe(60);
  // la barra se va sola
  await page.clock.runFor(3000);
  await expect(bar).not.toHaveClass(/open/);
  expect(errors).toEqual([]);
});

test("sin estimado: chips de tiempo fijo; 'Otro' permite escribir; desmarcar devuelve todo", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => { quickAddTask({ title: "Sin estimar", date: todayISO() }); go("today"); });
  await page.locator("#view .task", { hasText: "Sin estimar" }).locator(".cb").click();
  const bar = page.locator("#donebar");
  await expect(bar).toContainText("¿Cuánto te llevó?");
  expect(await totalMin(page)).toBe(0); // sin estimado no se inventa nada
  await bar.getByRole("button", { name: "1 h" }).click();
  expect(await totalMin(page)).toBe(60);
  await bar.getByRole("button", { name: "Otro" }).click();
  await page.fill("#db_min", "95");
  await page.press("#db_min", "Enter");
  expect(await totalMin(page)).toBe(95);
  // desmarcar: se va el tiempo y la barra
  await page.locator("#view .task", { hasText: "Sin estimar" }).locator(".cb").click();
  expect(await totalMin(page)).toBe(0);
  await expect(bar).not.toHaveClass(/open/);
  expect(errors).toEqual([]);
});

test("respeta lo cronometrado a mano y las que se repiten cuentan por día", async ({ page }) => {
  const errors = await openApp(page);
  const ids = await page.evaluate(() => {
    const a = quickAddTask({ title: "Con manual", date: todayISO(), estMin: 60 });
    addSession(40, { taskId: a.id, manual: true });
    const r = quickAddTask({ title: "Diaria", estMin: 20, recur: { type: "daily" } });
    return { a: a.id, r: r.id };
  });
  await page.evaluate(id => toggleTask(id), ids.a);
  expect(await totalMin(page)).toBe(60); // 40 a mano + 20 de diferencia
  await page.evaluate(id => { toggleTask(id, "2026-11-04"); toggleTask(id, "2026-11-05"); }, ids.r);
  expect(await totalMin(page)).toBe(100);
  await page.evaluate(id => toggleTask(id, "2026-11-04"), ids.r); // desmarcar un día no toca el otro
  expect(await totalMin(page)).toBe(80);
  expect(errors).toEqual([]);
});

test("Configuración: 'no preguntar' usa el estimado sin mostrar la barra", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => go("config"));
  const cb = page.locator("#cfg_doneask");
  await expect(cb).toBeChecked();
  await cb.uncheck();
  await page.evaluate(() => { quickAddTask({ title: "Leer", date: todayISO(), estMin: 45 }); go("today"); });
  await page.locator("#view .task", { hasText: "Leer" }).locator(".cb").click();
  await expect(page.locator("#donebar")).not.toHaveClass(/open/);
  expect(await totalMin(page)).toBe(45);
  await reload(page);
  expect(await page.evaluate(() => state.settings.doneAsk)).toBe(false);
  expect(errors).toEqual([]);
});

test("mover una tarea 2 veces queda registrado (con su día original); deshacer no cuenta como postergar", async ({ page }) => {
  const errors = await openApp(page);
  const id = await page.evaluate(() => { const t = quickAddTask({ title: "Hacer TP", date: todayISO() }); go("today"); return t.id; });
  await page.evaluate(id => moveTaskTo(id, "2026-11-06"), id);
  await page.clock.runFor(60000);
  await page.evaluate(id => openMoveSheet(id), id);
  await page.locator("#sheet .sheetopt", { hasText: "Próximo lunes" }).click();
  let t = await page.evaluate(id => taskById(id), id);
  expect(t.date).toBe("2026-11-09");
  expect(t.origDate).toBe("2026-11-05");
  expect(t.moves.map(m => [m.from, m.to])).toEqual([["2026-11-05", "2026-11-06"], ["2026-11-06", "2026-11-09"]]);
  expect(t.moves[1].at).toBeGreaterThan(t.moves[0].at);
  // Deshacer el último: vuelve al viernes y ese movimiento se borra
  await page.locator("#toast button", { hasText: "Deshacer" }).click();
  t = await page.evaluate(id => taskById(id), id);
  expect(t.date).toBe("2026-11-06");
  expect(t.moves).toHaveLength(1);
  // también desde el editor (otro camino que cambia el día)
  await page.evaluate(id => { taskById(id).date = "2026-11-12"; change(); }, id);
  // asignarle día a una sin día no es mover
  const id2 = await page.evaluate(() => { const t = quickAddTask({ title: "Sin día" }); return t.id; });
  await page.evaluate(id => { taskById(id).date = "2026-11-07"; change(); }, id2);
  await page.evaluate(() => persist());
  await reload(page);
  t = await page.evaluate(id => taskById(id), id);
  expect(t.moves.map(m => m.to)).toEqual(["2026-11-06", "2026-11-12"]);
  expect(await page.evaluate(id => taskById(id).moves, id2)).toBeUndefined();
  expect(errors).toEqual([]);
});

test("datos reales viejos: cargan igual, mover registra y no toca nada más; lo que llega por la sync no se duplica", async ({ page }) => {
  const old = fixture("estado-v2.6.json");
  await seedState(page, old);
  const errors = await openApp(page);
  const before = await page.evaluate(() => JSON.parse(JSON.stringify(fullState().tasks)));
  expect(before.every(t => t.moves === undefined && t.origDate === undefined)).toBe(true);
  await page.evaluate(() => moveTaskTo("t-1", "2026-11-08"));
  const after = await page.evaluate(() => fullState().tasks);
  const strip = ts => ts.map(t => { const c = Object.assign({}, t); delete c.moves; delete c.origDate; delete c.date; delete c.ord; delete c.status; return c; });
  expect(strip(after)).toEqual(strip(before));
  expect(after.filter(t => t.moves).map(t => t.id)).toEqual(["t-1"]);
  expect(after.find(t => t.id === "t-1").origDate).toBe(before.find(t => t.id === "t-1").date);
  // Otro dispositivo movió t-2 (y lo anotó él): al aplicarlo acá no se agrega nada
  const r = await page.evaluate(() => {
    const L = syncLocal();
    const data = JSON.parse(JSON.stringify(L.data));
    const t2 = data.tasks.find(t => t.id === "t-2");
    t2.origDate = t2.date; t2.moves = [{ from: t2.date, to: "2026-11-10", at: 1 }]; t2.date = "2026-11-10";
    const t3 = data.tasks.find(t => t.id === "t-3"); t3.date = "2026-11-11"; // dispositivo viejo: movió sin anotar
    const stamps = Object.assign({}, L.stamps, { "tasks:t-2": Date.now() + 5, "tasks:t-3": Date.now() + 5 });
    syncApply({ data, stamps, tombs: L.tombs });
    change();
    return { t2: taskById("t-2"), t3: taskById("t-3") };
  });
  expect(r.t2.moves).toHaveLength(1);
  expect(r.t2.date).toBe("2026-11-10");
  expect(r.t3.moves).toBeUndefined();
  expect(errors).toEqual([]);
});
