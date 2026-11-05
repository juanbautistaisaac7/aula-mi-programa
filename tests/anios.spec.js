// G1 · Años de cursado: un espacio nuevo por año, sin perder nada del anterior.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, reload, fixture, seedState, readBackups, storedState, expectNothingLost, createQuickTask } = require("./helpers");

const VOLATILES = ["meta.lastSave", "meta.lastBackup", "meta.schema"];

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

async function openFixture(page, schema) {
  const old = fixture("estado-v2.6.json");
  old.meta.schema = schema; // como lo tiene hoy el celu de Bauti (Aula 2.33 = esquema 4)
  await seedState(page, old);
  const errors = await openApp(page);
  return { old, errors };
}

/** Crea un año con el asistente real (Configuración → Nuevo año…). */
async function newYearUI(page, opts = {}) {
  await page.evaluate(() => go("config"));
  await page.getByRole("button", { name: "Nuevo año…" }).click();
  await expect(page.locator("#ny_name")).toBeVisible();
  if (opts.name) await page.fill("#ny_name", opts.name);
  if (opts.subjects) {
    await page.locator(".nysubs summary").click();
    for (const n of opts.subjects) await page.locator(".nysublist label", { hasText: n }).locator("input").check();
  }
  if (opts.habits) await page.locator("#ny_habits").check();
  await expect(page.locator("#ny_prev")).toContainText("Vas a crear");
  await page.locator("#ny_ok").click();
  await expect(page.locator("#modalbg")).not.toHaveClass(/open/);
}

test("migración: el estado de Bauti pasa al primer año sin cambiar ni una tarea, con copia previa e idempotente", async ({ page }) => {
  const { old, errors } = await openFixture(page, 4);
  const r = await page.evaluate(() => ({ schema: state.meta.schema, years: state.years, active: activeYearId() }));
  expect(r.schema).toBe(5);
  expect(r.years).toEqual([{ id: "y0", name: "3.º año · 2026", start: "2026-03-01", end: "2027-02-28" }]);
  expect(r.active).toBe("y0");
  // cada elemento quedó idéntico (no se agregó yearId a nada)
  for (const c of ["tasks", "evals", "subjects", "projects", "notes", "habits", "sessions"]) {
    expect(await page.evaluate(c => state[c], c)).toEqual(old[c]);
  }
  const st = await storedState(page);
  expectNothingLost(old, st, VOLATILES);
  expect(st.tasks).toEqual(old.tasks);
  const pre = (await readBackups(page)).filter(b => String(b.key).startsWith("premig-v4"));
  expect(pre).toHaveLength(1);
  expect(JSON.parse(pre[0].data).tasks).toEqual(old.tasks);
  // idempotente
  const again = await page.evaluate(() => { const a = JSON.stringify(fullState()); state.meta.schema = 4; migrateState(state); return a === JSON.stringify(fullState()); });
  expect(again).toBe(true);
  // la migración no marca nada como "cambiado" para la sincronización
  expect(Object.keys(st.sync.stamps).filter(k => !k.startsWith("settings."))).toEqual([]);
  expect(errors).toEqual([]);
});

