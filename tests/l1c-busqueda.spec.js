// L1c1 · Búsqueda y Copias de seguridad (recorrido pensado, hallazgos #21–#27 de docs/AUDITORIA.md)
const { test, expect } = require("@playwright/test");
const { openApp, setClock, seedState, fixture } = require("./helpers");

async function abrir(page) {
  await setClock(page, "2026-11-04T23:40:00-03:00");
  await seedState(page, fixture("estado-v2.6.json"));
  return openApp(page);
}
const resultados = page => page.evaluate(() => (ui.searchRes || []).map(r => r.kind + ":" + r.label + (r.sub ? " (" + r.sub + ")" : "")));

test("busca sin acentos ni mayúsculas (#22)", async ({ page }) => {
  const errors = await abrir(page);
  await page.evaluate(() => openSearch());
  await expect(page.locator("#sinput")).toBeFocused();
  await page.fill("#sinput", "economia");
  await expect.poll(async () => (await resultados(page)).some(r => r === "Materia:Economía")).toBe(true);
  await page.fill("#sinput", "ANALISIS");
  await expect.poll(async () => (await resultados(page)).some(r => r.startsWith("Materia:Análisis Numérico"))).toBe(true);
  await page.fill("#sinput", "practica cada");
  await expect.poll(async () => (await resultados(page)).some(r => r.startsWith("Tarea:Práctica cada 3 días"))).toBe(true);
  expect(errors).toEqual([]);
});

test("una serie aparece una vez, lo pendiente primero y lo hecho marcado (#23)", async ({ page }) => {
  const errors = await abrir(page);
  await page.evaluate(() => openSearch());
  await page.fill("#sinput", "repasar unidad");
  const r = await resultados(page);
  expect(r.filter(x => x.startsWith("Tarea:Repasar unidad 3"))).toHaveLength(1);
  expect(r.find(x => x.startsWith("Tarea:Repasar unidad 3"))).toContain("serie");
  // abre la próxima pendiente (hoy es mié 4: la del 4)
  await page.keyboard.press("Enter");
  await expect(page.locator("#modalbg")).toHaveClass(/open/);
  expect(await page.evaluate(() => [...document.querySelectorAll("#modalbox input")].map(i => i.value).join("|"))).toContain("Repasar unidad 3");
  await page.evaluate(() => closeModal());
  await page.evaluate(() => openSearch());
  await page.fill("#sinput", "resumen");
  const r2 = await resultados(page);
  expect(r2.find(x => x.startsWith("Tarea:Resumen unidad 4"))).toContain("hecha");
  // sin escribir nada no tira una lista de tareas al azar
  await page.fill("#sinput", "");
  expect(await resultados(page)).toEqual([]);
  await expect(page.locator("#sresults")).toContainText("Buscá");
  expect(errors).toEqual([]);
});

test("acciones rápidas con los nombres del menú (#24)", async ({ page }) => {
  const errors = await abrir(page);
  await page.evaluate(() => openSearch("cmd"));
  await page.fill("#sinput", "progreso");
  expect(await resultados(page)).toContain("Acción:Ir a Progreso");
  await page.fill("#sinput", "series");
  expect(await resultados(page)).toContain("Acción:Ir a Series");
  expect(errors).toEqual([]);
});

test("en el celu la búsqueda se abre desde la barra de arriba (#21)", async ({ page }, info) => {
  const errors = await abrir(page);
  const btn = page.locator("#btnSearch");
  if (info.project.name === "desktop") { await expect(btn).toBeHidden(); return; }
  await expect(btn).toBeVisible();
  const box = await btn.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  await btn.click();
  await expect(page.locator("#searchbg")).toHaveClass(/open/);
  await expect(page.locator("#sinput")).toBeFocused();
  // sin los atajos de teclado en pantalla táctil y filas de 44 px
  await expect(page.locator("#searchbox2 .kbdhint")).toBeHidden();
  await page.fill("#sinput", "repasar");
  const h = await page.locator(".sres").first().boundingBox();
  expect(h.height).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => closeSearch());
  // nada de la barra se sale ni se encima, ni a 320 px
  for (const w of [390, 360, 320]) {
    await page.setViewportSize({ width: w, height: 700 });
    const bad = await page.evaluate(() => {
      const els = [...document.querySelectorAll("#topbar > *")].filter(e => e.offsetParent !== null).map(e => e.getBoundingClientRect());
      for (let i = 0; i < els.length; i++) {
        if (els[i].right > innerWidth + 0.5 || els[i].left < -0.5) return "se sale";
        for (let j = i + 1; j < els.length; j++) if (els[i].right > els[j].left + 0.5 && els[j].right > els[i].left + 0.5) return "se enciman";
      }
      return null;
    });
    expect(bad, "a " + w + " px").toBeNull();
  }
  expect(errors).toEqual([]);
});

test("Copias: botón propio para importar y aviso de que restaurar viaja al otro dispositivo (#25, #26)", async ({ page }) => {
  await page.route("**/api/sync", r => r.fulfill({ status: 503, body: "{}" }));
  await abrir(page);
  await page.evaluate(() => go("backups"));
  const lbl = page.locator("label.filebtn");
  await expect(lbl).toBeVisible();
  await expect(lbl).toContainText("Elegir archivo");
  await expect(page.locator("#impfile")).toBeHidden();
  await page.evaluate(() => manualBackup());
  await expect(page.locator("#bklist button").first()).toBeVisible();
  // sin sincronizar: no menciona otro dispositivo
  await page.locator("#bklist button").first().click();
  await expect(page.locator("#confirmbox")).not.toContainText("otro dispositivo");
  await page.evaluate(() => closeConfirm());
  // con la sincronización activa: lo avisa
  await page.evaluate(() => { syncCfg = { key: "k-prueba" }; });
  await page.locator("#bklist button").first().click();
  await expect(page.locator("#confirmbox")).toContainText("otro dispositivo");
  await page.evaluate(() => { closeConfirm(); syncCfg = null; });
});
