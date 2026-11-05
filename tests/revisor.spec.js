// L1a2 · Revisor automático de textos.
// Carga varios estados (el fixture y estados "raros"), recorre TODAS las vistas,
// los detalles de cada materia/parcial/proyecto y los modales principales, en
// desktop y en el celu, y falla si en pantalla aparece algo que delata un bug:
// NaN, undefined, null, Invalid Date, [object …], plurales mal ("1 días"),
// "en 0 días", números negativos de tiempo, o algo que se sale de la pantalla.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, fixture, seedState } = require("./helpers");

const TODAY = "2026-11-04";
test.beforeEach(async ({ page }) => { await setClock(page, TODAY + "T11:00:00-03:00"); });

const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const T = (id, o = {}) => Object.assign({ id, title: "Tarea " + id, desc: "", subjectId: "s-an", projectId: null, evalId: null, planId: null, date: TODAY, due: null, estMin: 30, prio: 2, status: "pend", type: "estudio", tags: [], subtasks: [], notes: "", recur: null, recurDone: {}, realMin: 0, pomos: 0, createdAt: "2026-10-01", doneAt: null, archived: false }, o);
const EV = (id, o = {}) => Object.assign({ id, name: "Parcial " + id, subjectId: "s-an", projectId: null, kind: "parcial", date: addDays(TODAY, 2), time: "18:00", mode: "Presencial", place: "", status: "prep", targetGrade: "", grade: "", topics: [], reviewDays: 2, obs: "", createdAt: "2026-09-01" }, o);
const LARGO = "Resolver la guía completa de ejercicios de integrales impropias y series de potencias con todos los casos especiales y ejemplos del apunte del profesor";

/** Estados de prueba: nombre → función que devuelve el estado a sembrar (null = base vacía). */
const ESTADOS = {
  fixture: () => fixture("estado-v2.6.json"),
  vacio: () => null,
  "una-materia": () => { const s = fixture("estado-v2.6.json"); s.subjects = s.subjects.slice(0, 1); s.tasks = []; s.evals = []; s.projects = []; s.sessions = []; s.habits = []; s.notes = []; return s; },
  "200-tareas": () => { const s = fixture("estado-v2.6.json"); for (let i = 0; i < 200; i++) s.tasks.push(T("m" + i, { date: addDays(TODAY, (i % 20) - 5), status: i % 3 ? "pend" : "done", doneAt: i % 3 ? null : addDays(TODAY, (i % 20) - 5), subjectId: s.subjects[i % s.subjects.length].id })); return s; },
  "titulos-largos": () => { const s = fixture("estado-v2.6.json"); s.tasks.forEach(t => t.title = LARGO); s.subjects.forEach(x => x.name = "Materia con un nombre larguísimo — " + x.name + " (cátedra)"); s.evals.forEach(e => e.name = "Evaluación con nombre muy largo: " + e.name + " y recuperatorio"); s.projects.forEach(p => p.name = LARGO); return s; },
  "mismo-dia": () => { const s = fixture("estado-v2.6.json"); s.evals.push(EV("x1", { subjectId: "s-ec" }), EV("x2", { subjectId: "s-an" }), EV("x3", { subjectId: "s-bd", date: TODAY, time: "" })); return s; },
  "cero-min": () => { const s = fixture("estado-v2.6.json"); s.tasks.forEach(t => { t.estMin = 0; t.realMin = 0; }); return s; },
  "todo-hecho": () => { const s = fixture("estado-v2.6.json"); s.tasks.forEach(t => { if (!t.recur) { t.status = "done"; t.doneAt = t.doneAt || t.date || TODAY; } }); return s; },
  "todo-atrasado": () => { const s = fixture("estado-v2.6.json"); s.tasks.forEach((t, i) => { if (!t.recur) { t.status = "pend"; t.doneAt = null; t.date = addDays(TODAY, -1 - (i % 9)); } }); s.evals.forEach(e => { if (e.status === "prep") e.date = addDays(TODAY, -3); }); return s; }
};

