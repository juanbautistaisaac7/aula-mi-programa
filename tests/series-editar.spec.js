// C2a · Editar una serie: lista de ocurrencias, selección y acciones masivas
// con vista previa antes de aplicar y deshacer después.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, reload } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

/** Crea con el control Repetir real: 5 tareas de 60 min cada 3 días desde el mar 10 nov. */
async function crearSerieCada3(page, title = "Practicar parciales") {
  await page.evaluate(() => openQuickTask("2026-11-10"));
  await page.fill("#qt_title", title);
  await page.fill("#qt_min", "60");
  await page.selectOption("#qt_rep", "interval");
  await page.fill("#qt_repn", "3");
  await page.selectOption("#qt_repend", "count");
  await page.fill("#qt_repcount", "5");
  await page.click("#qt_save");
  await expect(page.locator("#modalbg")).not.toHaveClass(/open/);
}
const minutos = (page, title = "Practicar parciales") => page.evaluate(t =>
  state.tasks.filter(x => x.title === t).sort((a, b) => a.date.localeCompare(b.date)).map(x => x.estMin), title);
const fechas = (page, title = "Practicar parciales") => page.evaluate(t =>
  state.tasks.filter(x => x.title === t).map(x => x.date).sort(), title);

async function abrirDesdeSeries(page) {
  await page.evaluate(() => go("series"));
  await page.locator(".serrow").first().click(); // (C3) la vista Series es una lista: tocar la fila abre el editor
  await expect(page.locator("#sr_occ .occ")).toHaveCount(5);
}
const fila = (page, i) => page.locator("#sr_occ .occ").nth(i);

test("el caso de Bauti: 5 cada 3 días → +1 h 30 a las 5 → +10 min a una sola", async ({ page }) => {
  const errors = await openApp(page);
  await crearSerieCada3(page);
  await abrirDesdeSeries(page);
  // Se ven todas las ocurrencias con su fecha y minutos
  await expect(fila(page, 0)).toContainText("mar 10 nov");
  await expect(fila(page, 4)).toContainText("dom 22 nov");
  await expect(fila(page, 2)).toContainText("1 h");
  // Por defecto quedan elegidas las pendientes (las 5)
  await expect(page.locator("#sr_count")).toHaveText("5 elegidas");
  // +1 h 30 a todas, con vista previa antes de aplicar
  await page.selectOption("#sr_act", "add");
  await page.fill("#sr_min", "90");
  await expect(page.locator("#sr_preview")).toContainText("Vas a sumar 1 h 30 m a 5 tareas");
  await expect(page.locator("#sr_preview")).toContainText("1 h → 2 h 30 m");
  await expect(page.locator("#sr_apply")).toHaveText("Sumar 1 h 30 m a 5 tareas");
  expect(await minutos(page)).toEqual([60, 60, 60, 60, 60]); // la vista previa no toca nada
  await page.click("#sr_apply");
  expect(await minutos(page)).toEqual([150, 150, 150, 150, 150]);
  // El editor sigue abierto y muestra los minutos nuevos
  await expect(fila(page, 0)).toContainText("2 h 30 m");
  // +10 min solo a la del jue 16 nov
  await page.getByRole("button", { name: "Ninguna" }).click();
  await expect(page.locator("#sr_preview")).toContainText("Elegí al menos una");
  await expect(page.locator("#sr_apply")).toBeDisabled();
  await fila(page, 2).click();
  await page.getByRole("button", { name: "10 m", exact: true }).click();
  await expect(page.locator("#sr_preview")).toContainText("Vas a sumar 10 m a 1 tarea");
  await page.click("#sr_apply");
  expect(await minutos(page)).toEqual([150, 150, 160, 150, 150]);
  await expect(fila(page, 2)).toContainText("2 h 40 m");
  // Sobrevive a recargar
  await page.waitForTimeout(700);
  await reload(page);
  expect(await minutos(page)).toEqual([150, 150, 160, 150, 150]);
  expect(errors).toEqual([]);
});

