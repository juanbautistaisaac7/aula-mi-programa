// C4 · Tiempos de una serie por tramos, selección rápida de rangos y
// minutos editables en el lugar. El caso de Bauti: serie diaria de hoy a 30
// días → 10 de 1 h, 2 de 1 h 30, el resto de 2 h y las últimas 3 de 3 h.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, reload } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

const ESPERADO = [...Array(10).fill(60), 90, 90, ...Array(16).fill(120), 180, 180, 180];
const minutos = (page, title) => page.evaluate(t =>
  state.tasks.filter(x => x.title === t).sort((a, b) => a.date.localeCompare(b.date)).map(x => x.estMin), title);

/** Serie diaria del mié 4 nov al vie 4 dic (31 tareas), todas de `min`. */
async function abrirCrearDiaria(page, title, min = 60) {
  await page.evaluate(() => openQuickTask());
  await page.fill("#qt_title", title);
  await page.fill("#qt_min", String(min));
  await page.selectOption("#qt_rep", "daily");
  await page.selectOption("#qt_repend", "until");
  await page.fill("#qt_repuntil", "2026-12-04");
  await page.dispatchEvent("#qt_repuntil", "change");
  await expect(page.locator("#qt_preview")).toContainText("Se van a crear 31 tareas");
}
const trRow = (page, box, i) => page.locator(`${box} .trrow`).nth(i);
async function ponerTramos(page, box) {
  // arranca con dos tramos: [N] de 1 h y [el resto] de …
  await expect(page.locator(`${box} .trrow`)).toHaveCount(2);
  await trRow(page, box, 0).locator(".trn").selectOption("10");
  await trRow(page, box, 0).locator(".trm").selectOption("60");
  await trRow(page, box, 1).locator(".trn").selectOption("2");
  await trRow(page, box, 1).locator(".trm").selectOption("90");
  await page.locator(`${box} .tradd`).click();
  await trRow(page, box, 2).locator(".trn").selectOption("rest");
  await trRow(page, box, 2).locator(".trm").selectOption("120");
  await page.locator(`${box} .tradd`).click();
  await trRow(page, box, 3).locator(".trn").selectOption("3");
  await trRow(page, box, 3).locator(".trm").selectOption("180");
  await expect(page.locator(`${box} .trrow`)).toHaveCount(4);
  await expect(trRow(page, box, 2).locator(".trn")).toContainText("El resto (16)");
}

test("crear: el caso de Bauti con tiempos por tramos", async ({ page }) => {
  const errors = await openApp(page);
  await abrirCrearDiaria(page, "Estudiar AM2");
  // el control aparece solo con una serie con fin; por defecto apagado
  await expect(page.locator("#qt_trwrap")).toBeVisible();
  await expect(page.locator("#qt_tron")).not.toBeChecked();
  await expect(page.locator("#qt_preview")).toContainText("31 h en total");
  await page.check("#qt_tron");
  await expect(page.locator("#qt_min")).toBeDisabled();
  await ponerTramos(page, "#qt_tr");
  // la vista previa muestra el tiempo de cada una y el total
  const pv = page.locator("#qt_preview");
  await expect(pv).toContainText("54 h en total");
  await expect(pv.locator(".repdate").first()).toHaveText("mié 4 nov · 1 h");
  await expect(pv.locator(".repdate").nth(10)).toHaveText("sáb 14 nov · 1 h 30 m");
  await expect(pv.locator(".repdate").nth(12)).toHaveText("lun 16 nov · 2 h");
  await expect(pv.locator(".repdate").nth(30)).toHaveText("vie 4 dic · 3 h");
  await page.click("#qt_save");
  await expect(page.locator("#modalbg")).not.toHaveClass(/open/);
  expect(await minutos(page, "Estudiar AM2")).toEqual(ESPERADO);
  await reload(page);
  expect(await minutos(page, "Estudiar AM2")).toEqual(ESPERADO);
  expect(errors).toEqual([]);
});