test("crear 4.º año limpio, ver solo lo suyo, volver al viejo intacto y recargar mantiene el año", async ({ page }) => {
  const { old, errors } = await openFixture(page, 4);
  await newYearUI(page);
  // el nombre se propone solo a partir del anterior
  const y = await page.evaluate(() => activeYear());
  expect(y.name).toBe("4.º año · 2027");
  expect([y.start, y.end]).toEqual(["2027-03-01", "2028-02-29"]);
  // espacio limpio: nada del 3.º año a la vista
  expect(await page.evaluate(() => [state.tasks.length, state.subjects.length, state.evals.length, state.notes.length])).toEqual([0, 0, 0, 0]);
  await page.evaluate(() => go("today"));
  await expect(page.locator("#view")).not.toContainText("Ejercicios guía 5");
  await expect(page.locator("#sidebar .yearsw")).toContainText("4.º año · 2027");
  await expect(page.locator(".yearbanner")).toHaveCount(0);
  // lo nuevo queda en el año nuevo
  await createQuickTask(page, "Inscribirme a 4.º", { date: "2026-11-04" });
  let st = await storedState(page);
  expectNothingLost(old, st, VOLATILES); // lo del 3.º sigue guardado, entero
  const nt = st.tasks.find(t => t.title === "Inscribirme a 4.º");
  expect(nt.yearId).toBe(y.id);
  expect(st.tasks.filter(t => !t.yearId).length).toBe(old.tasks.length);
  // volver al 3.º desde el selector del menú
  if (page.viewportSize().width < 980) await page.locator("#btnMenu").click();
  await page.locator("#sidebar .yearsw").click();
  await page.locator(".ypick", { hasText: "3.º año · 2026" }).click();
  await page.evaluate(() => go("today"));
  await expect(page.locator("#view")).toContainText("Ejercicios guía 5");
  await expect(page.locator("#view")).not.toContainText("Inscribirme a 4.º");
  await expect(page.locator(".yearbanner")).toContainText("Estás viendo 3.º año · 2026");
  expect(await page.evaluate(() => state.tasks)).toEqual(old.tasks);
  // recargar mantiene el año elegido (en este dispositivo)
  await reload(page);
  expect(await page.evaluate(() => activeYearId())).toBe("y0");
  await expect(page.locator(".yearbanner")).toBeVisible();
  // volver al actual desde el aviso
  await page.locator(".yearbanner button").click();
  expect(await page.evaluate(() => [activeYearId(), state.meta.activeYear, state.tasks.map(t => t.title)])).toEqual([y.id, null, ["Inscribirme a 4.º"]]);
  st = await storedState(page);
  expectNothingLost(old, st, VOLATILES);
  expect(errors).toEqual([]);
});

test("traer materias y hábitos: se copian al año nuevo y el viejo no cambia; deshacer lo saca", async ({ page }) => {
  const { old, errors } = await openFixture(page, 4);
  await newYearUI(page, { name: "4.º año", subjects: ["Economía", "Bases de Datos"], habits: true });
  const r = await page.evaluate(() => ({ subs: state.subjects.map(s => s.name).sort(), habits: state.habits.map(h => [h.name, Object.keys(h.checks || {}).length]), ids: state.subjects.map(s => s.id) }));
  expect(r.subs).toEqual(["Bases de Datos", "Economía"]);
  expect(r.habits.length).toBe(old.habits.filter(h => !h.archived).length);
  expect(r.habits.every(h => h[1] === 0)).toBe(true); // sin historial
  expect(r.ids.some(id => old.subjects.some(s => s.id === id))).toBe(false); // ids nuevos
  const st = await storedState(page);
  expectNothingLost(old, st, VOLATILES);
  // un parcial nuevo en el año nuevo solo ofrece materias del año nuevo
  const opts = await page.evaluate(() => state.subjects.map(s => s.yearId));
  expect(new Set(opts).size).toBe(1);
  // deshacer (el toast) saca el año y las copias
  await page.locator("#toast button, .toast button").first().click();
  const u = await page.evaluate(() => ({ years: state.years.length, active: activeYearId(), n: state.subjects.length }));
  expect(u).toEqual({ years: 1, active: "y0", n: old.subjects.length });
  expectNothingLost(old, await storedState(page), VOLATILES);
  expect((await storedState(page)).subjects.length).toBe(old.subjects.length);
  expect(errors).toEqual([]);
});