test("deshacer vuelve atrás un cambio masivo de tiempo", async ({ page }) => {
  const errors = await openApp(page);
  await crearSerieCada3(page);
  await abrirDesdeSeries(page);
  await page.selectOption("#sr_act", "set");
  await page.fill("#sr_min", "45");
  await expect(page.locator("#sr_preview")).toContainText("Vas a dejar 5 tareas en 45 m");
  await page.click("#sr_apply");
  expect(await minutos(page)).toEqual([45, 45, 45, 45, 45]);
  await page.locator("#toast button", { hasText: "Deshacer" }).click();
  expect(await minutos(page)).toEqual([60, 60, 60, 60, 60]);
  await expect(fila(page, 0)).toContainText("1 h");
  // restar no baja de 0
  await page.selectOption("#sr_act", "sub");
  await page.fill("#sr_min", "90");
  await page.click("#sr_apply");
  expect(await minutos(page)).toEqual([0, 0, 0, 0, 0]);
  expect(errors).toEqual([]);
});

test("mover ±N días, cambiar hora y borrar, cada uno con vista previa y deshacer", async ({ page }) => {
  const errors = await openApp(page);
  await crearSerieCada3(page);
  await abrirDesdeSeries(page);
  // Mover las dos últimas 2 días más tarde
  await page.getByRole("button", { name: "Ninguna" }).click();
  await fila(page, 3).click(); await fila(page, 4).click();
  await page.selectOption("#sr_act", "move");
  await page.fill("#sr_days", "2");
  await expect(page.locator("#sr_preview")).toContainText("Vas a mover 2 tareas 2 días más tarde");
  await expect(page.locator("#sr_preview")).toContainText("jue 19 nov → sáb 21 nov");
  await expect(page.locator("#sr_apply")).toHaveText("Mover 2 tareas");
  await page.click("#sr_apply");
  expect(await fechas(page)).toEqual(["2026-11-10", "2026-11-13", "2026-11-16", "2026-11-21", "2026-11-24"]);
  await page.locator("#toast button", { hasText: "Deshacer" }).click();
  expect(await fechas(page)).toEqual(["2026-11-10", "2026-11-13", "2026-11-16", "2026-11-19", "2026-11-22"]);
  // Con un número negativo, antes
  await page.getByRole("button", { name: "−1 d" }).click();
  await expect(page.locator("#sr_preview")).toContainText("1 día antes");
  // Cambiar la hora de todas
  await page.getByRole("button", { name: "Todas" }).click();
  await page.selectOption("#sr_act", "time");
  await page.fill("#sr_time", "18:30");
  await expect(page.locator("#sr_preview")).toContainText("Vas a poner 5 tareas a las 18:30");
  await page.click("#sr_apply");
  expect(await page.evaluate(() => state.tasks.filter(t => t.title === "Practicar parciales").map(t => t.time))).toEqual(Array(5).fill("18:30"));
  await expect(fila(page, 0)).toContainText("18:30");
  // Borrar la del medio: queda la serie de 4, deshacer la recupera en la misma serie
  await page.getByRole("button", { name: "Ninguna" }).click();
  await fila(page, 2).click();
  await page.selectOption("#sr_act", "del");
  await expect(page.locator("#sr_preview")).toContainText("Vas a borrar 1 tarea");
  await expect(page.locator("#sr_apply")).toHaveText("Borrar 1 tarea");
  await page.click("#sr_apply");
  await expect(page.locator("#sr_occ .occ")).toHaveCount(4);
  expect(await fechas(page)).toEqual(["2026-11-10", "2026-11-13", "2026-11-19", "2026-11-22"]);
  await page.locator("#toast button", { hasText: "Deshacer" }).click();
  await expect(page.locator("#sr_occ .occ")).toHaveCount(5);
  expect(await page.evaluate(() => new Set(state.tasks.filter(t => t.title === "Practicar parciales").map(t => t.seriesId)).size)).toBe(1);
  expect(errors).toEqual([]);
});

test("Todas incluye las hechas; Pendientes no", async ({ page }) => {
  const errors = await openApp(page);
  await crearSerieCada3(page);
  await page.evaluate(() => { const t = state.tasks.filter(x => x.title === "Practicar parciales").sort((a, b) => a.date.localeCompare(b.date))[0]; t.status = "done"; t.doneAt = t.date; change(); });
  await abrirDesdeSeries(page);
  await expect(fila(page, 0)).toContainText("hecha");
  await expect(page.locator("#sr_count")).toHaveText("4 elegidas");
  await page.getByRole("button", { name: "Todas" }).click();
  await expect(page.locator("#sr_count")).toHaveText("5 elegidas");
  await page.getByRole("button", { name: "Pendientes" }).click();
  await expect(page.locator("#sr_count")).toHaveText("4 elegidas");
  await page.fill("#sr_min", "30");
  await page.click("#sr_apply");
  expect(await minutos(page)).toEqual([60, 90, 90, 90, 90]);
  expect(errors).toEqual([]);
});