test("crear: tramos que no cierran avisan y no crean nada", async ({ page }) => {
  const errors = await openApp(page);
  await abrirCrearDiaria(page, "Repasar");
  await page.check("#qt_tron");
  await trRow(page, "#qt_tr", 0).locator(".trn").selectOption("30");
  await trRow(page, "#qt_tr", 1).locator(".trn").selectOption("5");
  await expect(page.locator("#qt_preview")).toContainText("Los tramos suman 35 tareas y son 31");
  await trRow(page, "#qt_tr", 1).locator(".trn").selectOption("rest");
  await trRow(page, "#qt_tr", 0).locator(".trn").selectOption("rest");
  await expect(page.locator("#qt_preview")).toContainText("Solo un tramo puede ser «el resto»");
  await page.click("#qt_save");
  await expect(page.locator("#modalbg")).toHaveClass(/open/);
  expect(await minutos(page, "Repasar")).toEqual([]);
  // apagar los tramos vuelve al tiempo único
  await page.uncheck("#qt_tron");
  await expect(page.locator("#qt_min")).toBeEnabled();
  await page.click("#qt_save");
  expect(await minutos(page, "Repasar")).toEqual(Array(31).fill(60));
  expect(errors).toEqual([]);
});

async function crearYAbrirEditor(page, title) {
  await abrirCrearDiaria(page, title);
  await page.click("#qt_save");
  await expect(page.locator("#modalbg")).not.toHaveClass(/open/);
  await page.evaluate(() => go("series"));
  await page.locator(".serrow").first().click();
  await expect(page.locator("#sr_occ .occ")).toHaveCount(31);
}

test("editar: rangos rápidos y tiempo con un toque (cadena del caso de Bauti)", async ({ page }) => {
  const errors = await openApp(page);
  await crearYAbrirEditor(page, "Estudiar AM2");
  await page.getByRole("button", { name: "Ninguna" }).click();
  await expect(page.locator("#sr_quicklbl")).toContainText("Elegí tareas");
  // primeras 10
  await page.fill("#sr_from", "1"); await page.fill("#sr_to", "10");
  await page.getByRole("button", { name: "Elegir", exact: true }).click();
  await expect(page.locator("#sr_count")).toHaveText("10 elegidas");
  await expect(page.locator("#sr_quicklbl")).toContainText("las 10 elegidas (de la 1 a la 10)");
  await page.locator("#sr_quick").getByRole("button", { name: "1 h", exact: true }).click();
  // deja listo el rango siguiente: de la 11 a la 31
  await expect(page.locator("#sr_from")).toHaveValue("11");
  await expect(page.locator("#sr_to")).toHaveValue("31");
  await page.fill("#sr_to", "12");
  await page.getByRole("button", { name: "Elegir", exact: true }).click();
  await page.locator("#sr_quick").getByRole("button", { name: "1 h 30 m", exact: true }).click();
  await page.getByRole("button", { name: "Las que quedan" }).click();
  await expect(page.locator("#sr_count")).toHaveText("19 elegidas");
  await page.locator("#sr_quick").getByRole("button", { name: "2 h", exact: true }).click();
  await page.fill("#sr_from", "29"); await page.fill("#sr_to", "31");
  await page.getByRole("button", { name: "Elegir", exact: true }).click();
  await page.locator("#sr_quick").getByRole("button", { name: "3 h", exact: true }).click();
  expect(await minutos(page, "Estudiar AM2")).toEqual(ESPERADO);
  // deshacer el último toque
  await page.locator("#toast button").first().click();
  const m = await minutos(page, "Estudiar AM2");
  expect(m.slice(28)).toEqual([120, 120, 120]);
  expect(errors).toEqual([]);
});