test("motor: cambiar de año no deja lápidas ni cambia el orden; sincronización ve todos los años", async ({ page }) => {
  const { old, errors } = await openFixture(page, 4);
  const r = await page.evaluate(async () => {
    // el guardado del arranque puede estar en curso: persist() lo encolaría y volvería enseguida
    const persist = async () => { while (saving) await new Promise(r => setTimeout(r, 10)); await window.persist(); };
    const order0 = JSON.stringify(fullState().tasks.map(t => t.id));
    const id = createYear({ name: "4.º año · 2027", start: "2027-03-01", end: "2028-02-29", subjects: [], habits: false, notes: false });
    quickAddTask({ title: "Nueva del 4", date: todayISO(), estMin: 30 });
    await persist();
    setActiveYear("y0"); await persist();
    // editar una vieja mientras se ve el 3.º
    state.tasks[3].title = "editada en 3.º"; await persist();
    setActiveYear(id); await persist();
    const f = fullState();
    return {
      tombs: Object.keys(state.sync.tombs), stamped: Object.keys(state.sync.stamps).filter(k => k.startsWith("tasks:")).length,
      order: JSON.stringify(f.tasks.filter(t => !t.yearId).map(t => t.id)) === order0, total: f.tasks.length,
      local: syncLocal().data.tasks.length, years: syncLocal().data.years.length, visible: state.tasks.map(t => t.title)
    };
  });
  expect(r.tombs).toEqual([]);
  expect(r.stamped).toBe(2); // la nueva y la editada, nada más
  expect(r.order).toBe(true);
  expect(r.total).toBe(old.tasks.length + 1);
  expect(r.local).toBe(old.tasks.length + 1);
  expect(r.years).toBe(2);
  expect(r.visible).toEqual(["Nueva del 4"]);
  // fusionar datos remotos (otro dispositivo) con el año viejo a la vista no mezcla años
  const m = await page.evaluate(() => {
    setActiveYear("y0");
    const loc = syncLocal();
    const remote = JSON.parse(JSON.stringify(loc));
    remote.data.tasks.push({ id: "remota-4", title: "Del celu en 4.º", yearId: state.years[1].id, status: "pend", date: todayISO() });
    remote.stamps["tasks:remota-4"] = Date.now() + 1000;
    syncApply(syncMerge(syncLocal(), remote));
    return { visible: state.tasks.some(t => t.id === "remota-4"), inFull: fullState().tasks.some(t => t.id === "remota-4"), active: activeYearId() };
  });
  expect(m).toEqual({ visible: false, inFull: true, active: "y0" });
  // dos materias con el mismo nombre en años distintos no se fusionan en la primera sincronización
  const d = await page.evaluate(() => {
    const data = { subjects: [{ id: "a", name: "Economía" }, { id: "b", name: "Economía", yearId: "y-x" }], tasks: [] };
    return syncDedupeSubjects({ data, stamps: {}, tombs: {} }, 1).data.subjects.length;
  });
  expect(d).toBe(2);
  expect(errors).toEqual([]);
});

test("exportar y copias de seguridad incluyen todos los años", async ({ page }) => {
  const { old, errors } = await openFixture(page, 4);
  await page.evaluate(() => createYear({ name: "4.º año · 2027", start: "2027-03-01", end: "2028-02-29", subjects: [], habits: false, notes: false }));
  await page.evaluate(() => manualBackup());
  await page.waitForTimeout(200);
  const man = (await readBackups(page)).filter(b => String(b.key).startsWith("manual-"));
  expect(man).toHaveLength(1);
  const data = JSON.parse(man[0].data);
  expect(data.tasks.length).toBe(old.tasks.length);
  expect(data.years.length).toBe(2);
  // restaurar esa copia deja los dos años y el que estabas viendo
  await page.evaluate(k => { const s = JSON.parse(k); setWholeState(normalizeState(s)); render(); }, man[0].data);
  expect(await page.evaluate(() => [state.years.length, state.tasks.length, fullState().tasks.length])).toEqual([2, 0, old.tasks.length]);
  expect(errors).toEqual([]);
});

test("asistente: valida nombre repetido y fechas al revés antes de crear", async ({ page }) => {
  const { errors } = await openFixture(page, 4);
  await page.evaluate(() => go("config"));
  await page.getByRole("button", { name: "Nuevo año…" }).click();
  await page.fill("#ny_name", "3.º año · 2026");
  await expect(page.locator("#ny_prev")).toHaveText("Ya tenés un año con ese nombre.");
  await expect(page.locator("#ny_ok")).toBeDisabled();
  await page.fill("#ny_name", "4.º año");
  await page.fill("#ny_end", "2026-01-01");
  await page.locator("#ny_end").dispatchEvent("change");
  await expect(page.locator("#ny_prev")).toHaveText("La fecha de fin es antes que la de inicio.");
  await expect(page.locator("#ny_ok")).toBeDisabled();
  expect(await page.evaluate(() => state.years.length)).toBe(1);
  expect(errors).toEqual([]);
});

test("red de seguridad: algo de un año que no está en la lista no queda invisible ni te cambia de año", async ({ page }) => {
  const old = fixture("estado-v2.6.json");
  old.meta.schema = 5;
  old.years = [{ id: "y0", name: "3.º año · 2026", start: "2026-03-01", end: "2027-02-28" }];
  old.tasks.push({ id: "huerfana", title: "De un año perdido", yearId: "y-perdido", status: "pend", date: "2026-11-04" });
  await seedState(page, old);
  const errors = await openApp(page);
  const r = await page.evaluate(() => ({ active: activeYearId(), years: state.years.map(y => y.id), inFull: fullState().tasks.some(t => t.id === "huerfana") }));
  expect(r).toEqual({ active: "y0", years: ["y0", "y-perdido"], inFull: true });
  expect(errors).toEqual([]);
});