test("en el celu la lista se toca cómoda y nada se sale del ancho", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "solo mobile");
  const errors = await openApp(page);
  await crearSerieCada3(page);
  await abrirDesdeSeries(page);
  const h = await fila(page, 0).boundingBox();
  expect(h.height).toBeGreaterThanOrEqual(44);
  const over = await page.evaluate(() => { const b = byId("modalbox"); return b.scrollWidth - b.clientWidth; });
  expect(over).toBeLessThanOrEqual(0);
  // Tocar la fila (no solo el cuadradito) la elige
  await page.getByRole("button", { name: "Ninguna" }).click();
  await fila(page, 1).tap();
  await expect(page.locator("#sr_count")).toHaveText("1 elegida");
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- C2b
// (fill en inputs de fecha y hora ya dispara "change", como el selector del celu)
const abrirFila = (page, i) => fila(page, i).getByRole("button", { name: /Editar solo/ }).click();

test("editar una sola: +10 min, fecha y hora, sin tocar el resto; con deshacer", async ({ page }) => {
  const errors = await openApp(page);
  await crearSerieCada3(page);
  await abrirDesdeSeries(page);
  await abrirFila(page, 2);
  await expect(page.locator(".occedit")).toHaveCount(1);
  // abrir el editor de una fila no la elige ni la des-elige
  await expect(page.locator("#sr_count")).toHaveText("5 elegidas");
  await page.getByRole("button", { name: "Sumar 10 minutos" }).click();
  expect(await minutos(page)).toEqual([60, 60, 70, 60, 60]);
  await expect(fila(page, 2)).toContainText("1 h 10 m");
  await expect(page.locator(".occedit")).toHaveCount(1); // sigue abierta para seguir tocando
  await page.getByRole("button", { name: "Sumar 10 minutos" }).click();
  expect(await minutos(page)).toEqual([60, 60, 80, 60, 60]);
  await page.locator("#toast button", { hasText: "Deshacer" }).click();
  expect(await minutos(page)).toEqual([60, 60, 70, 60, 60]);
  await page.fill("#sr_onemin", "25"); await page.press("#sr_onemin", "Enter");
  await page.locator("#sr_onemin").blur();
  await expect.poll(() => minutos(page)).toEqual([60, 60, 25, 60, 60]);
  await page.fill("#sr_onetime", "09:15");
  expect(await page.evaluate(() => state.tasks.filter(t => t.title === "Practicar parciales" && t.time).map(t => t.date + " " + t.time))).toEqual(["2026-11-16 09:15"]);
  await page.fill("#sr_onedate", "2026-11-17");
  expect(await fechas(page)).toEqual(["2026-11-10", "2026-11-13", "2026-11-17", "2026-11-19", "2026-11-22"]);
  await page.locator("#toast button", { hasText: "Deshacer" }).click();
  expect(await fechas(page)).toEqual(["2026-11-10", "2026-11-13", "2026-11-16", "2026-11-19", "2026-11-22"]);
  expect(errors).toEqual([]);
});

test("quitar una ocurrencia puntual, con deshacer", async ({ page }) => {
  const errors = await openApp(page);
  await crearSerieCada3(page);
  await abrirDesdeSeries(page);
  await abrirFila(page, 1);
  await page.getByRole("button", { name: "Quitar de la serie" }).click();
  await expect(page.locator("#sr_occ .occ")).toHaveCount(4);
  expect(await fechas(page)).toEqual(["2026-11-10", "2026-11-16", "2026-11-19", "2026-11-22"]);
  await expect(page.locator("#sr_count")).toHaveText("4 elegidas");
  await page.locator("#toast button", { hasText: "Deshacer" }).click();
  await expect(page.locator("#sr_occ .occ")).toHaveCount(5);
  expect(await fechas(page)).toEqual(["2026-11-10", "2026-11-13", "2026-11-16", "2026-11-19", "2026-11-22"]);
  expect(errors).toEqual([]);
});