/** Corre en el navegador: devuelve los problemas de lo que se ve ahora mismo. */
function scanFn(where) {
  const out = [];
  const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none"; };
  let text = document.body.innerText;
  for (const el of document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea")) if (visible(el)) text += "\n" + el.value + " " + (el.placeholder || "");
  const rules = [
    [/\bNaN\b/, "NaN"], [/\bundefined\b/, "undefined"], [/\bnull\b/, "null"], [/Invalid Date/, "Invalid Date"], [/\[object/, "[object"],
    [/(^|[^\d.,/])1 (días|tareas|horas|materias|parciales|semanas|minutos|veces|sesiones|evaluaciones|proyectos|notas|hábitos|temas|series|meses|años|subtareas|pendientes|hechas|atrasadas)\b/, "plural mal"],
    [/\b(en|hace) 0 días\b/, "en/hace 0 días"],
    [/(^|\s)[-−]\d+(\s?(días|min|h|tareas|%))\b/, "número negativo"]
  ];
  for (const line of text.split("\n")) for (const [re, name] of rules) if (re.test(line)) out.push(where + " · " + name + ": «" + line.trim().slice(0, 120) + "»");
  // nada se sale de la pantalla
  const W = window.innerWidth;
  if (document.documentElement.scrollWidth > W + 1) out.push(where + " · la página scrollea de costado (" + document.documentElement.scrollWidth + " > " + W + ")");
  const clipped = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox !== "visible") return true; } return false; };
  let n = 0;
  for (const el of document.querySelectorAll("#view *, #modalbg.open *, header *, .topbar *")) {
    if (n > 3) break;
    if (!el.children.length && el.textContent.trim() === "" && el.tagName !== "INPUT" && el.tagName !== "BUTTON") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.right <= W + 1 || r.left >= W) continue;
    if (!visible(el) || clipped(el)) continue;
    out.push(where + " · se sale de la pantalla: <" + el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").join(".") : "") + "> derecha=" + Math.round(r.right) + " > " + W + " «" + (el.textContent || "").trim().slice(0, 50) + "»");
    n++;
  }
  return out;
}

/** Recorre todo: vistas, detalles y modales. Devuelve la lista de problemas. */
async function recorrer(page) {
  const problems = [];
  const scan = async where => { await page.waitForTimeout(30); problems.push(...await page.evaluate(scanFn, where)); };
  const views = await page.evaluate(() => VIEWS.map(v => v[0]).concat(["list"]));
  for (const v of views) { await page.evaluate(v => go(v), v); await scan("vista " + v); }
  const ids = await page.evaluate(() => ({ s: state.subjects.map(x => x.id), e: state.evals.map(x => x.id), p: state.projects.map(x => x.id) }));
  for (const id of ids.s) { await page.evaluate(id => go("subject", id), id); await scan("materia " + id); }
  for (const id of ids.e) { await page.evaluate(id => go("eval", id), id); await scan("parcial " + id); }
  for (const id of ids.p) { await page.evaluate(id => go("project", id), id); await scan("proyecto " + id); }
  // modales: [nombre, código que lo abre] (se saltan si no hay con qué abrirlos)
  await page.evaluate(() => go("today"));
  const modales = [
    ["nueva tarea", "openQuickTask()"],
    ["agregar", "openQuick()"],
    ["editar tarea", "state.tasks[0] && openTaskEditor(state.tasks[0].id)"],
    ["editar tarea larga", "state.tasks.length && openTaskEditor(state.tasks[state.tasks.length-1].id)"],
    ["mover tarea", "state.tasks.find(t=>t.status!=='done') && openMoveSheet(state.tasks.find(t=>t.status!=='done').id)"],
    ["materia", "state.subjects[0] && openSubjectEditor(state.subjects[0].id)"],
    ["materia nueva", "openSubjectEditor()"],
    ["proyecto", "state.projects[0] && openProjectEditor(state.projects[0].id)"],
    ["parcial", "state.evals[0] && openEvalEditor(state.evals[0].id)"],
    ["parcial nuevo", "openEvalEditor()"],
    ["plan", "state.evals.find(e=>e.status==='prep') && openPlanWizard(state.evals.find(e=>e.status==='prep').id)"],
    ["hábito", "state.habits[0] && openHabitEditor(state.habits[0].id)"],
    ["nota", "state.notes[0] && openNoteEditor(state.notes[0].id)"],
    ["tiempo manual", "openManualSession(state.tasks[0] ? state.tasks[0].id : null)"],
    ["búsqueda", "openSearch()"],
    ["día", "openDayPreview(todayISO())"],
    ["serie", "buildSeries()[0] && openSeriesModal(buildSeries()[0].key)"],
    ["años", "openYearPicker()"],
    ["año nuevo", "openNewYear()"],
    ["informe", "openPosterModal()"]
  ];
  for (const [name, code] of modales) {
    const opened = await page.evaluate(code => { try { closeModal(); } catch (e) {} const r = eval(code); return r !== false && r !== null && r !== 0 && r !== "" && document.getElementById("modalbg").classList.contains("open"); }, code);
    if (!opened) continue;
    await page.waitForTimeout(60);
    await scan("modal " + name);
    await page.evaluate(() => closeModal());
  }
  return problems;
}