test("editar: tiempos por tramos sobre las elegidas, con vista previa", async ({ page }) => {
  const errors = await openApp(page);
  await crearYAbrirEditor(page, "Estudiar AM2");
  await page.getByRole("button", { name: "Todas", exact: true }).click();
  await page.selectOption("#sr_act", "tramos");
  await ponerTramos(page, "#sr_trwrap");
  await expect(page.locator("#sr_preview")).toContainText("Vas a poner tiempos por tramos a 31 tareas (54 h en total)");
  await expect(page.locator("#sr_apply")).toHaveText("Aplicar tramos a 31 tareas");
  expect(await minutos(page, "Estudiar AM2")).toEqual(Array(31).fill(60)); // la vista previa no toca nada
  await page.click("#sr_apply");
  expect(await minutos(page, "Estudiar AM2")).toEqual(ESPERADO);
  await expect(page.locator("#sr_occ .occ").nth(30).locator(".occm")).toHaveText("3 h");
  expect(errors).toEqual([]);
});

test("editar: el tiempo de cada fila se cambia en el lugar", async ({ page }) => {
  const errors = await openApp(page);
  await crearYAbrirEditor(page, "Leer apunte");
  const row = i => page.locator("#sr_occ .occ").nth(i);
  await row(2).locator(".occm").click();
  const inp = row(2).locator("input.occmin");
  await expect(inp).toBeFocused();
  await inp.fill("1,5"); await inp.press("Enter");
  await expect(row(2).locator(".occm")).toHaveText("1 h 30 m");
  await row(3).locator(".occm").click();
  await row(3).locator("input.occmin").fill("1 h 45"); await row(3).locator("input.occmin").press("Enter");
  await expect(row(3).locator(".occm")).toHaveText("1 h 45 m");
  // Escape no cambia nada
  await row(4).locator(".occm").click();
  await row(4).locator("input.occmin").fill("300"); await row(4).locator("input.occmin").press("Escape");
  await expect(row(4).locator(".occm")).toHaveText("1 h");
  await expect(page.locator("#modalbg")).toHaveClass(/open/);
  const m = await minutos(page, "Leer apunte");
  expect(m.slice(0, 6)).toEqual([60, 60, 90, 105, 60, 60]);
  // tocar el tiempo no tilda ni destilda la fila
  await expect(page.locator("#sr_count")).toHaveText("31 elegidas");
  expect(errors).toEqual([]);
});

test("desktop: Shift + clic elige todas las del medio", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "con mouse");
  const errors = await openApp(page);
  await crearYAbrirEditor(page, "Leer apunte");
  await page.getByRole("button", { name: "Ninguna" }).click();
  await page.locator("#sr_occ .occ").nth(1).locator(".occd").click();
  await page.locator("#sr_occ .occ").nth(6).locator(".occd").click({ modifiers: ["Shift"] });
  await expect(page.locator("#sr_count")).toHaveText("6 elegidas");
  await expect(page.locator("#sr_quicklbl")).toContainText("de la 2 a la 7");
  expect(errors).toEqual([]);
});

test("celu: tocar una y mantener apretada otra elige todas las del medio", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "táctil");
  const errors = await openApp(page);
  await crearYAbrirEditor(page, "Leer apunte");
  await page.getByRole("button", { name: "Ninguna" }).click();
  await page.locator("#sr_occ .occ").nth(0).locator(".occd").tap();
  await expect(page.locator("#sr_count")).toHaveText("1 elegida");
  const target = page.locator("#sr_occ .occ").nth(4).locator(".occd");
  const box = await target.boundingBox();
  const opts = { pointerType: "touch", isPrimary: true, clientX: box.x + 5, clientY: box.y + 5, bubbles: true };
  await target.dispatchEvent("pointerdown", opts);
  await page.waitForTimeout(600);
  await target.dispatchEvent("pointerup", opts);
  await target.click(); // el clic que sigue al toque largo no destilda
  await expect(page.locator("#sr_count")).toHaveText("5 elegidas");
  await expect(page.locator("#sr_hint, .srhint")).toContainText("mantené apretada");
  expect(errors).toEqual([]);
});

test("parseDur entiende las formas comunes", async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => ["90", "1,5", "1.5", "1 h 30", "1h30", "1:30", "2 h", "45 m", "45 min", "", "abc"].map(parseDur));
  expect(r).toEqual([90, 90, 90, 90, 90, 90, 120, 45, 45, null, null]);
});
