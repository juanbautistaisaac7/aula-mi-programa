// M2 · Formularios en el celu: ningún campo se encima con otro ni se sale del modal,
// en 390, 375 y 320 px de ancho. Recorre todos los modales con el fixture cargado.
const { test, expect } = require("@playwright/test");
const { openApp, seedState, fixture } = require("./helpers");

// [nombre, JS que abre el modal (y lo deja en el estado a revisar)]
const MODALES = [
  ["nueva tarea", "openQuickTask()"],
  ["nueva tarea · repetir", "openQuickTask(); byId('qt_rep').value='interval'; repPreview()"],
  ["nueva tarea · repetir días + cantidad", "openQuickTask(); byId('qt_rep').value='days'; byId('qt_repend').value='count'; repPreview()"],
  ["nueva tarea · tramos", "openQuickTask(); byId('qt_rep').value='daily'; byId('qt_repend').value='count'; repPreview(); byId('qt_tron').checked=true; trToggleQt(true)"],
  ["agregado rápido", "openQuick()"],
  ["editar tarea", "openTaskEditor('t-2')"],
  ["editar tarea que se repite", "openTaskEditor('t-18')"],
  ["mover a…", "openMoveSheet('t-2')"],
  ["materia", "openSubjectEditor('s-pe')"],
  ["materia nueva", "openSubjectEditor()"],
  ["parcial", "openEvalEditor('e-pe2')"],
  ["parcial nuevo", "openEvalEditor()"],
  ["plan de estudio", "openPlanWizard('e-pe2')"],
  ["proyecto", "openProjectEditor('p-tp')"],
  ["nota", "openNoteEditor('n1')"],
  ["hábito", "openHabitEditor('h1')"],
  ["registrar tiempo", "openManualSession()"],
  ["años", "openYearPicker()"],
  ["año nuevo", "openNewYear()"],
  ["informe", "openPosterModal()"],
  ["cambiar fecha (varias)", "ui.sel=new Set(['t-1','t-2']); openBulkModal('date')"],
  ["cambiar tiempo (varias)", "ui.sel=new Set(['t-1','t-2']); openBulkModal('min')"],
];
const VISTAS = [["configuración", "config"], ["estudio de hoy", "home"]];

// Los tests corren en Chrome. Esto imita lo que hace Safari en iOS con los campos de fecha
// y hora (un ancho mínimo propio que no achica): si el CSS de la app no lo anula, se nota.
const SAFARI = ":where(input[type=date]){min-width:150px}:where(input[type=time]){min-width:110px}";

async function problemas(page, scope) {
  return page.evaluate(sel => {
    const root = document.querySelector(sel);
    if (!root) return ["no hay " + sel];
    const box = root.getBoundingClientRect(), out = [];
    const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !el.closest("[hidden]") && el.type !== "hidden" && el.type !== "checkbox" && el.type !== "radio"; };
    const els = [...root.querySelectorAll("input,select,textarea,button")].filter(vis);
    const name = el => (el.id ? "#" + el.id : el.tagName.toLowerCase() + (el.textContent.trim() ? "«" + el.textContent.trim().slice(0, 20) + "»" : ""));
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.left < box.left - 1 || r.right > box.right + 1) out.push(name(el) + " se sale del costado (" + Math.round(r.left) + "–" + Math.round(r.right) + " de " + Math.round(box.left) + "–" + Math.round(box.right) + ")");
    }
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
      if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 1 && oy > 1) out.push(name(els[i]) + " se encima con " + name(els[j]));
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push("scroll horizontal de la página");
    return out;
  }, scope);
}

for (const width of [390, 375, 320]) {
  test(`en el celu (${width} px) ningún formulario tiene campos encimados ni salidos`, async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "es de celu");
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 780 });
    await seedState(page, fixture("estado-v2.6.json"));
    const errors = await openApp(page);
    await page.addStyleTag({ content: SAFARI });
    const todos = [];
    for (const [nombre, js] of MODALES) {
      await page.evaluate(js);
      await page.waitForTimeout(60);
      const sheet = await page.evaluate(() => byId("sheetbg").classList.contains("open"));
      const p = await problemas(page, sheet ? "#sheet" : "#modalbox");
      todos.push(...p.map(x => nombre + ": " + x));
      await page.evaluate(() => { closeModal(); closeMoveSheet(); ui.sel = new Set(); });
    }
    for (const [nombre, v] of VISTAS) {
      await page.evaluate(v => go(v), v);
      await page.waitForTimeout(80);
      todos.push(...(await problemas(page, "#view")).map(x => nombre + ": " + x));
    }
    expect(todos).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("en el celu los campos de fecha y hora están listos para Safari (16 px, ancho del contenedor) y Fecha + Hora van juntas", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "es de celu");
  await page.setViewportSize({ width: 375, height: 780 });
  const errors = await openApp(page);
  await page.addStyleTag({ content: SAFARI });
  await page.evaluate(() => openQuickTask());
  const st = await page.evaluate(() => ["qt_title", "qt_date", "qt_time", "qt_min", "qt_mode"].map(id => { const el = byId(id), cs = getComputedStyle(el); return { id, fs: parseFloat(cs.fontSize), minW: cs.minWidth, h: el.getBoundingClientRect().height }; }));
  for (const s of st) { expect(s.fs, s.id).toBeGreaterThanOrEqual(16); expect(s.h, s.id).toBeGreaterThanOrEqual(44); }
  for (const s of st.filter(x => /date|time/.test(x.id))) expect(s.minW, s.id).toBe("0px");
  const r = id => page.locator("#" + id).boundingBox();
  const [mode, date, time] = [await r("qt_mode"), await r("qt_date"), await r("qt_time")];
  expect(Math.abs(date.y - time.y)).toBeLessThan(2); // misma fila
  expect(mode.y).toBeLessThan(date.y);                // Programación arriba
  expect(mode.width).toBeGreaterThan(date.width * 1.8); // y a lo ancho
  expect(errors).toEqual([]);
});