test("agregar siguiendo el patrón (cada 3 días), hasta una fecha y una fecha suelta", async ({ page }) => {
  const errors = await openApp(page);
  await crearSerieCada3(page);
  await abrirDesdeSeries(page);
  await page.locator(".sradd summary").click();
  await expect(page.locator("#sr_addmode option").first()).toHaveText("Más tareas, cada 3 días");
  await page.fill("#sr_addn", "2");
  await expect(page.locator("#sr_addpv")).toContainText("Vas a agregar 2 tareas de 1 h");
  await expect(page.locator("#sr_addpv")).toContainText("mié 25 nov");
  await expect(page.locator("#sr_addpv")).toContainText("sáb 28 nov");
  await page.locator("#sr_addbtn").click();
  await expect(page.locator("#sr_occ .occ")).toHaveCount(7);
  expect((await fechas(page)).slice(5)).toEqual(["2026-11-25", "2026-11-28"]);
  expect(await page.evaluate(() => new Set(state.tasks.filter(t => t.title === "Practicar parciales").map(t => t.seriesId)).size)).toBe(1);
  await page.locator("#toast button", { hasText: "Deshacer" }).click();
  await expect(page.locator("#sr_occ .occ")).toHaveCount(5);
  // Hasta una fecha
  await page.selectOption("#sr_addmode", "until");
  await page.fill("#sr_until", "2026-11-30");
  await expect(page.locator("#sr_addbtn")).toHaveText("Agregar 2 tareas");
  // Una fecha suelta, que no puede repetir un día que ya está
  await page.selectOption("#sr_addmode", "one");
  await page.fill("#sr_addone", "2026-11-13");
  await expect(page.locator("#sr_addpv")).toContainText("Ya hay una tarea de la serie el vie 13 nov");
  await expect(page.locator("#sr_addbtn")).toBeDisabled();
  await page.fill("#sr_addone", "2026-11-11");
  await page.locator("#sr_addbtn").click();
  expect(await fechas(page)).toEqual(["2026-11-10", "2026-11-11", "2026-11-13", "2026-11-16", "2026-11-19", "2026-11-22"]);
  await expect(page.locator("#sr_occ .occ").nth(1)).toContainText("mié 11 nov");
  expect(errors).toEqual([]);
});

test("el patrón se deduce bien de las fechas", async ({ page }) => {
  const errors = await openApp(page);
  const r = await page.evaluate(() => {
    const P = ds => { const p = seriesPattern(ds); let d = ds[ds.length - 1]; const nx = []; for (let i = 0; i < 3; i++) { d = patternNext(p, d); nx.push(d); } return p.label + " → " + nx.join(","); };
    return {
      diario: P(["2026-11-02", "2026-11-03", "2026-11-04"]),
      semanal: P(["2026-11-02", "2026-11-09"]),
      lmv: P(["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-09", "2026-11-11"]),
      mensual31: P(["2026-10-31", "2026-12-31"]),
      movidaAMano: P(["2026-11-01", "2026-11-04", "2026-11-07", "2026-11-11", "2026-11-13"])
    };
  });
  expect(r).toEqual({
    diario: "todos los días → 2026-11-05,2026-11-06,2026-11-07",
    semanal: "cada semana → 2026-11-16,2026-11-23,2026-11-30",
    lmv: "los lun, mié y vie → 2026-11-13,2026-11-16,2026-11-18",
    mensual31: "cada mes → 2027-01-31,2027-03-31,2027-05-31",
    movidaAMano: "cada 3 días → 2026-11-16,2026-11-19,2026-11-22"
  });
  expect(errors).toEqual([]);
});

test("en el celu: editar una sola con el dedo y los botones se tocan cómodos", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "solo mobile");
  const errors = await openApp(page);
  await crearSerieCada3(page);
  await abrirDesdeSeries(page);
  await fila(page, 0).getByRole("button", { name: /Editar solo/ }).tap();
  const b = await page.getByRole("button", { name: "Sumar 10 minutos" }).boundingBox();
  expect(b.height).toBeGreaterThanOrEqual(40);
  await page.getByRole("button", { name: "Sumar 10 minutos" }).tap();
  expect(await minutos(page)).toEqual([70, 60, 60, 60, 60]);
  const over = await page.evaluate(() => { const bx = byId("modalbox"); return bx.scrollWidth - bx.clientWidth; });
  expect(over).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