for (const [nombre, make] of Object.entries(ESTADOS)) {
  test("revisor de textos: " + nombre, async ({ page }) => {
    test.setTimeout(90_000);
    if (nombre === "todo-atrasado") await setClock(page, "2026-11-05T00:40:00-03:00"); // pasada la medianoche, "tu día sigue"
    const s = make();
    if (s) await seedState(page, s);
    const errors = await openApp(page);
    const problems = await recorrer(page);
    expect(problems, "textos rotos o cosas que se salen de la pantalla").toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("el revisor detecta los problemas que tiene que detectar", async ({ page }) => {
  await openApp(page);
  const found = await page.evaluate(scanFn => {
    const f = new Function("return " + scanFn)();
    const v = document.getElementById("view");
    v.innerHTML = `<p>Total: NaN h</p><p>Vence undefined</p><p>Faltan 1 días</p><p>en 0 días</p><p>Quedan -3 días</p><p>Invalid Date</p><p>[object Object]</p><div style="width:5000px">ancho</div><div style="position:relative;left:30px;width:100vw"><b>se sale</b></div>`;
    const r = f("prueba");
    v.innerHTML = `<p>Faltan 11 días · 1 día · 1 h 30 · 21 tareas · en 2 días · 3-5 días</p>`;
    return { r, ok: f("prueba") };
  }, scanFn.toString());
  const names = found.r.map(x => x.split(" · ")[1].split(":")[0]);
  for (const n of ["NaN", "undefined", "plural mal", "en/hace 0 días", "número negativo", "Invalid Date", "[object", "la página scrollea de costado (5000 > ", "se sale de la pantalla"]) expect(found.r.join("\n")).toContain(n.split(" (")[0]);
  expect(names.length).toBeGreaterThan(7);
  expect(found.ok).toEqual([]);
});

test("Materias en el celu: el nombre entra en un renglón y los botones van abajo (hallazgo del revisor)", async ({ page }, info) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  await page.evaluate(() => go("subjects"));
  const r = await page.evaluate(() => [...document.querySelectorAll("#view .subrow")].slice(0, 5).map(row => {
    const name = row.querySelector("div[onclick] > div"), acts = row.querySelector(".subacts");
    const lh = parseFloat(getComputedStyle(name).lineHeight) || 20;
    return { lines: Math.round(name.getBoundingClientRect().height / lh), below: acts.getBoundingClientRect().top >= name.getBoundingClientRect().bottom, h: acts.querySelector(".btn").getBoundingClientRect().height };
  }));
  expect(r.length).toBe(5);
  for (const x of r) expect(x.lines).toBe(1);
  if (info.project.name === "mobile") for (const x of r) { expect(x.below).toBe(true); expect(x.h).toBeGreaterThanOrEqual(40); }
  else for (const x of r) expect(x.below).toBe(false);
  expect(errors).toEqual([]);
});
