"use strict";
/* =====================================================================
   AULA — Organizador académico personal
   Vanilla JS · IndexedDB · PWA · sin dependencias externas
   ===================================================================== */
const APP_VERSION = "2.0.0";
const DB_NAME = "aula-db", DB_VER = 1, OLD_LS_KEY = "bauti-operacion-julio-v1";
const EMERGENCY_KEY = "aula-emergency";

/* ============================ HELPERS ============================ */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DAYSL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function pad(n) { return String(n).padStart(2, "0"); }
function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function todayISO() { return iso(new Date()); }
function dToDate(s) { const [a, b, c] = s.split("-").map(Number); return new Date(a, b - 1, c); }
function addDays(s, n) { const d = dToDate(s); d.setDate(d.getDate() + n); return iso(d); }
function daysTo(s) { return Math.round((dToDate(s) - dToDate(todayISO())) / 864e5); }
function fmtD(s) { if (!s) return ""; const d = dToDate(s); return DAYS[d.getDay()] + " " + d.getDate() + " " + MES[d.getMonth()]; }
function fmtDFull(s) { const d = dToDate(s); return DAYSL[d.getDay()] + " " + d.getDate() + " de " + MESL[d.getMonth()] + " de " + d.getFullYear(); }
function fmtRel(s) { const n = daysTo(s); if (n === 0) return "hoy"; if (n === 1) return "mañana"; if (n === -1) return "ayer"; if (n < 0) return "hace " + (-n) + " días"; return "en " + n + " días"; }
function fmtMin(m) { m = Math.round(m || 0); if (!m) return "0 m"; const h = Math.floor(m / 60), r = m % 60; return (h ? h + " h" : "") + (h && r ? " " : "") + (r ? r + " m" : ""); }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function escA(s) { return esc(s).replace(/'/g, "&#39;"); }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function byId(id) { return document.getElementById(id); }
function weekStartOf(dateStr, ws) { const d = dToDate(dateStr); const diff = (d.getDay() - ws + 7) % 7; d.setDate(d.getDate() - diff); return iso(d); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ============================ ESTADO ============================ */
let state = null;
let route = { view: "home", id: null };
let ui = { calMonth: null, listFilters: {}, searchSel: 0, undoBuf: null, notesFilter: "", histMonth: null };

function defaultSettings() {
  return {
    theme: "auto", accent: "#4338ca", weekStart: 1,
    pomo: { f: 25, s: 5, l: 15, c: 4 },
    sounds: true, notif: false, hourFmt: 24, showDone: true,
    upcomingDays: 7, tags: ["repaso", "importante", "entrega"]
  };
}
function baseState() {
  return {
    v: 2, settings: defaultSettings(),
    subjects: [], projects: [], evals: [], tasks: [], notes: [], habits: [], sessions: [],
    dayLog: {},
    timer: { phase: "focus", left: 25 * 60, total: 25 * 60, run: false, ends: null, taskId: null, subjectId: null, projectId: null, cycle: 0 },
    meta: { created: todayISO(), migratedV1: false, notified: {}, lastBackup: null }
  };
}
const SUBJ_COLORS = ["#4338ca", "#0e7490", "#b54708", "#067647", "#9f1239", "#175cd3", "#b42318", "#6d28d9", "#0f766e", "#a16207", "#be185d", "#374151"];
function initialSubjects() {
  const mk = (name, short, color, i) => ({ id: uid() + i, name, short, color, icon: short.slice(0, 2), archived: false, order: i, createdAt: todayISO() });
  return [
    mk("Probabilidad y Estadística", "PE", "#067647", 0),
    mk("Economía", "EC", "#b42318", 1),
    mk("Bases de Datos", "BD", "#b54708", 2),
    mk("Desarrollo de Software", "DS", "#175cd3", 3),
    mk("Comunicación de Datos — Teoría", "CDT", "#0e7490", 4),
    mk("Comunicación de Datos — Práctica", "CDP", "#0f766e", 5),
    mk("Análisis Numérico — Teoría", "ANT", "#4338ca", 6),
    mk("Análisis Numérico — Práctica", "ANP", "#6d28d9", 7),
    mk("Diseño de Sistemas de Información — Teoría", "DSIT", "#9f1239", 8),
    mk("Diseño de Sistemas de Información — Práctica", "DSIP", "#be185d", 9)
  ];
}

/* ====================== STORAGE (IndexedDB) ====================== */
let db = null, idbOK = typeof indexedDB !== "undefined";
function idbOpen() {
  return new Promise((res, rej) => {
    if (!idbOK) return rej(new Error("no-idb"));
    const rq = indexedDB.open(DB_NAME, DB_VER);
    rq.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
      if (!d.objectStoreNames.contains("backups")) d.createObjectStore("backups");
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
function idbGet(store, key) {
  return new Promise((res, rej) => {
    try {
      const tx = db.transaction(store, "readonly").objectStore(store).get(key);
      tx.onsuccess = () => res(tx.result); tx.onerror = () => rej(tx.error);
    } catch (e) { rej(e); }
  });
}
function idbPut(store, key, val) {
  return new Promise((res, rej) => {
    try {
      const tx = db.transaction(store, "readwrite").objectStore(store).put(val, key);
      tx.onsuccess = () => res(); tx.onerror = () => rej(tx.error);
    } catch (e) { rej(e); }
  });
}
function idbDel(store, key) {
  return new Promise((res, rej) => {
    try {
      const tx = db.transaction(store, "readwrite").objectStore(store).delete(key);
      tx.onsuccess = () => res(); tx.onerror = () => rej(tx.error);
    } catch (e) { rej(e); }
  });
}
function idbKeys(store) {
  return new Promise((res, rej) => {
    try {
      const tx = db.transaction(store, "readonly").objectStore(store).getAllKeys();
      tx.onsuccess = () => res(tx.result || []); tx.onerror = () => rej(tx.error);
    } catch (e) { rej(e); }
  });
}

let saveTimer = null, saving = false, savePending = false;
function markDirty() {
  const el = byId("saveInd"); if (el) { el.classList.add("saving"); const t = byId("saveTxt"); if (t) t.textContent = "guardando…"; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 500);
}
async function persist() {
  if (saving) { savePending = true; return; }
  saving = true;
  state.meta.lastSave = Date.now();
  const json = JSON.stringify(state);
  try {
    if (db) await idbPut("kv", "state", json);
    else if (typeof localStorage !== "undefined") localStorage.setItem("aula-state-fallback", json);
    try { if (typeof localStorage !== "undefined" && json.length < 3500000) localStorage.setItem(EMERGENCY_KEY, json); } catch (e) {}
    const el = byId("saveInd");
    if (el) { el.classList.remove("saving"); const t = byId("saveTxt"); if (t) t.textContent = "todo guardado"; }
  } catch (e) {
    console.warn("Error al guardar", e);
    try { if (typeof localStorage !== "undefined") localStorage.setItem(EMERGENCY_KEY, json); } catch (e2) {}
  }
  saving = false;
  if (savePending) { savePending = false; persist(); }
}
function change() { markDirty(); } // alias semántico: cada mutación llama change()

async function dailyBackup() {
  try {
    const k = "auto-" + todayISO();
    if (!db) return;
    await idbPut("backups", k, { ts: Date.now(), label: "Automática " + fmtD(todayISO()), data: JSON.stringify(state) });
    const keys = (await idbKeys("backups")).filter(x => String(x).startsWith("auto-")).sort();
    while (keys.length > 10) await idbDel("backups", keys.shift());
    state.meta.lastBackup = todayISO();
  } catch (e) {}
}
async function manualBackup() {
  try {
    if (!db) { toast("IndexedDB no disponible en este navegador"); return; }
    await idbPut("backups", "manual-" + Date.now(), { ts: Date.now(), label: "Manual " + new Date().toLocaleString("es-AR"), data: JSON.stringify(state) });
    const keys = (await idbKeys("backups")).filter(x => String(x).startsWith("manual-")).sort();
    while (keys.length > 10) await idbDel("backups", keys.shift());
    toast("Copia de seguridad creada");
    if (route.view === "backups") render();
  } catch (e) { toast("No se pudo crear la copia"); }
}

function validState(s) {
  return s && typeof s === "object" && Array.isArray(s.subjects) && Array.isArray(s.tasks) && s.settings && typeof s.settings === "object";
}
function normalizeState(s) {
  const b = baseState();
  s.settings = Object.assign(defaultSettings(), s.settings || {});
  s.settings.pomo = Object.assign({ f: 25, s: 5, l: 15, c: 4 }, s.settings.pomo || {});
  for (const k of ["subjects", "projects", "evals", "tasks", "notes", "habits", "sessions"]) if (!Array.isArray(s[k])) s[k] = [];
  s.dayLog = s.dayLog || {}; s.meta = Object.assign(b.meta, s.meta || {});
  s.timer = Object.assign(b.timer, s.timer || {});
  s.v = 2;
  return s;
}

/* ================== MIGRACIÓN DESDE LA VERSIÓN 1 ================== */
function migrateV1(newState) {
  let old = null;
  try { old = JSON.parse(localStorage.getItem(OLD_LS_KEY)); } catch (e) { return false; }
  if (!old || !Array.isArray(old.tasks)) return false;

  const S = {}; // short -> subject id
  for (const sub of newState.subjects) S[sub.short] = sub.id;

  // Proyecto MQTT
  const projMQ = { id: uid(), name: "Presentación MQTT (POC)", desc: "Proyecto migrado desde la versión anterior. Ver videos, profundizar, armar POC y practicar la presentación.", due: "2026-08-05", status: "prog", createdAt: todayISO(), milestones: [], subjectIds: [S.CDT].filter(Boolean) };
  newState.projects.push(projMQ);

  // Evaluaciones desde tareas-examen antiguas
  const evAN = { id: uid(), name: "Parcial de Análisis Numérico", subjectId: S.ANP, projectId: null, kind: "parcial", date: "2026-07-30", time: "09:00", mode: "Presencial", place: "", status: "prep", targetGrade: "", grade: "", topics: [], reviewDays: 2, obs: "Migrado desde la versión anterior. Cubre teoría y práctica. Por la mañana.", createdAt: todayISO() };
  const evCD = { id: uid(), name: "Parcial de Comunicación de Datos", subjectId: S.CDP, projectId: null, kind: "parcial", date: "2026-07-30", time: "", mode: "Presencial", place: "", status: "prep", targetGrade: "", grade: "", topics: [], reviewDays: 2, obs: "Migrado desde la versión anterior.", createdAt: todayISO() };
  const evEC = { id: uid(), name: "Parcial de Economía", subjectId: S.EC, projectId: null, kind: "parcial", date: "2026-07-24", time: "20:00", mode: "Virtual", place: "Conectarse 20:00 hs", status: "prep", targetGrade: "", grade: "", topics: [], reviewDays: 0, obs: "Migrado. Conectarse a las 20:00.", createdAt: todayISO() };
  const evMQ = { id: uid(), name: "Presentación MQTT", subjectId: null, projectId: projMQ.id, kind: "presentacion", date: "2026-08-05", time: "", mode: "", place: "", status: "prep", targetGrade: "", grade: "", topics: [], reviewDays: 0, obs: "Migrado desde la versión anterior.", createdAt: todayISO() };
  newState.evals.push(evAN, evCD, evEC, evMQ);

  const mapTask = t => {
    const r = {
      id: uid(), title: t.t, desc: "", subjectId: null, projectId: null, evalId: null, planId: null,
      date: t.d || null, due: t.due || null, estMin: t.m || 0, prio: 1,
      status: t.done ? "done" : "pend", type: "estudio", tags: [], subtasks: [], notes: "",
      recur: null, realMin: t.pm || 0, pomos: 0, createdAt: todayISO(), doneAt: t.done ? (t.d || t.due || todayISO()) : null, archived: false
    };
    switch (t.s) {
      case "AN":
        r.subjectId = /teoría|teoria/i.test(t.t) ? S.ANT : S.ANP;
        r.evalId = evAN.id; r.planId = evAN.id;
        r.type = /teoría|teoria/i.test(t.t) ? "teoria" : (/simulacro|parciales/i.test(t.t) ? "parcial" : "practica");
        break;
      case "CD":
        r.subjectId = /paridad|modulación|modulacion|ancho de banda/i.test(t.t) ? S.CDT : S.CDP;
        r.evalId = evCD.id; r.planId = evCD.id;
        r.type = /parciales|simulacro/i.test(t.t) ? "parcial" : "teoria";
        break;
      case "BD": r.subjectId = S.BD; r.type = /video/i.test(t.t) ? "video" : (/leer|resumir/i.test(t.t) ? "resumen" : "practica"); break;
      case "PE": r.subjectId = S.PE; r.type = /resumen/i.test(t.t) ? "resumen" : "practica"; break;
      case "EC": r.subjectId = S.EC; break;
      case "DS":
        if (/diseño de sistemas/i.test(t.t)) { r.subjectId = S.DSIT; r.type = "lectura"; }
        else r.subjectId = S.DS;
        break;
      case "MQ": r.projectId = projMQ.id; r.evalId = evMQ.id; r.type = /video/i.test(t.t) ? "video" : "tp"; break;
    }
    return r;
  };
  for (const t of old.tasks) {
    if (t.exam) { // los exámenes viejos pasan a ser evaluaciones, no tareas
      if (t.done) { const map = { AN: evAN, CD: evCD, EC: evEC, MQ: evMQ }; if (map[t.s]) map[t.s].status = "rendido"; }
      continue;
    }
    newState.tasks.push(mapTask(t));
  }

  // Hábito de Desarrollo de Software (antes hardcodeado)
  const habit = {
    id: uid(), name: "Proyecto de Desarrollo de Software (1–2 h)",
    desc: "Entender el proyecto y el trabajo de los compañeros, tomar apuntes, subir commits.",
    freq: { kind: "daily", days: [], n: 1 }, start: "2026-07-22", end: null,
    checks: Object.assign({}, old.habit || {}), archived: false, subjectId: S.DS, createdAt: todayISO()
  };
  newState.habits.push(habit);

  // Registro de tiempo (pomodoros por día) -> sesiones
  for (const [date, l] of Object.entries(old.log || {})) {
    if (l && l.p) newState.sessions.push({ id: uid(), date, min: l.p, pomos: l.n || 0, taskId: null, subjectId: null, projectId: null, evalId: null, manual: false, ts: dToDate(date).getTime(), note: "Migrado de la versión anterior" });
    if (l && l.dt) newState.dayLog[date] = { tasksDone: l.dt };
  }
  // Configuración del pomodoro
  if (old.cfg) newState.settings.pomo = { f: old.cfg.f || 25, s: old.cfg.s || 5, l: old.cfg.l || 15, c: old.cfg.c || 4 };

  newState.meta.migratedV1 = true;
  newState.meta.migratedAt = new Date().toISOString();
  return true;
}

async function loadState() {
  // 1) IndexedDB principal
  try { db = await idbOpen(); } catch (e) { db = null; }
  let raw = null;
  if (db) { try { raw = await idbGet("kv", "state"); } catch (e) {} }
  if (!raw && typeof localStorage !== "undefined") raw = localStorage.getItem("aula-state-fallback");
  if (raw) {
    try { const s = JSON.parse(raw); if (validState(s)) { state = normalizeState(s); return; } } catch (e) { console.warn("Estado dañado, intentando backups…"); }
  }
  // 2) Recuperación desde backups automáticos
  if (db) {
    try {
      const keys = (await idbKeys("backups")).sort().reverse();
      for (const k of keys) {
        try { const b = await idbGet("backups", k); const s = JSON.parse(b.data); if (validState(s)) { state = normalizeState(s); toast("Datos recuperados desde una copia de seguridad"); return; } } catch (e) {}
      }
    } catch (e) {}
  }
  // 3) Copia de emergencia en localStorage
  try {
    const em = typeof localStorage !== "undefined" ? localStorage.getItem(EMERGENCY_KEY) : null;
    if (em) { const s = JSON.parse(em); if (validState(s)) { state = normalizeState(s); toast("Datos recuperados desde la copia de emergencia"); return; } }
  } catch (e) {}
  // 4) Estado nuevo + migración desde la app anterior
  state = baseState();
  state.subjects = initialSubjects();
  try { if (typeof localStorage !== "undefined" && localStorage.getItem(OLD_LS_KEY) && migrateV1(state)) toast("Datos de la versión anterior migrados correctamente"); } catch (e) { console.warn("Fallo de migración", e); }
}

/* ============================ LOOKUPS ============================ */
const subjById = id => state.subjects.find(s => s.id === id) || null;
const projById = id => state.projects.find(p => p.id === id) || null;
const evalById = id => state.evals.find(e => e.id === id) || null;
const taskById = id => state.tasks.find(t => t.id === id) || null;
const noteById = id => state.notes.find(n => n.id === id) || null;
const habitById = id => state.habits.find(h => h.id === id) || null;
function ownerOf(t) { // materia o proyecto de una tarea
  if (t.subjectId) { const s = subjById(t.subjectId); if (s) return { name: s.short || s.name, color: s.color, full: s.name }; }
  if (t.projectId) { const p = projById(t.projectId); if (p) return { name: p.name, color: "#64748b", full: p.name }; }
  return null;
}
function activeSubjects() { return state.subjects.filter(s => !s.archived).sort((a, b) => (a.order || 0) - (b.order || 0)); }
const TASK_TYPES = { teoria: "Estudiar teoría", practica: "Resolver práctica", resumen: "Hacer resumen", repaso: "Repasar", video: "Ver video", parcial: "Hacer parcial", tp: "Trabajo práctico", lectura: "Lectura", clase: "Clase", entrega: "Entrega", estudio: "Personalizado" };
const TASK_STATUS = { pend: "Pendiente", prog: "En progreso", done: "Completada", post: "Pospuesta", canc: "Cancelada" };
const EVAL_KINDS = { parcial: "Parcial", recu: "Recuperatorio", final: "Final", presentacion: "Presentación", entrega: "Entrega" };
const EVAL_STATUS = { plan: "Planificado", prep: "Preparando", rendido: "Rendido", aprob: "Aprobado", desaprob: "Desaprobado", reprog: "Reprogramado" };
const PROJ_STATUS = { idea: "Idea", plan: "Planificado", prog: "En progreso", pausa: "Pausado", done: "Completado", arch: "Archivado" };
const PRIO = ["Baja", "Media", "Alta"];

/* ================== RECURRENCIA Y VISIBILIDAD ================== */
function occursOn(t, date) {
  if (!t.recur) return t.date === date;
  if (t.recur.start && date < t.recur.start) return false;
  if (t.recur.end && date > t.recur.end) return false;
  const d = dToDate(date);
  const k = t.recur.kind;
  if (k === "daily") return true;
  if (k === "days") return (t.recur.days || []).includes(d.getDay());
  if (k === "weekly") return d.getDay() === (t.recur.days && t.recur.days.length ? t.recur.days[0] : dToDate(t.recur.start || t.date || todayISO()).getDay());
  if (k === "monthly") return d.getDate() === dToDate(t.recur.start || t.date || todayISO()).getDate();
  if (k === "interval") {
    const base = t.recur.start || t.date || todayISO();
    const diff = Math.round((d - dToDate(base)) / 864e5);
    return diff >= 0 && diff % Math.max(1, t.recur.n || 1) === 0;
  }
  return false;
}
function isDoneOn(t, date) { return t.recur ? !!(t.recurDone && t.recurDone[date]) : t.status === "done"; }
function tasksOn(date) {
  return state.tasks.filter(t => !t.archived && t.status !== "canc" && occursOn(t, date));
}
function overdueTasks() {
  const today = todayISO();
  return state.tasks.filter(t => !t.archived && !t.recur && t.status !== "done" && t.status !== "canc" &&
    ((t.date && t.date < today) || (!t.date && t.due && t.due < today)));
}
function flexibleUpcoming(days) {
  const today = todayISO(), lim = addDays(today, days == null ? state.settings.upcomingDays : days);
  return state.tasks.filter(t => !t.archived && !t.recur && !t.date && t.due && t.status !== "done" && t.status !== "canc" && t.due >= today && t.due <= lim)
    .sort((a, b) => a.due < b.due ? -1 : 1);
}
function upcomingEvals(days) {
  const today = todayISO(), lim = addDays(today, days == null ? 30 : days);
  return state.evals.filter(e => e.date >= today && e.date <= lim && !["rendido", "aprob", "desaprob"].includes(e.status))
    .sort((a, b) => a.date < b.date ? -1 : 1);
}

/* ==================== SESIONES Y ESTADÍSTICAS ==================== */
function addSession(min, opts = {}) {
  const s = { id: uid(), date: opts.date || todayISO(), min: Math.round(min), pomos: opts.pomos || 0, taskId: opts.taskId || null, subjectId: opts.subjectId || null, projectId: opts.projectId || null, evalId: opts.evalId || null, manual: !!opts.manual, ts: Date.now(), note: opts.note || "" };
  // derivar vínculos desde la tarea
  if (s.taskId) { const t = taskById(s.taskId); if (t) { s.subjectId = s.subjectId || t.subjectId; s.projectId = s.projectId || t.projectId; s.evalId = s.evalId || t.evalId; t.realMin = (t.realMin || 0) + s.min; if (opts.pomos) t.pomos = (t.pomos || 0) + opts.pomos; } }
  state.sessions.push(s); change();
  return s;
}
function minsBetween(d1, d2, filter) {
  let tot = 0;
  for (const s of state.sessions) { if (s.date >= d1 && s.date <= d2 && (!filter || filter(s))) tot += s.min; }
  return tot;
}
function pomosBetween(d1, d2) { let n = 0; for (const s of state.sessions) if (s.date >= d1 && s.date <= d2) n += s.pomos || 0; return n; }
function subjectRealMin(id) { return state.sessions.filter(s => s.subjectId === id).reduce((a, s) => a + s.min, 0); }
function projectRealMin(id) { return state.sessions.filter(s => s.projectId === id).reduce((a, s) => a + s.min, 0); }
function evalRealMin(id) { return state.sessions.filter(s => s.evalId === id).reduce((a, s) => a + s.min, 0); }

/* ======================= TOAST / UNDO / CONFIRM ======================= */
let toastTimer = null;
function toast(msg, undoFn) {
  const t = byId("toast"); if (!t) { console.log("[toast]", msg); return; }
  t.innerHTML = esc(msg) + (undoFn ? ' <button onclick="runUndo()">Deshacer</button>' : "");
  ui.undoFn = undoFn || null;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove("show"); ui.undoFn = null; }, undoFn ? 6500 : 2400);
}
function runUndo() { if (ui.undoFn) { ui.undoFn(); ui.undoFn = null; } const t = byId("toast"); if (t) t.classList.remove("show"); }

let confirmCb = null;
function askConfirm(opts) {
  // opts: {title, body, okLabel, danger, onOk, second:{title,body,okLabel}}
  const box = byId("confirmbox"), bg = byId("confirmbg");
  const step = o => {
    box.innerHTML = `<h3>${esc(o.title)}</h3><p class="muted" style="margin-bottom:4px">${o.body}</p>
      <div class="mfoot"><button class="btn" onclick="closeConfirm()">Cancelar</button>
      <button class="btn ${o.danger ? "danger" : "primary"}" id="confirmOkBtn">${esc(o.okLabel || "Aceptar")}</button></div>`;
    byId("confirmOkBtn").onclick = () => {
      if (o.next) step(o.next);
      else { closeConfirm(); if (o.onOk) o.onOk(); }
    };
    byId("confirmOkBtn").focus();
  };
  if (opts.second) { opts.next = Object.assign({ danger: opts.danger, onOk: opts.onOk }, opts.second); }
  bg.classList.add("open");
  step(opts);
}
function closeConfirm() { byId("confirmbg").classList.remove("open"); }
function doubleDelete(what, onOk) {
  askConfirm({
    title: "Eliminar " + what,
    body: "¿Querés eliminar " + what + "?",
    okLabel: "Eliminar", danger: true, onOk,
    second: { title: "Esta acción es definitiva", body: "No vas a poder recuperar estos datos después de unos segundos. ¿Confirmás la eliminación?", okLabel: "Sí, eliminar definitivamente" }
  });
}
/* ========================= ACCIONES: TAREAS ========================= */
function toggleTask(id, date) {
  const t = taskById(id); if (!t) return;
  if (t.recur) {
    const d = date || todayISO();
    t.recurDone = t.recurDone || {};
    if (t.recurDone[d]) delete t.recurDone[d];
    else { t.recurDone[d] = 1; bumpDayDone(d); toast("Completada"); }
  } else if (t.status === "done") {
    t.status = "pend"; t.doneAt = null;
  } else {
    t.status = "done"; t.doneAt = todayISO(); bumpDayDone(todayISO()); toast("Tarea completada");
  }
  change(); render();
}
function bumpDayDone(d) { state.dayLog[d] = state.dayLog[d] || {}; state.dayLog[d].tasksDone = (state.dayLog[d].tasksDone || 0) + 1; }
function postponeTask(id) {
  const t = taskById(id); if (!t || t.recur) return;
  if (t.date) t.date = addDays(t.date < todayISO() ? todayISO() : t.date, 1);
  else if (t.due) t.due = addDays(t.due < todayISO() ? todayISO() : t.due, 1);
  else t.date = addDays(todayISO(), 1);
  t.status = t.status === "done" ? t.status : "post";
  change(); render(); toast("Pospuesta para " + fmtD(t.date || t.due));
}
function duplicateTask(id) {
  const t = taskById(id); if (!t) return;
  const c = JSON.parse(JSON.stringify(t));
  c.id = uid(); c.title = t.title + " (copia)"; c.status = "pend"; c.doneAt = null; c.realMin = 0; c.pomos = 0; c.recurDone = {}; c.createdAt = todayISO();
  state.tasks.push(c); change(); render(); toast("Tarea duplicada");
}
function archiveTask(id) {
  const t = taskById(id); if (!t) return;
  t.archived = !t.archived; change(); render(); toast(t.archived ? "Tarea archivada" : "Tarea restaurada");
}
function deleteTask(id) {
  const t = taskById(id); if (!t) return;
  doubleDelete("la tarea “" + t.title.slice(0, 40) + "”", () => {
    const idx = state.tasks.indexOf(t);
    state.tasks.splice(idx, 1); change(); closeModal(); render();
    toast("Tarea eliminada", () => { state.tasks.splice(idx, 0, t); change(); render(); });
  });
}
function quickAddTask(data) {
  const t = {
    id: uid(), title: data.title, desc: data.desc || "", subjectId: data.subjectId || null, projectId: data.projectId || null,
    evalId: data.evalId || null, planId: data.planId || null, date: data.date || null, due: data.due || null,
    estMin: data.estMin || 0, prio: data.prio == null ? 1 : data.prio, status: "pend", type: data.type || "estudio",
    tags: data.tags || [], subtasks: [], notes: "", recur: data.recur || null, recurDone: {}, realMin: 0, pomos: 0,
    createdAt: todayISO(), doneAt: null, archived: false
  };
  state.tasks.push(t); change();
  return t;
}
function toggleSubtask(taskId, stId) {
  const t = taskById(taskId); if (!t) return;
  const st = (t.subtasks || []).find(x => x.id === stId); if (!st) return;
  st.done = !st.done; change();
  const box = byId("modalbox"); if (box && byId("te_title")) renderTaskEditorSubtasks(t);
  render();
}

/* ======================== ACCIONES: MATERIAS ======================== */
function saveSubjectFromModal(id) {
  const name = byId("su_name").value.trim();
  if (!name) { toast("Falta el nombre de la materia"); return; }
  const data = { name, short: byId("su_short").value.trim().toUpperCase() || name.slice(0, 3).toUpperCase(), color: byId("su_color").value, icon: byId("su_icon").value.trim().slice(0, 2) || name.slice(0, 2) };
  if (id) { Object.assign(subjById(id), data); toast("Materia actualizada"); }
  else { state.subjects.push(Object.assign({ id: uid(), archived: false, order: state.subjects.length, createdAt: todayISO() }, data)); toast("Materia creada"); }
  change(); closeModal(); render();
}
function archiveSubject(id) {
  const s = subjById(id); if (!s) return;
  s.archived = !s.archived; change(); render();
  toast(s.archived ? "Materia archivada" : "Materia reactivada");
}
function deleteSubject(id) {
  const s = subjById(id); if (!s) return;
  const n = state.tasks.filter(t => t.subjectId === id).length;
  doubleDelete("la materia “" + s.name + "”" + (n ? " y desvincular " + n + " tareas" : ""), () => {
    const idx = state.subjects.indexOf(s); const snapshot = JSON.parse(JSON.stringify(state.tasks));
    state.subjects.splice(idx, 1);
    for (const t of state.tasks) if (t.subjectId === id) t.subjectId = null;
    change(); closeModal(); go("subjects");
    toast("Materia eliminada", () => { state.subjects.splice(idx, 0, s); state.tasks = snapshot; change(); render(); });
  });
}
function moveSubject(id, dir) {
  const list = activeSubjects();
  const i = list.findIndex(s => s.id === id); if (i < 0) return;
  const j = i + dir; if (j < 0 || j >= list.length) return;
  const oa = list[i].order, ob = list[j].order;
  list[i].order = ob; list[j].order = oa;
  change(); render();
}

/* ======================== ACCIONES: PROYECTOS ======================== */
function saveProjectFromModal(id) {
  const name = byId("pr_name").value.trim();
  if (!name) { toast("Falta el nombre del proyecto"); return; }
  const data = { name, desc: byId("pr_desc").value, due: byId("pr_due").value || null, status: byId("pr_status").value };
  if (id) { Object.assign(projById(id), data); toast("Proyecto actualizado"); }
  else { state.projects.push(Object.assign({ id: uid(), createdAt: todayISO(), milestones: [], subjectIds: [] }, data)); toast("Proyecto creado"); }
  change(); closeModal(); render();
}
function deleteProject(id) {
  const p = projById(id); if (!p) return;
  doubleDelete("el proyecto “" + p.name + "”", () => {
    const idx = state.projects.indexOf(p); const snap = JSON.parse(JSON.stringify(state.tasks));
    state.projects.splice(idx, 1);
    for (const t of state.tasks) if (t.projectId === id) t.projectId = null;
    change(); closeModal(); go("projects");
    toast("Proyecto eliminado", () => { state.projects.splice(idx, 0, p); state.tasks = snap; change(); render(); });
  });
}
function addMilestone(projId) {
  const inp = byId("ms_new"); if (!inp || !inp.value.trim()) return;
  const p = projById(projId); if (!p) return;
  p.milestones = p.milestones || [];
  p.milestones.push({ id: uid(), t: inp.value.trim(), done: false });
  inp.value = ""; change(); render();
}
function toggleMilestone(projId, msId) {
  const p = projById(projId); if (!p) return;
  const m = (p.milestones || []).find(x => x.id === msId); if (m) { m.done = !m.done; change(); render(); }
}
function delMilestone(projId, msId) {
  const p = projById(projId); if (!p) return;
  p.milestones = (p.milestones || []).filter(x => x.id !== msId); change(); render();
}

/* ====================== ACCIONES: EVALUACIONES ====================== */
function saveEvalFromModal(id) {
  const name = byId("ev_name").value.trim();
  if (!name) { toast("Falta el nombre de la evaluación"); return; }
  const linkVal = byId("ev_link").value;
  const data = {
    name, kind: byId("ev_kind").value, date: byId("ev_date").value || todayISO(), time: byId("ev_time").value,
    mode: byId("ev_mode").value, place: byId("ev_place").value, status: byId("ev_status").value,
    targetGrade: byId("ev_tgrade").value, grade: byId("ev_grade").value, reviewDays: parseInt(byId("ev_rev").value) || 0,
    obs: byId("ev_obs").value,
    subjectId: linkVal.startsWith("s:") ? linkVal.slice(2) : null,
    projectId: linkVal.startsWith("p:") ? linkVal.slice(2) : null
  };
  if (id) { Object.assign(evalById(id), data); toast("Evaluación actualizada"); change(); closeModal(); render(); }
  else {
    const ev = Object.assign({ id: uid(), topics: [], createdAt: todayISO() }, data);
    state.evals.push(ev); change(); closeModal();
    toast("Evaluación creada");
    go("eval", ev.id);
  }
}
function deleteEval(id) {
  const e = evalById(id); if (!e) return;
  const n = state.tasks.filter(t => t.evalId === id).length;
  doubleDelete("la evaluación “" + e.name + "”" + (n ? " (sus " + n + " tareas quedan desvinculadas)" : ""), () => {
    const idx = state.evals.indexOf(e); const snap = JSON.parse(JSON.stringify(state.tasks));
    state.evals.splice(idx, 1);
    for (const t of state.tasks) if (t.evalId === id) { t.evalId = null; t.planId = null; }
    change(); closeModal(); go("evals");
    toast("Evaluación eliminada", () => { state.evals.splice(idx, 0, e); state.tasks = snap; change(); render(); });
  });
}
function addTopic(evId) {
  const inp = byId("tp_new"), min = byId("tp_min"), diff = byId("tp_diff");
  if (!inp || !inp.value.trim()) { toast("Escribí el nombre del tema"); return; }
  const e = evalById(evId); if (!e) return;
  e.topics.push({ id: uid(), name: inp.value.trim(), diff: parseInt(diff.value) || 2, estMin: parseInt(min.value) || 60, state: "nv", done: false });
  inp.value = ""; change(); render();
}
function setTopicState(evId, tpId, val) {
  const e = evalById(evId); if (!e) return;
  const tp = e.topics.find(x => x.id === tpId); if (!tp) return;
  tp.state = val; tp.done = (val === "dom" || val === "ent");
  change(); render();
}
function delTopic(evId, tpId) {
  const e = evalById(evId); if (!e) return;
  e.topics = e.topics.filter(x => x.id !== tpId); change(); render();
}
function evalPlanTasks(evId) { return state.tasks.filter(t => t.planId === evId && !t.archived); }
function evalPrep(e) {
  // nivel de preparación: temas + tareas del plan + simulacros
  const topics = e.topics || [];
  const tW = topics.length ? topics.reduce((a, t) => a + (t.state === "dom" ? 1 : t.state === "ent" ? .75 : t.state === "emp" ? .35 : 0), 0) / topics.length : null;
  const plan = evalPlanTasks(e.id);
  const pW = plan.length ? plan.filter(t => t.status === "done").length / plan.length : null;
  const parts = [tW, pW].filter(x => x !== null);
  if (!parts.length) return null;
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length * 100);
}

/* ===================== GENERADOR DE PLANES ===================== */
function generatePlan(evId, opts) {
  /* opts: {start, intensity:'l'|'n'|'i', blockedWeekdays:[0..6], preferredWeekdays:[], allowExamDay:bool,
            genTheory:bool, genPractice:bool, genSummary:bool, replaceExisting:bool} */
  const e = evalById(evId); if (!e) return { ok: false, msg: "Evaluación inexistente" };
  const topics = (e.topics || []).filter(t => t.state !== "dom");
  if (!topics.length && !e.reviewDays) return { ok: false, msg: "Cargá temas o días de repaso antes de generar el plan" };
  const start = opts.start || todayISO();
  const lastDay = opts.allowExamDay ? e.date : addDays(e.date, -1);
  if (start > lastDay) return { ok: false, msg: "No hay días disponibles entre el inicio y el examen" };

  // días disponibles
  let days = [];
  for (let d = start; d <= lastDay; d = addDays(d, 1)) {
    const wd = dToDate(d).getDay();
    if ((opts.blockedWeekdays || []).includes(wd)) continue;
    days.push(d);
  }
  if (!days.length) return { ok: false, msg: "Todos los días del rango están bloqueados" };
  const revDays = clamp(e.reviewDays || 0, 0, Math.max(0, days.length - 1));
  const studyDays = days.slice(0, days.length - revDays);
  const reviewDays = days.slice(days.length - revDays);
  const guide = opts.intensity === "l" ? 150 : opts.intensity === "i" ? 360 : 240; // minutos orientativos por día (no es un límite)

  // limpiar plan anterior (solo tareas no completadas; el progreso hecho nunca se borra)
  if (opts.replaceExisting) {
    state.tasks = state.tasks.filter(t => !(t.planId === evId && t.status !== "done"));
  }

  // tareas por tema, más difíciles primero
  const sorted = [...topics].sort((a, b) => (b.diff || 2) - (a.diff || 2));
  const jobs = [];
  for (const tp of sorted) {
    const total = tp.estMin || 60;
    const parts = [];
    if (tp.state === "nv" && opts.genTheory !== false) parts.push({ type: "teoria", label: "Estudiar teoría — " + tp.name, frac: opts.genPractice === false ? 1 : .5 });
    if ((tp.state === "nv" || tp.state === "emp") && opts.genPractice !== false) parts.push({ type: "practica", label: "Resolver práctica — " + tp.name, frac: (tp.state === "nv" && opts.genTheory !== false) ? .5 : 1 });
    if (tp.state === "ent") parts.push({ type: "repaso", label: "Repasar — " + tp.name, frac: 1 });
    if (opts.genSummary && tp.state !== "ent") parts.push({ type: "resumen", label: "Resumen — " + tp.name, frac: .25 });
    const fsum = parts.reduce((a, p) => a + p.frac, 0) || 1;
    for (const p of parts) jobs.push({ type: p.type, title: p.label, min: Math.max(20, Math.round(total * p.frac / fsum)), diff: tp.diff || 2, topicId: tp.id });
  }

  // distribución: llenar días secuencialmente hasta la guía; desborde en round-robin (sin límite rígido)
  const load = {}; studyDays.forEach(d => load[d] = 0);
  const isPref = d => (opts.preferredWeekdays || []).length ? opts.preferredWeekdays.includes(dToDate(d).getDay()) : true;
  let created = 0;
  if (studyDays.length) {
    let di = 0;
    for (const job of jobs) {
      // buscar el próximo día con espacio, priorizando preferidos
      let placed = false, tries = 0;
      while (!placed && tries < studyDays.length * 2) {
        const d = studyDays[di % studyDays.length];
        const bonus = isPref(d) ? 0 : guide * .3; // los no preferidos se consideran "más llenos"
        if (load[d] + bonus < guide || tries >= studyDays.length) {
          quickAddTask({ title: job.title, subjectId: e.subjectId, projectId: e.projectId, evalId: evId, planId: evId, date: d, estMin: job.min, type: job.type, prio: job.diff >= 3 ? 2 : 1 });
          load[d] += job.min; created++; placed = true;
        }
        di++; tries++;
      }
      if (!placed) { const d = studyDays[0]; quickAddTask({ title: job.title, subjectId: e.subjectId, projectId: e.projectId, evalId: evId, planId: evId, date: d, estMin: job.min, type: job.type }); created++; }
    }
  }
  // días de repaso: repaso general + simulacro
  for (let i = 0; i < reviewDays.length; i++) {
    const d = reviewDays[i];
    quickAddTask({ title: "Repaso general — temas más difíciles", subjectId: e.subjectId, projectId: e.projectId, evalId: evId, planId: evId, date: d, estMin: Math.round(guide * .45), type: "repaso" });
    quickAddTask({ title: i === reviewDays.length - 1 ? "Simulacro final / parcial anterior" : "Parcial anterior o simulacro", subjectId: e.subjectId, projectId: e.projectId, evalId: evId, planId: evId, date: d, estMin: Math.round(guide * .55), type: "parcial", prio: 2 });
    created += 2;
  }
  if (e.status === "plan") e.status = "prep";
  change();
  return { ok: true, msg: created + " tareas planificadas", created };
}
function replanPending(evId) {
  const e = evalById(evId); if (!e) return;
  const pend = state.tasks.filter(t => t.planId === evId && t.status !== "done" && t.status !== "canc" && !t.archived);
  if (!pend.length) { toast("No hay tareas pendientes para replanificar"); return; }
  const start = todayISO();
  const lastDay = addDays(e.date, -1);
  if (start > lastDay) { toast("El examen ya está encima: no quedan días para replanificar"); return; }
  const days = []; for (let d = start; d <= lastDay; d = addDays(d, 1)) days.push(d);
  const rev = clamp(e.reviewDays || 0, 0, days.length - 1);
  const study = days.slice(0, days.length - rev), review = days.slice(days.length - rev);
  const revTasks = pend.filter(t => t.type === "repaso" || t.type === "parcial");
  const stTasks = pend.filter(t => !revTasks.includes(t));
  const target = study.length ? study : days;
  stTasks.forEach((t, i) => { t.date = target[i % target.length]; if (t.status === "post") t.status = "pend"; });
  const rTarget = review.length ? review : days.slice(-1);
  revTasks.forEach((t, i) => { t.date = rTarget[i % rTarget.length]; if (t.status === "post") t.status = "pend"; });
  change(); render(); toast(pend.length + " tareas redistribuidas hasta el " + fmtD(lastDay));
}

/* ========================== HÁBITOS ========================== */
function habitDueOn(h, date) {
  if (h.archived) return false;
  if (h.start && date < h.start) return false;
  if (h.end && date > h.end) return false;
  const d = dToDate(date), k = h.freq.kind;
  if (k === "daily") return true;
  if (k === "days") return (h.freq.days || []).includes(d.getDay());
  if (k === "weekly") return d.getDay() === (h.freq.days && h.freq.days.length ? h.freq.days[0] : 1);
  if (k === "monthly") return d.getDate() === (h.freq.n || 1);
  if (k === "interval") { const base = h.start || todayISO(); const diff = Math.round((d - dToDate(base)) / 864e5); return diff >= 0 && diff % Math.max(1, h.freq.n || 2) === 0; }
  return false;
}
function toggleHabit(id, date) {
  const h = habitById(id); if (!h) return;
  const d = date || todayISO();
  h.checks = h.checks || {};
  if (h.checks[d]) delete h.checks[d]; else { h.checks[d] = 1; toast("Hábito registrado"); }
  change(); render();
}
function habitStreak(h) {
  let n = 0; let d = todayISO();
  if (!h.checks || (!h.checks[d] && habitDueOn(h, d))) d = addDays(d, -1); // hoy todavía puede completarse
  for (let i = 0; i < 3700; i++) {
    if (!habitDueOn(h, d)) { d = addDays(d, -1); continue; }
    if (h.checks && h.checks[d]) { n++; d = addDays(d, -1); } else break;
  }
  return n;
}
function habitBest(h) {
  const days = Object.keys(h.checks || {}).sort();
  if (!days.length) return habitStreak(h);
  let best = 0, cur = 0, prev = null;
  for (const d of days) {
    if (prev) { let x = addDays(prev, 1); while (x < d && !habitDueOn(h, x)) x = addDays(x, 1); cur = (x === d) ? cur + 1 : 1; }
    else cur = 1;
    best = Math.max(best, cur); prev = d;
  }
  return Math.max(best, habitStreak(h));
}
function habitWeekPct(h) {
  const ws = weekStartOf(todayISO(), state.settings.weekStart);
  let due = 0, done = 0;
  for (let i = 0; i < 7; i++) { const d = addDays(ws, i); if (d > todayISO()) break; if (habitDueOn(h, d)) { due++; if (h.checks && h.checks[d]) done++; } }
  return due ? Math.round(done / due * 100) : null;
}
function saveHabitFromModal(id) {
  const name = byId("h_name").value.trim();
  if (!name) { toast("Falta el nombre del hábito"); return; }
  const kind = byId("h_kind").value;
  const days = [...document.querySelectorAll(".h_day:checked")].map(x => parseInt(x.value));
  const data = {
    name, desc: byId("h_desc").value, subjectId: byId("h_subj").value || null,
    freq: { kind, days, n: parseInt(byId("h_n").value) || 2 },
    start: byId("h_start").value || todayISO(), end: byId("h_end").value || null
  };
  if (kind === "days" && !days.length) { toast("Elegí al menos un día de la semana"); return; }
  if (id) { Object.assign(habitById(id), data); toast("Hábito actualizado"); }
  else { state.habits.push(Object.assign({ id: uid(), checks: {}, archived: false, createdAt: todayISO() }, data)); toast("Hábito creado"); }
  change(); closeModal(); render();
}
function deleteHabit(id) {
  const h = habitById(id); if (!h) return;
  doubleDelete("el hábito “" + h.name + "” y su historial", () => {
    const idx = state.habits.indexOf(h);
    state.habits.splice(idx, 1); change(); closeModal(); render();
    toast("Hábito eliminado", () => { state.habits.splice(idx, 0, h); change(); render(); });
  });
}

/* =========================== NOTAS =========================== */
function saveNoteFromModal(id) {
  const title = byId("n_title").value.trim();
  const body = byId("n_body").value;
  if (!title && !body.trim()) { toast("La nota está vacía"); return; }
  const linkVal = byId("n_link").value;
  const data = {
    title: title || "(sin título)", body,
    subjectId: linkVal.startsWith("s:") ? linkVal.slice(2) : null,
    projectId: linkVal.startsWith("p:") ? linkVal.slice(2) : null,
    evalId: linkVal.startsWith("e:") ? linkVal.slice(2) : null,
    taskId: linkVal.startsWith("t:") ? linkVal.slice(2) : null,
    tags: byId("n_tags").value.split(",").map(x => x.trim()).filter(Boolean),
    updatedAt: new Date().toISOString()
  };
  if (id) { Object.assign(noteById(id), data); }
  else { state.notes.push(Object.assign({ id: uid(), pinned: false, createdAt: new Date().toISOString() }, data)); }
  change(); closeModal(); render(); toast("Nota guardada");
}
function pinNote(id) { const n = noteById(id); if (n) { n.pinned = !n.pinned; change(); render(); } }
function deleteNote(id) {
  const n = noteById(id); if (!n) return;
  doubleDelete("la nota “" + (n.title || "").slice(0, 30) + "”", () => {
    const idx = state.notes.indexOf(n);
    state.notes.splice(idx, 1); change(); closeModal(); render();
    toast("Nota eliminada", () => { state.notes.splice(idx, 0, n); change(); render(); });
  });
}
function mdLite(src) {
  // Mini-formato seguro: escapa primero, luego aplica encabezados, listas y negrita.
  const lines = esc(src || "").split("\n");
  let out = [], inUl = false, inOl = false;
  const close = () => { if (inUl) { out.push("</ul>"); inUl = false; } if (inOl) { out.push("</ol>"); inOl = false; } };
  for (const ln of lines) {
    if (/^###\s/.test(ln)) { close(); out.push("<h6 style='font-size:.78rem;margin:8px 0 3px'>" + ln.slice(4) + "</h6>"); }
    else if (/^##\s/.test(ln)) { close(); out.push("<h5 style='font-size:.85rem;margin:9px 0 3px'>" + ln.slice(3) + "</h5>"); }
    else if (/^#\s/.test(ln)) { close(); out.push("<h4 style='font-size:.95rem;margin:10px 0 4px'>" + ln.slice(2) + "</h4>"); }
    else if (/^[-*]\s/.test(ln)) { if (!inUl) { close(); out.push("<ul style='margin:4px 0 4px 18px'>"); inUl = true; } out.push("<li>" + ln.slice(2) + "</li>"); }
    else if (/^\d+[.)]\s/.test(ln)) { if (!inOl) { close(); out.push("<ol style='margin:4px 0 4px 18px'>"); inOl = true; } out.push("<li>" + ln.replace(/^\d+[.)]\s/, "") + "</li>"); }
    else if (ln.trim() === "") { close(); out.push("<div style='height:6px'></div>"); }
    else { close(); out.push("<p style='margin:2px 0'>" + ln + "</p>"); }
  }
  close();
  return out.join("").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code style='background:var(--card2);padding:0 4px;border-radius:4px'>$1</code>");
}

/* ========================= POMODORO ========================= */
function phaseDur(p) { const c = state.settings.pomo; return (p === "focus" ? c.f : p === "long" ? c.l : c.s) * 60; }
function beep() {
  if (!state.settings.sounds) return;
  try {
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    [0, .18, .36].forEach((d, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = i === 2 ? 880 : 660; o.type = "sine";
      g.gain.setValueAtTime(.2, ctx.currentTime + d); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + d + .16);
      o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + .17);
    });
  } catch (e) {}
}
function notify(msg) {
  if (!state.settings.notif) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try { new Notification("Aula", { body: msg }); } catch (e) {}
}
function startPomo(taskId) {
  const T = state.timer;
  if (taskId !== undefined) { T.taskId = taskId; const t = taskId && taskById(taskId); if (t) { T.subjectId = t.subjectId; T.projectId = t.projectId; } }
  T.run = true; T.ends = Date.now() + T.left * 1000;
  change(); renderPomoUI();
}
function pausePomo() { const T = state.timer; if (!T.run) return; T.run = false; T.left = Math.max(0, Math.round((T.ends - Date.now()) / 1000)); T.ends = null; change(); renderPomoUI(); }
function resetPomo() { const T = state.timer; T.run = false; T.ends = null; T.phase = "focus"; T.cycle = 0; T.left = T.total = phaseDur("focus"); change(); renderPomoUI(); }
function skipPomo() { endPhase(false); }
function pomoSetLink(val) {
  const T = state.timer;
  T.taskId = null; T.subjectId = null; T.projectId = null;
  if (val.startsWith("t:")) { T.taskId = val.slice(2); const t = taskById(T.taskId); if (t) { T.subjectId = t.subjectId; T.projectId = t.projectId; } }
  else if (val.startsWith("s:")) T.subjectId = val.slice(2);
  else if (val.startsWith("p:")) T.projectId = val.slice(2);
  change();
}
function endPhase(credit) {
  const T = state.timer;
  if (T.phase === "focus") {
    if (credit) {
      addSession(state.settings.pomo.f, { pomos: 1, taskId: T.taskId, subjectId: T.subjectId, projectId: T.projectId });
      toast("Pomodoro completado — descanso"); notify("Pomodoro completado. Tomate un descanso."); beep();
    }
    T.cycle++;
    T.phase = (T.cycle % state.settings.pomo.c === 0) ? "long" : "short";
    T.left = T.total = phaseDur(T.phase);
    T.run = true; T.ends = Date.now() + T.left * 1000;
  } else {
    if (credit) { toast("Fin del descanso"); notify("Fin del descanso. Siguiente pomodoro."); beep(); }
    T.phase = "focus"; T.left = T.total = phaseDur("focus");
    T.run = false; T.ends = null;
  }
  change();
  if (route.view === "pomodoro" || route.view === "home") render(); else renderPomoUI();
}
function pomoTick() {
  const T = state.timer;
  if (!T.run || !T.ends) return;
  T.left = Math.max(0, Math.round((T.ends - Date.now()) / 1000));
  if (T.left <= 0) { endPhase(true); return; }
  updatePomoTime();
}
function fmtClock(sec) { return pad(Math.floor(sec / 60)) + ":" + pad(sec % 60); }
function updatePomoTime() {
  const T = state.timer, s = fmtClock(T.left);
  const el = byId("ptime"); if (el) el.textContent = s;
  const bar = byId("pfill"); if (bar) bar.style.width = (100 - T.left / T.total * 100) + "%";
  const mp = byId("mp_time"); if (mp) mp.textContent = s;
  document.title = T.run ? s + " · " + (T.phase === "focus" ? "Foco" : "Descanso") + " — Aula" : "Aula · Organizador académico";
}
function renderPomoUI() {
  // barra flotante (visible fuera de la vista Pomodoro cuando hay sesión activa o pausada a medias)
  const T = state.timer, mp = byId("minipomo");
  if (mp) {
    const active = T.run || T.left !== T.total || T.phase !== "focus";
    if (active && route.view !== "pomodoro") {
      mp.classList.add("show");
      mp.innerHTML = `<span class="ph" style="color:${T.phase === "focus" ? "var(--acc)" : "var(--ok)"}">${T.phase === "focus" ? "Foco" : "Descanso"}</span>
        <span class="tm" id="mp_time">${fmtClock(T.left)}</span>
        <span class="tiny">${T.run ? "en curso" : "en pausa"}</span>`;
    } else mp.classList.remove("show");
  }
  if (route.view === "pomodoro") renderPomoView();
  updatePomoTime();
}
function logManualSession() {
  const min = parseInt(byId("ms_min").value) || 0;
  if (min <= 0) { toast("Ingresá los minutos"); return; }
  const link = byId("ms_link").value, date = byId("ms_date").value || todayISO();
  const o = { manual: true, date, note: byId("ms_note").value };
  if (link.startsWith("t:")) o.taskId = link.slice(2);
  else if (link.startsWith("s:")) o.subjectId = link.slice(2);
  else if (link.startsWith("p:")) o.projectId = link.slice(2);
  else if (link.startsWith("e:")) o.evalId = link.slice(2);
  addSession(min, o);
  closeModal(); render(); toast("Sesión de " + fmtMin(min) + " registrada");
}

/* ======================== NOTIFICACIONES ======================== */
function checkReminders() {
  if (!state.settings.notif || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const today = todayISO();
  const notified = state.meta.notified = state.meta.notified || {};
  const fire = (key, msg) => { if (notified[key] === today) return; notified[key] = today; try { new Notification("Aula", { body: msg }); } catch (e) {} };
  for (const e of upcomingEvals(state.settings.upcomingDays)) {
    const n = daysTo(e.date);
    if (n <= state.settings.upcomingDays) fire("ev-" + e.id, e.name + " — " + (n === 0 ? "es hoy" : n === 1 ? "es mañana" : "en " + n + " días"));
  }
  for (const t of state.tasks) {
    if (t.archived || t.recur || t.status === "done" || t.status === "canc") continue;
    if (t.due === today) fire("due-" + t.id, "Vence hoy: " + t.title.slice(0, 60));
  }
  change();
}
/* ========================= ROUTER / SIDEBAR ========================= */
const VIEWS = [
  ["home", "Inicio"], ["today", "Hoy"], ["calendar", "Calendario"], ["week", "Semana"],
  ["subjects", "Materias"], ["evals", "Parciales y finales"], ["projects", "Proyectos"],
  ["plans", "Planes de estudio"], ["notes", "Notas"], ["pomodoro", "Pomodoro"], ["habits", "Hábitos"],
  ["stats", "Estadísticas"], ["history", "Historial"], ["backups", "Copias de seguridad"], ["config", "Configuración"]
];
function go(view, id) { location.hash = "#/" + view + (id ? "/" + id : ""); }
function parseHash() {
  const h = (location.hash || "").replace(/^#\/?/, "").split("/");
  route.view = h[0] || "home"; route.id = h[1] || null;
  if (!VIEWS.some(v => v[0] === route.view) && !["subject", "eval", "project", "list"].includes(route.view)) route.view = "home";
}
function toggleSidebar(force) {
  const open = force !== undefined ? force : !document.body.classList.contains("sb-open");
  document.body.classList.toggle("sb-open", open);
  const small = window.innerWidth < 980;
  byId("sbBackdrop").style.display = open && small ? "block" : "none";
  try { localStorage.setItem("aula-sb", open ? "1" : "0"); } catch (e) {}
}
function renderSidebar() {
  const sb = byId("sidebar");
  const item = (v, label) => `<a href="#/${v}" class="${route.view === v || (v === "subjects" && route.view === "subject") || (v === "evals" && route.view === "eval") || (v === "projects" && route.view === "project") ? "on" : ""}">${label}</a>`;
  sb.innerHTML =
    '<div class="sec">Planificar</div>' + VIEWS.slice(0, 4).map(v => item(v[0], v[1])).join("") +
    item("list", "Lista completa") +
    '<div class="sec">Organizar</div>' + VIEWS.slice(4, 9).map(v => item(v[0], v[1])).join("") +
    '<div class="sec">Estudiar</div>' + VIEWS.slice(9, 12).map(v => item(v[0], v[1])).join("") +
    '<div class="sec">Sistema</div>' + VIEWS.slice(12).map(v => item(v[0], v[1])).join("") +
    '<div style="padding:14px 10px" class="tiny">Aula v' + APP_VERSION + "</div>";
}
function renderTop() {
  const d = new Date();
  const el = byId("topDate"); if (el) el.textContent = capitalize(DAYSL[d.getDay()]) + " " + d.getDate() + " de " + MESL[d.getMonth()];
  const ne = byId("nextEv");
  if (ne) {
    const evs = upcomingEvals(60);
    if (evs.length) { const e = evs[0]; const n = daysTo(e.date); ne.style.display = ""; ne.innerHTML = `${esc(e.name)} · <b>${n === 0 ? "HOY" : n === 1 ? "mañana" : "en " + n + " días"}</b>`; }
    else ne.style.display = "none";
  }
}

/* ========================= RENDER PRINCIPAL ========================= */
function render() {
  parseHash();
  renderSidebar(); renderTop();
  const v = byId("view");
  const map = {
    home: viewHome, today: viewToday, calendar: viewCalendar, week: viewWeek, list: viewList,
    subjects: viewSubjects, subject: viewSubjectDetail, evals: viewEvals, eval: viewEvalDetail,
    projects: viewProjects, project: viewProjectDetail, plans: viewPlans, notes: viewNotes,
    pomodoro: viewPomodoro, habits: viewHabits, stats: viewStats, history: viewHistory,
    backups: viewBackups, config: viewConfig
  };
  v.innerHTML = (map[route.view] || viewHome)();
  if (route.view === "backups") fillBackupsList();
  if (route.view === "pomodoro") renderPomoView();
  renderPomoUI();
}

/* ====================== RENDER DE FILAS DE TAREA ====================== */
function taskRow(t, opts = {}) {
  const date = opts.date || todayISO();
  const done = isDoneOn(t, date);
  const o = ownerOf(t);
  const ev = t.evalId && evalById(t.evalId);
  const sub = t.subtasks && t.subtasks.length ? `<span class="tiny">${t.subtasks.filter(s => s.done).length}/${t.subtasks.length} sub</span>` : "";
  const dateBit = opts.showDate ? (t.recur ? '<span class="tiny">recurrente</span>' : t.date ? `<span class="mins">${fmtD(t.date)}</span>` : t.due ? `<span class="mins">vence ${fmtD(t.due)}</span>` : "") :
    (t.due && !t.date ? `<span class="mins">vence ${fmtD(t.due)}</span>` : "");
  const late = !t.recur && t.status !== "done" && ((t.date && t.date < todayISO()) || (!t.date && t.due && t.due < todayISO()));
  return `<div class="task ${done ? "done" : ""}" onclick="openTaskEditor('${t.id}')">
    <div class="cb ${done ? "on" : ""}" role="checkbox" aria-checked="${done}" tabindex="0" title="${done ? "Desmarcar" : "Completar"}"
      onclick="event.stopPropagation();toggleTask('${t.id}','${date}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();toggleTask('${t.id}','${date}')}">${done ? "✓" : ""}</div>
    <div class="tinfo">
      <div class="tt">${esc(t.title)}${late ? ' <span class="pill bad">atrasada</span>' : ""}${t.status === "prog" ? ' <span class="pill acc">en progreso</span>' : ""}${t.status === "post" ? ' <span class="pill warn">pospuesta</span>' : ""}</div>
      <div class="tmeta">
        ${o ? `<span class="tag" style="background:${o.color}1c;color:${o.color};border:1px solid ${o.color}40">${esc(o.name)}</span>` : ""}
        ${t.estMin ? `<span class="mins">${fmtMin(t.estMin)}</span>` : ""}
        ${t.prio === 2 ? '<span class="prio2">! alta</span>' : t.prio === 0 ? '<span class="prio0">baja</span>' : ""}
        ${dateBit} ${sub}
        ${ev && opts.showEval !== false ? `<span class="tiny">→ ${esc(ev.name.slice(0, 26))}</span>` : ""}
        ${(t.tags || []).map(x => `<span class="tiny">#${esc(x)}</span>`).join(" ")}
      </div>
    </div>
    <div class="tactions" onclick="event.stopPropagation()">
      <button title="Empezar pomodoro" onclick="startFromTask('${t.id}')">▸</button>
      ${!t.recur ? `<button title="Posponer para mañana" onclick="postponeTask('${t.id}')">+1d</button>` : ""}
      <button title="Editar" onclick="openTaskEditor('${t.id}')">Editar</button>
    </div>
  </div>`;
}
function startFromTask(id) { startPomo(id); go("pomodoro"); }

/* ============================ VISTA: INICIO ============================ */
function viewHome() {
  const today = todayISO();
  const dayTasks = tasksOn(today).sort((a, b) => (b.prio - a.prio) || ((a.estMin || 0) - (b.estMin || 0)));
  const od = overdueTasks();
  const flex = flexibleUpcoming();
  const evs = upcomingEvals(state.settings.upcomingDays + 14);
  const est = dayTasks.filter(t => !isDoneOn(t, today)).reduce((a, t) => a + (t.estMin || 0), 0);
  const done = dayTasks.filter(t => isDoneOn(t, today));
  const donePct = dayTasks.length ? Math.round(done.length / dayTasks.length * 100) : 0;
  const focusToday = minsBetween(today, today);
  const habitsToday = state.habits.filter(h => habitDueOn(h, today));

  let h = `<div class="vhead"><h2>${saludo()}</h2><span class="sub">${fmtDFull(today)}</span><div class="grow"></div>
    <button class="btn" onclick="go('pomodoro')">Empezar a estudiar</button>
    <button class="btn primary" onclick="openQuick()">Agregar</button></div>`;

  // métricas del día
  h += `<div class="grid3" style="margin-bottom:12px">
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(est)}</div><div class="statlab">restante estimado para hoy${est > 420 ? ' · <span style="color:var(--warn)">día muy cargado</span>' : ""}</div></div>
    <div class="card" style="margin:0"><div class="statnum">${done.length}/${dayTasks.length}</div><div class="statlab">tareas de hoy (${donePct}%)</div>
      <div class="pbar" style="margin-top:6px"><i style="width:${donePct}%"></i></div></div>
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(focusToday)}</div><div class="statlab">estudiado hoy</div></div>
  </div>`;

  // evaluaciones cercanas
  if (evs.length) {
    h += `<div class="card"><h3>Próximas evaluaciones<div class="grow"></div><button class="btn sm ghost" onclick="go('evals')">Ver todas</button></h3>`;
    h += evs.slice(0, 4).map(e => {
      const n = daysTo(e.date), o = e.subjectId ? subjById(e.subjectId) : null, p = e.projectId ? projById(e.projectId) : null;
      const prep = evalPrep(e);
      return `<div class="task" onclick="go('eval','${e.id}')">
        <span class="pill ${n <= 2 ? "bad" : n <= 7 ? "warn" : "acc"}" style="min-width:74px;text-align:center">${n === 0 ? "HOY" : n === 1 ? "mañana" : "en " + n + " días"}</span>
        <div class="tinfo"><div class="tt"><b>${esc(e.name)}</b></div>
        <div class="tmeta"><span class="tiny">${EVAL_KINDS[e.kind] || e.kind} · ${fmtD(e.date)}${e.time ? " · " + esc(e.time) : ""}</span>
        ${o ? `<span class="tag" style="background:${o.color}1c;color:${o.color}">${esc(o.short)}</span>` : ""}${p ? `<span class="tiny">${esc(p.name)}</span>` : ""}
        ${prep !== null ? `<span class="tiny">preparación ${prep}%</span>` : ""}</div></div></div>`;
    }).join("") + "</div>";
  }

  // sugerencia
  const sug = suggestNow(dayTasks, od, flex, evs);
  if (sug) h += `<div class="card" style="border-left:3px solid var(--acc)"><h3>Qué conviene hacer ahora</h3>${sug}</div>`;

  // atrasadas
  if (od.length) {
    h += `<div class="card" style="border-left:3px solid var(--bad)"><h3>Atrasadas (${od.length})
      <div class="grow"></div><button class="btn sm" onclick="postponeAllOverdue()">Mover todas a hoy</button></h3>`;
    h += od.slice(0, 8).map(t => taskRow(t, { showDate: true })).join("");
    if (od.length > 8) h += `<p class="tiny" style="padding:6px">y ${od.length - 8} más — <a href="#/list">ver lista completa</a></p>`;
    h += "</div>";
  }

  // hoy
  h += `<div class="card"><h3>Para hoy<div class="grow"></div><span class="tiny">${dayTasks.length ? fmtMin(dayTasks.reduce((a, t) => a + (t.estMin || 0), 0)) + " en total" : ""}</span></h3>`;
  h += dayTasks.length ? dayTasks.map(t => taskRow(t)).join("") : `<div class="empty">Nada programado para hoy. Agregá una tarea o revisá las flexibles.</div>`;
  h += "</div>";

  // hábitos de hoy
  if (habitsToday.length) {
    h += `<div class="card"><h3>Hábitos de hoy<div class="grow"></div><button class="btn sm ghost" onclick="go('habits')">Administrar</button></h3>`;
    h += habitsToday.map(hb => `<div class="task" onclick="go('habits')">
      <div class="cb ${hb.checks && hb.checks[today] ? "on" : ""}" onclick="event.stopPropagation();toggleHabit('${hb.id}')">${hb.checks && hb.checks[today] ? "✓" : ""}</div>
      <div class="tinfo"><div class="tt">${esc(hb.name)}</div></div>
      <span class="tiny">racha ${habitStreak(hb)}</span></div>`).join("");
    h += "</div>";
  }

  // flexibles
  if (flex.length) {
    h += `<div class="card"><h3>Flexibles próximas a vencer</h3>` + flex.slice(0, 6).map(t => taskRow(t, { showDate: true })).join("") + "</div>";
  }

  // resumen por materia
  const subs = activeSubjects().map(s => {
    const pend = state.tasks.filter(t => t.subjectId === s.id && !t.archived && !t.recur && t.status !== "done" && t.status !== "canc");
    return { s, pend };
  }).filter(x => x.pend.length);
  if (subs.length) {
    h += `<div class="card"><h3>Materias con pendientes</h3><div class="grid3">`;
    h += subs.map(({ s, pend }) => {
      const min = pend.reduce((a, t) => a + (t.estMin || 0), 0);
      return `<div class="subrow" style="cursor:pointer;border:1px solid var(--line2);border-radius:9px" onclick="go('subject','${s.id}')">
        <span class="iconchip" style="background:${s.color}">${esc(s.icon || s.short)}</span>
        <div style="flex:1;min-width:0"><div style="font-size:.8rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</div>
        <div class="tiny">${pend.length} pendientes · ${fmtMin(min)}</div></div></div>`;
    }).join("") + "</div></div>";
  }
  return h;
}
function saludo() {
  const h = new Date().getHours();
  return h < 12 ? "Buen día" : h < 19 ? "Buenas tardes" : "Buenas noches";
}
function suggestNow(dayTasks, od, flex, evs) {
  const items = [];
  if (od.length) items.push(`Tenés <b>${od.length} tareas atrasadas</b>: conviene resolverlas o moverlas antes de seguir.`);
  const next = evs[0];
  if (next && daysTo(next.date) <= 3) {
    const pend = evalPlanTasks(next.id).filter(t => t.status !== "done");
    items.push(`<b>${esc(next.name)}</b> es ${daysTo(next.date) === 0 ? "hoy" : daysTo(next.date) === 1 ? "mañana" : "en " + daysTo(next.date) + " días"}${pend.length ? ": quedan " + pend.length + " tareas de su plan (" + fmtMin(pend.reduce((a, t) => a + (t.estMin || 0), 0)) + ")" : ""}.`);
  }
  const first = dayTasks.filter(t => !isDoneOn(t, todayISO())).sort((a, b) => b.prio - a.prio)[0];
  if (first) items.push(`Siguiente sugerida: <b>${esc(first.title)}</b>${first.estMin ? " (" + fmtMin(first.estMin) + ")" : ""}. <button class="btn sm" onclick="event.stopPropagation();startFromTask('${first.id}')">Empezar pomodoro</button>`);
  else if (flex.length) items.push(`Hoy está libre: podés adelantar <b>${esc(flex[0].title)}</b> (vence ${fmtD(flex[0].due)}).`);
  return items.length ? items.map(x => `<p class="muted" style="margin:4px 0">${x}</p>`).join("") : null;
}
function postponeAllOverdue() {
  const od = overdueTasks(); const today = todayISO();
  od.forEach(t => { if (t.date) t.date = today; else if (t.due) t.due = today; });
  change(); render(); toast(od.length + " tareas movidas a hoy");
}

/* ============================ VISTA: HOY ============================ */
function viewToday() {
  const today = todayISO();
  const dayTasks = tasksOn(today);
  const od = overdueTasks();
  const flex = flexibleUpcoming();
  let h = `<div class="vhead"><h2>Hoy</h2><span class="sub">${fmtDFull(today)}</span><div class="grow"></div>
    <button class="btn primary" onclick="openQuickTask('${today}')">Nueva tarea para hoy</button></div>`;
  if (od.length) h += `<div class="card"><h3>Atrasadas</h3>${od.map(t => taskRow(t, { showDate: true })).join("")}</div>`;
  h += `<div class="card"><h3>Programadas para hoy</h3>${dayTasks.length ? dayTasks.map(t => taskRow(t)).join("") : '<div class="empty">Sin tareas programadas.</div>'}</div>`;
  if (flex.length) h += `<div class="card"><h3>Flexibles (vencen pronto)</h3>${flex.map(t => taskRow(t, { showDate: true })).join("")}</div>`;
  const tom = addDays(today, 1);
  const tomTasks = tasksOn(tom);
  if (tomTasks.length) h += `<div class="card"><h3>Mañana</h3>${tomTasks.map(t => taskRow(t, { date: tom })).join("")}</div>`;
  return h;
}

/* ========================== VISTA: SEMANA ========================== */
function viewWeek() {
  const today = todayISO();
  const ws = ui.weekBase || weekStartOf(today, state.settings.weekStart);
  let h = `<div class="vhead"><h2>Semana</h2><span class="sub">${fmtD(ws)} — ${fmtD(addDays(ws, 6))}</span><div class="grow"></div>
    <button class="btn sm" onclick="ui.weekBase='${addDays(ws, -7)}';render()">‹ anterior</button>
    <button class="btn sm" onclick="ui.weekBase=null;render()">Esta semana</button>
    <button class="btn sm" onclick="ui.weekBase='${addDays(ws, 7)}';render()">siguiente ›</button></div>`;
  h += '<div class="week">';
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const ts = tasksOn(d);
    const evs = state.evals.filter(e => e.date === d);
    const min = ts.filter(t => !isDoneOn(t, d)).reduce((a, t) => a + (t.estMin || 0), 0);
    h += `<div class="wday ${d === today ? "today" : ""}">
      <h5>${DAYS[dToDate(d).getDay()]} ${dToDate(d).getDate()}<span class="tiny">${min ? fmtMin(min) : ""}</span></h5>
      ${evs.map(e => `<div class="wtask" style="background:var(--bad-soft);color:var(--bad);font-weight:700" onclick="go('eval','${e.id}')">${esc(e.name.slice(0, 30))}</div>`).join("")}
      ${ts.map(t => { const o = ownerOf(t); return `<div class="wtask ${isDoneOn(t, d) ? "done" : ""}" onclick="openTaskEditor('${t.id}')"><span class="dotc" style="background:${o ? o.color : "var(--tx3)"}"></span>${esc(t.title.slice(0, 34))}</div>`; }).join("")}
      <button class="btn sm ghost" style="width:100%;margin-top:4px" onclick="openQuickTask('${d}')">+ tarea</button>
    </div>`;
  }
  return h + "</div>";
}

/* ======================== VISTA: CALENDARIO ======================== */
function viewCalendar() {
  const today = todayISO();
  if (!ui.calMonth) ui.calMonth = today.slice(0, 7);
  const [Y, M] = ui.calMonth.split("-").map(Number);
  const first = new Date(Y, M - 1, 1);
  const ws = state.settings.weekStart;
  const startOffset = (first.getDay() - ws + 7) % 7;
  const gridStart = new Date(Y, M - 1, 1 - startOffset);
  const prev = iso(new Date(Y, M - 2, 1)).slice(0, 7), next = iso(new Date(Y, M, 1)).slice(0, 7);
  let h = `<div class="vhead"><h2>Calendario</h2><span class="sub">${capitalize(MESL[M - 1])} ${Y}</span><div class="grow"></div>
    <button class="btn sm" onclick="ui.calMonth='${prev}';render()">‹</button>
    <button class="btn sm" onclick="ui.calMonth='${today.slice(0, 7)}';render()">Hoy</button>
    <button class="btn sm" onclick="ui.calMonth='${next}';render()">›</button></div>`;
  h += '<div class="cal">';
  for (let i = 0; i < 7; i++) h += `<div class="dow">${DAYS[(ws + i) % 7]}</div>`;
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const dISO = iso(d);
    const inMonth = d.getMonth() === M - 1;
    const ts = tasksOn(dISO);
    const evs = state.evals.filter(e => e.date === dISO);
    const habs = state.habits.filter(hb => habitDueOn(hb, dISO) && hb.checks && hb.checks[dISO]);
    const items = [];
    for (const e of evs) items.push(`<div class="ev" style="background:var(--bad-soft);color:var(--bad)" onclick="event.stopPropagation();go('eval','${e.id}')" title="${escA(e.name)}">${esc(e.name)}</div>`);
    for (const t of ts.slice(0, evs.length ? 2 : 3)) {
      const o = ownerOf(t);
      items.push(`<div class="ev" style="background:${o ? o.color + "1c" : "var(--card2)"};color:${o ? o.color : "var(--tx2)"};${isDoneOn(t, dISO) ? "text-decoration:line-through;opacity:.6" : ""}" onclick="event.stopPropagation();openTaskEditor('${t.id}')" title="${escA(t.title)}">${esc(t.title)}</div>`);
    }
    const moreN = ts.length - (evs.length ? 2 : 3);
    if (moreN > 0) items.push(`<div class="more">+${moreN} más</div>`);
    if (habs.length) items.push(`<div class="more" style="color:var(--ok)">${habs.length} hábito${habs.length > 1 ? "s" : ""} ✓</div>`);
    h += `<div class="day ${inMonth ? "" : "out"} ${dISO === today ? "today" : ""}" onclick="openQuickTask('${dISO}')" title="Crear tarea el ${escA(fmtD(dISO))}">
      <div class="dnum">${d.getDate()}</div>${items.join("")}</div>`;
  }
  h += "</div><p class='tiny' style='margin-top:8px'>Clic en un día para crear una tarea · clic en un evento para editarlo.</p>";
  return h;
}

/* ========================== VISTA: LISTA ========================== */
function viewList() {
  const f = ui.listFilters;
  const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${sel === k ? "selected" : ""}>${v}</option>`).join("");
  let list = state.tasks.filter(t => !t.archived || f.archived === "1");
  if (f.subject) list = list.filter(t => t.subjectId === f.subject);
  if (f.project) list = list.filter(t => t.projectId === f.project);
  if (f.status) list = list.filter(t => t.status === f.status);
  if (f.type) list = list.filter(t => t.type === f.type);
  if (f.prio !== undefined && f.prio !== "") list = list.filter(t => String(t.prio) === f.prio);
  if (f.eval) list = list.filter(t => t.evalId === f.eval);
  if (f.tag) list = list.filter(t => (t.tags || []).includes(f.tag));
  if (f.from) list = list.filter(t => (t.date || t.due || "9999") >= f.from);
  if (f.to) list = list.filter(t => (t.date || t.due || "0000") <= f.to);
  if (!state.settings.showDone && !f.status) list = list.filter(t => t.status !== "done");
  list.sort((a, b) => ((a.date || a.due || "9999") + a.title).localeCompare((b.date || b.due || "9999") + b.title));
  const totMin = list.filter(t => t.status !== "done").reduce((a, t) => a + (t.estMin || 0), 0);
  let h = `<div class="vhead"><h2>Lista completa</h2><span class="sub">${list.length} tareas · ${fmtMin(totMin)} pendientes</span>
    <div class="grow"></div><button class="btn primary" onclick="openQuickTask()">Nueva tarea</button></div>`;
  h += `<div class="filters">
    <select onchange="ui.listFilters.subject=this.value;render()"><option value="">Materia</option>${activeSubjects().map(s => `<option value="${s.id}" ${f.subject === s.id ? "selected" : ""}>${esc(s.short)} · ${esc(s.name)}</option>`).join("")}</select>
    <select onchange="ui.listFilters.project=this.value;render()"><option value="">Proyecto</option>${state.projects.map(p => `<option value="${p.id}" ${f.project === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
    <select onchange="ui.listFilters.status=this.value;render()"><option value="">Estado</option>${opts(TASK_STATUS, f.status)}</select>
    <select onchange="ui.listFilters.type=this.value;render()"><option value="">Tipo</option>${opts(TASK_TYPES, f.type)}</select>
    <select onchange="ui.listFilters.prio=this.value;render()"><option value="">Prioridad</option><option value="2" ${f.prio === "2" ? "selected" : ""}>Alta</option><option value="1" ${f.prio === "1" ? "selected" : ""}>Media</option><option value="0" ${f.prio === "0" ? "selected" : ""}>Baja</option></select>
    <select onchange="ui.listFilters.eval=this.value;render()"><option value="">Evaluación</option>${state.evals.map(e => `<option value="${e.id}" ${f.eval === e.id ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select>
    <select onchange="ui.listFilters.tag=this.value;render()"><option value="">Etiqueta</option>${state.settings.tags.map(t => `<option ${f.tag === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
    <input type="date" value="${f.from || ""}" onchange="ui.listFilters.from=this.value;render()" title="Desde">
    <input type="date" value="${f.to || ""}" onchange="ui.listFilters.to=this.value;render()" title="Hasta">
    <label style="display:flex;align-items:center;gap:4px;font-size:.72rem;color:var(--tx2)"><input type="checkbox" style="width:auto" ${f.archived === "1" ? "checked" : ""} onchange="ui.listFilters.archived=this.checked?'1':'';render()">archivadas</label>
    <button class="btn sm ghost" onclick="ui.listFilters={};render()">Limpiar filtros</button></div>`;
  h += `<div class="card">${list.length ? list.map(t => taskRow(t, { showDate: true })).join("") : '<div class="empty">No hay tareas con estos filtros.</div>'}</div>`;
  return h;
}

/* ========================= VISTA: MATERIAS ========================= */
function viewSubjects() {
  const act = activeSubjects(), arch = state.subjects.filter(s => s.archived);
  let h = `<div class="vhead"><h2>Materias</h2><div class="grow"></div>
    <button class="btn" onclick="openProjectEditor()">Nuevo proyecto</button>
    <button class="btn primary" onclick="openSubjectEditor()">Nueva materia</button></div>`;
  h += '<div class="card">';
  h += act.length ? act.map((s, i) => {
    const pend = state.tasks.filter(t => t.subjectId === s.id && !t.archived && t.status !== "done" && t.status !== "canc").length;
    const min = subjectRealMin(s.id);
    return `<div class="subrow">
      <span class="iconchip" style="background:${s.color}">${esc(s.icon || s.short)}</span>
      <div style="flex:1;min-width:0;cursor:pointer" onclick="go('subject','${s.id}')">
        <div style="font-weight:600;font-size:.86rem">${esc(s.name)}</div>
        <div class="tiny">${esc(s.short)} · ${pend} pendientes · ${fmtMin(min)} estudiadas</div></div>
      <button class="btn sm ghost" title="Subir" onclick="moveSubject('${s.id}',-1)" ${i === 0 ? "disabled" : ""}>↑</button>
      <button class="btn sm ghost" title="Bajar" onclick="moveSubject('${s.id}',1)" ${i === act.length - 1 ? "disabled" : ""}>↓</button>
      <button class="btn sm" onclick="openSubjectEditor('${s.id}')">Editar</button>
      <button class="btn sm" onclick="archiveSubject('${s.id}')">Archivar</button>
    </div>`;
  }).join("") : '<div class="empty">No hay materias activas.</div>';
  h += "</div>";
  if (arch.length) {
    h += `<div class="card"><h3>Archivadas</h3>` + arch.map(s => `<div class="subrow">
      <span class="iconchip" style="background:${s.color};opacity:.5">${esc(s.icon || s.short)}</span>
      <div style="flex:1"><div style="font-weight:600;font-size:.86rem;color:var(--tx3)">${esc(s.name)}</div></div>
      <button class="btn sm" onclick="archiveSubject('${s.id}')">Reactivar</button>
      <button class="btn sm danger" onclick="deleteSubject('${s.id}')">Eliminar</button></div>`).join("") + "</div>";
  }
  return h;
}
function viewSubjectDetail() {
  const s = subjById(route.id);
  if (!s) return '<div class="empty">Materia no encontrada. <a href="#/subjects">Volver</a></div>';
  const ts = state.tasks.filter(t => t.subjectId === s.id && !t.archived);
  const pend = ts.filter(t => t.status !== "done" && t.status !== "canc");
  const done = ts.filter(t => t.status === "done");
  const pct = ts.length ? Math.round(done.length / ts.length * 100) : 0;
  const real = subjectRealMin(s.id);
  const est = ts.reduce((a, t) => a + (t.estMin || 0), 0);
  const evs = state.evals.filter(e => e.subjectId === s.id).sort((a, b) => a.date < b.date ? -1 : 1);
  const nextEv = evs.find(e => e.date >= todayISO() && !["rendido", "aprob", "desaprob"].includes(e.status));
  const notes = state.notes.filter(n => n.subjectId === s.id);
  const grades = evs.filter(e => e.grade !== "" && e.grade != null);
  const weekMin = minsBetween(weekStartOf(todayISO(), state.settings.weekStart), todayISO(), x => x.subjectId === s.id);
  let h = `<div class="vhead"><span class="iconchip" style="background:${s.color};width:38px;height:38px;font-size:.85rem">${esc(s.icon || s.short)}</span>
    <h2>${esc(s.name)}</h2><div class="grow"></div>
    <button class="btn sm" onclick="openSubjectEditor('${s.id}')">Editar</button>
    <button class="btn sm" onclick="openNoteEditor(null,'s:${s.id}')">Nueva nota</button>
    <button class="btn sm" onclick="openEvalEditor(null,'s:${s.id}')">Nueva evaluación</button>
    <button class="btn sm primary" onclick="openQuickTask(null,'${s.id}')">Nueva tarea</button></div>`;
  h += `<div class="grid3" style="margin-bottom:12px">
    <div class="card" style="margin:0"><div class="statnum">${pct}%</div><div class="statlab">${done.length}/${ts.length} tareas completadas</div><div class="pbar" style="margin-top:6px"><i style="width:${pct}%"></i></div></div>
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(real)}</div><div class="statlab">tiempo real estudiado · ${fmtMin(weekMin)} esta semana</div></div>
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(est)}</div><div class="statlab">estimado total ${real && est ? "· real/est " + Math.round(real / est * 100) + "%" : ""}</div></div>
  </div>`;
  if (nextEv) {
    const n = daysTo(nextEv.date);
    h += `<div class="card" style="border-left:3px solid ${s.color}"><h3>Próxima evaluación</h3>
      <div class="task" onclick="go('eval','${nextEv.id}')"><span class="pill ${n <= 3 ? "bad" : "acc"}">${n === 0 ? "HOY" : "en " + n + " días"}</span>
      <div class="tinfo"><div class="tt"><b>${esc(nextEv.name)}</b> · ${fmtD(nextEv.date)}</div></div></div></div>`;
  }
  if (grades.length) h += `<div class="card"><h3>Evaluaciones rendidas</h3>${grades.map(e => `<div class="task" onclick="go('eval','${e.id}')"><div class="tinfo"><div class="tt">${esc(e.name)}</div></div><span class="pill ${e.status === "aprob" ? "ok" : e.status === "desaprob" ? "bad" : ""}">${esc(String(e.grade))}</span></div>`).join("")}</div>`;
  h += `<div class="card"><h3>Pendientes (${pend.length})</h3>${pend.length ? pend.sort((a, b) => ((a.date || a.due || "9999")).localeCompare(b.date || b.due || "9999")).map(t => taskRow(t, { showDate: true })).join("") : '<div class="empty">Sin pendientes.</div>'}</div>`;
  if (notes.length) h += `<div class="card"><h3>Notas</h3>${notes.map(n => noteCard(n)).join("")}</div>`;
  if (done.length) h += `<div class="card"><h3>Completadas (${done.length})</h3>${done.slice(-10).reverse().map(t => taskRow(t, { showDate: true })).join("")}</div>`;
  return h;
}

/* ==================== VISTA: PARCIALES Y FINALES ==================== */
function viewEvals() {
  const today = todayISO();
  const up = state.evals.filter(e => e.date >= today).sort((a, b) => a.date < b.date ? -1 : 1);
  const past = state.evals.filter(e => e.date < today).sort((a, b) => a.date < b.date ? 1 : -1);
  const row = e => {
    const n = daysTo(e.date), o = e.subjectId ? subjById(e.subjectId) : null, p = e.projectId ? projById(e.projectId) : null;
    const prep = evalPrep(e);
    const stCls = { aprob: "ok", desaprob: "bad", rendido: "acc", prep: "warn" }[e.status] || "";
    return `<div class="task" onclick="go('eval','${e.id}')">
      <span class="pill ${n < 0 ? "" : n <= 2 ? "bad" : n <= 7 ? "warn" : "acc"}" style="min-width:80px;text-align:center">${n < 0 ? fmtD(e.date) : n === 0 ? "HOY" : n === 1 ? "mañana" : "en " + n + " días"}</span>
      <div class="tinfo"><div class="tt"><b>${esc(e.name)}</b></div>
        <div class="tmeta"><span class="tiny">${EVAL_KINDS[e.kind] || e.kind} · ${fmtD(e.date)}${e.time ? " " + esc(e.time) : ""}</span>
        ${o ? `<span class="tag" style="background:${o.color}1c;color:${o.color}">${esc(o.short)}</span>` : ""}
        ${p ? `<span class="tiny">${esc(p.name)}</span>` : ""}
        <span class="pill ${stCls}">${EVAL_STATUS[e.status] || e.status}</span>
        ${prep !== null ? `<span class="tiny">prep. ${prep}%</span>` : ""}
        ${e.grade !== "" && e.grade != null ? `<span class="pill">nota ${esc(String(e.grade))}</span>` : ""}</div></div></div>`;
  };
  let h = `<div class="vhead"><h2>Parciales y finales</h2><div class="grow"></div><button class="btn primary" onclick="openEvalEditor()">Nueva evaluación</button></div>`;
  h += `<div class="card"><h3>Próximas</h3>${up.length ? up.map(row).join("") : '<div class="empty">No hay evaluaciones próximas. Cargá una para armar su plan de estudio.</div>'}</div>`;
  if (past.length) h += `<div class="card"><h3>Pasadas</h3>${past.map(row).join("")}</div>`;
  return h;
}
function viewEvalDetail() {
  const e = evalById(route.id);
  if (!e) return '<div class="empty">Evaluación no encontrada. <a href="#/evals">Volver</a></div>';
  const n = daysTo(e.date);
  const o = e.subjectId ? subjById(e.subjectId) : null, p = e.projectId ? projById(e.projectId) : null;
  const plan = evalPlanTasks(e.id).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const planDone = plan.filter(t => t.status === "done");
  const planLate = plan.filter(t => t.status !== "done" && t.date && t.date < todayISO());
  const pendMin = plan.filter(t => t.status !== "done").reduce((a, x) => a + (x.estMin || 0), 0);
  const real = evalRealMin(e.id);
  const prep = evalPrep(e);
  const simul = plan.filter(t => t.type === "parcial" && t.status === "done").length;
  const topicsDone = e.topics.filter(t => t.state === "dom" || t.state === "ent").length;
  const stCls = { aprob: "ok", desaprob: "bad", rendido: "acc", prep: "warn" }[e.status] || "";
  let h = `<div class="vhead"><h2>${esc(e.name)}</h2>
    <span class="pill ${stCls}">${EVAL_STATUS[e.status]}</span>
    ${o ? `<span class="tag" style="background:${o.color}1c;color:${o.color}">${esc(o.short)}</span>` : ""}
    ${p ? `<a href="#/project/${p.id}" class="tiny">${esc(p.name)}</a>` : ""}
    <div class="grow"></div>
    <button class="btn sm" onclick="openNoteEditor(null,'e:${e.id}')">Nota</button>
    <button class="btn sm" onclick="openEvalEditor('${e.id}')">Editar</button>
    <button class="btn sm danger" onclick="deleteEval('${e.id}')">Eliminar</button></div>`;
  h += `<div class="grid3" style="margin-bottom:12px">
    <div class="card" style="margin:0"><div class="statnum" style="color:${n <= 2 ? "var(--bad)" : "var(--tx)"}">${n < 0 ? "—" : n}</div><div class="statlab">${n < 0 ? "ya pasó (" + fmtD(e.date) + ")" : n === 0 ? "ES HOY · " + fmtD(e.date) : "días restantes · " + fmtD(e.date) + (e.time ? " " + esc(e.time) : "")}</div></div>
    <div class="card" style="margin:0"><div class="statnum">${prep === null ? "—" : prep + "%"}</div><div class="statlab">nivel de preparación</div>${prep !== null ? `<div class="pbar" style="margin-top:6px"><i style="width:${prep}%;background:${prep < 40 ? "var(--bad)" : prep < 70 ? "var(--warn)" : "var(--ok)"}"></i></div>` : ""}</div>
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(real)}</div><div class="statlab">estudiado · ${fmtMin(pendMin)} pendiente estimado</div></div>
  </div>`;
  h += `<div class="grid3" style="margin-bottom:12px">
    <div class="card" style="margin:0"><div class="statnum">${topicsDone}/${e.topics.length}</div><div class="statlab">temas entendidos o dominados</div></div>
    <div class="card" style="margin:0"><div class="statnum">${planDone.length}/${plan.length}</div><div class="statlab">tareas del plan${planLate.length ? ` · <span style="color:var(--bad)">${planLate.length} atrasadas</span>` : ""}</div></div>
    <div class="card" style="margin:0"><div class="statnum">${simul}</div><div class="statlab">simulacros / parciales hechos</div></div>
  </div>`;
  if (e.mode || e.place || e.targetGrade || e.grade !== "" || e.obs) {
    h += `<div class="card"><h3>Datos</h3><div class="muted" style="line-height:1.7">
      ${e.mode ? "Modalidad: <b>" + esc(e.mode) + "</b><br>" : ""}
      ${e.place ? "Lugar / enlace: <b>" + esc(e.place) + "</b><br>" : ""}
      ${e.targetGrade ? "Nota objetivo: <b>" + esc(e.targetGrade) + "</b><br>" : ""}
      ${e.grade !== "" && e.grade != null ? "Nota obtenida: <b>" + esc(String(e.grade)) + "</b><br>" : ""}
      ${e.reviewDays ? "Días reservados para repaso: <b>" + e.reviewDays + "</b><br>" : ""}
      ${e.obs ? "Observaciones: " + esc(e.obs) : ""}</div></div>`;
  }
  // temas
  h += `<div class="card"><h3>Temas<div class="grow"></div><span class="tiny">${fmtMin(e.topics.reduce((a, t) => a + (t.estMin || 0), 0))} estimados</span></h3>`;
  h += e.topics.map(tp => `<div class="task" style="cursor:default">
      <span class="pill ${tp.diff >= 3 ? "bad" : tp.diff === 2 ? "warn" : ""}" title="Dificultad">${tp.diff >= 3 ? "difícil" : tp.diff === 2 ? "media" : "fácil"}</span>
      <div class="tinfo"><div class="tt">${esc(tp.name)}</div><div class="tmeta"><span class="mins">${fmtMin(tp.estMin)}</span></div></div>
      <select style="width:auto;background:var(--card2);border:1px solid var(--line);border-radius:7px;padding:4px;font-size:.7rem" onchange="setTopicState('${e.id}','${tp.id}',this.value)">
        ${[["nv", "No visto"], ["emp", "Empezado"], ["ent", "Entendido"], ["dom", "Dominado"]].map(([k, v]) => `<option value="${k}" ${tp.state === k ? "selected" : ""}>${v}</option>`).join("")}
      </select>
      <button class="btn sm ghost" title="Eliminar tema" onclick="delTopic('${e.id}','${tp.id}')">×</button></div>`).join("");
  h += `<div class="mrow" style="margin-top:8px">
      <div style="flex:2"><input id="tp_new" placeholder="Nuevo tema…" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:8px"></div>
      <div><select id="tp_diff" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:8px"><option value="1">Fácil</option><option value="2" selected>Media</option><option value="3">Difícil</option></select></div>
      <div><input id="tp_min" type="number" value="90" min="10" step="10" title="Minutos estimados" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:8px"></div>
      <button class="btn" onclick="addTopic('${e.id}')">Agregar</button></div></div>`;
  // plan
  h += `<div class="card"><h3>Plan de estudio<div class="grow"></div>
    ${plan.length ? `<button class="btn sm" onclick="replanPending('${e.id}')">Replanificar pendientes</button>` : ""}
    <button class="btn sm primary" onclick="openPlanWizard('${e.id}')">${plan.length ? "Regenerar plan" : "Generar plan"}</button></h3>`;
  if (plan.length) {
    let cur = "";
    for (const t of plan) {
      if (t.date !== cur) { cur = t.date; const dmin = plan.filter(x => x.date === cur).reduce((a, x) => a + (x.estMin || 0), 0); h += `<div class="tiny" style="margin:10px 0 3px;font-weight:700;text-transform:capitalize">${fmtD(cur)} · ${fmtMin(dmin)}</div>`; }
      h += taskRow(t, { showEval: false });
    }
  } else h += `<div class="empty">Todavía no hay plan. Cargá los temas y generalo automáticamente.</div>`;
  h += "</div>";
  const notes = state.notes.filter(x => x.evalId === e.id);
  if (notes.length) h += `<div class="card"><h3>Notas</h3>${notes.map(noteCard).join("")}</div>`;
  return h;
}

/* ======================== VISTA: PROYECTOS ======================== */
function viewProjects() {
  const act = state.projects.filter(p => p.status !== "arch");
  const arch = state.projects.filter(p => p.status === "arch");
  const card = p => {
    const ts = state.tasks.filter(t => t.projectId === p.id && !t.archived);
    const done = ts.filter(t => t.status === "done").length;
    const pct = ts.length ? Math.round(done / ts.length * 100) : (p.status === "done" ? 100 : 0);
    const stCls = { done: "ok", prog: "acc", pausa: "warn" }[p.status] || "";
    return `<div class="card" style="margin:0;cursor:pointer" onclick="go('project','${p.id}')">
      <h3 style="margin-bottom:6px">${esc(p.name)}<div class="grow"></div><span class="pill ${stCls}">${PROJ_STATUS[p.status] || p.status}</span></h3>
      ${p.desc ? `<p class="tiny" style="margin-bottom:8px">${esc(p.desc.slice(0, 110))}</p>` : ""}
      <div style="display:flex;align-items:center;gap:8px"><div class="pbar"><i style="width:${pct}%"></i></div><span class="tiny">${pct}%</span></div>
      <div class="tiny" style="margin-top:6px">${done}/${ts.length} tareas · ${fmtMin(projectRealMin(p.id))} invertidas${p.due ? " · objetivo " + fmtD(p.due) : ""}</div></div>`;
  };
  let h = `<div class="vhead"><h2>Proyectos y objetivos</h2><div class="grow"></div><button class="btn primary" onclick="openProjectEditor()">Nuevo proyecto</button></div>`;
  h += act.length ? `<div class="grid2">${act.map(card).join("")}</div>` : '<div class="card"><div class="empty">Sin proyectos. Creá uno para un TP, un final o un objetivo personal.</div></div>';
  if (arch.length) h += `<div class="card" style="margin-top:12px"><h3>Archivados</h3><div class="grid2">${arch.map(card).join("")}</div></div>`;
  return h;
}
function viewProjectDetail() {
  const p = projById(route.id);
  if (!p) return '<div class="empty">Proyecto no encontrado. <a href="#/projects">Volver</a></div>';
  const ts = state.tasks.filter(t => t.projectId === p.id && !t.archived);
  const pend = ts.filter(t => t.status !== "done" && t.status !== "canc");
  const done = ts.filter(t => t.status === "done");
  const pct = ts.length ? Math.round(done.length / ts.length * 100) : 0;
  const est = ts.reduce((a, t) => a + (t.estMin || 0), 0);
  const real = projectRealMin(p.id);
  const evs = state.evals.filter(e => e.projectId === p.id);
  const notes = state.notes.filter(x => x.projectId === p.id);
  const ms = p.milestones || [];
  let h = `<div class="vhead"><h2>${esc(p.name)}</h2><span class="pill ${p.status === "done" ? "ok" : p.status === "prog" ? "acc" : ""}">${PROJ_STATUS[p.status]}</span>
    ${p.due ? `<span class="tiny">objetivo ${fmtD(p.due)} (${fmtRel(p.due)})</span>` : ""}<div class="grow"></div>
    <button class="btn sm" onclick="openNoteEditor(null,'p:${p.id}')">Nota</button>
    <button class="btn sm" onclick="openProjectEditor('${p.id}')">Editar</button>
    <button class="btn sm danger" onclick="deleteProject('${p.id}')">Eliminar</button>
    <button class="btn sm primary" onclick="openQuickTask(null,null,'${p.id}')">Nueva tarea</button></div>`;
  if (p.desc) h += `<div class="card"><p class="muted">${esc(p.desc)}</p></div>`;
  h += `<div class="grid3" style="margin-bottom:12px">
    <div class="card" style="margin:0"><div class="statnum">${pct}%</div><div class="statlab">${done.length}/${ts.length} tareas</div><div class="pbar" style="margin-top:6px"><i style="width:${pct}%"></i></div></div>
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(real)}</div><div class="statlab">tiempo invertido</div></div>
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(Math.max(0, est - Math.min(est, real)))}</div><div class="statlab">restante estimado (de ${fmtMin(est)})</div></div></div>`;
  h += `<div class="card"><h3>Hitos</h3>`;
  h += ms.length ? ms.map(m => `<div class="task" style="cursor:default">
    <div class="cb ${m.done ? "on" : ""}" onclick="toggleMilestone('${p.id}','${m.id}')">${m.done ? "✓" : ""}</div>
    <div class="tinfo"><div class="tt" style="${m.done ? "text-decoration:line-through;color:var(--tx3)" : ""}">${esc(m.t)}</div></div>
    <button class="btn sm ghost" onclick="delMilestone('${p.id}','${m.id}')">×</button></div>`).join("") : "";
  h += `<div class="mrow" style="margin-top:6px"><div style="flex:1"><input id="ms_new" placeholder="Nuevo hito…" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:8px" onkeydown="if(event.key==='Enter')addMilestone('${p.id}')"></div><button class="btn" onclick="addMilestone('${p.id}')">Agregar</button></div></div>`;
  if (evs.length) h += `<div class="card"><h3>Evaluaciones vinculadas</h3>${evs.map(e => `<div class="task" onclick="go('eval','${e.id}')"><div class="tinfo"><div class="tt">${esc(e.name)} · ${fmtD(e.date)}</div></div><span class="pill">${EVAL_STATUS[e.status]}</span></div>`).join("")}</div>`;
  h += `<div class="card"><h3>Pendientes (${pend.length})</h3>${pend.length ? pend.map(t => taskRow(t, { showDate: true })).join("") : '<div class="empty">Sin pendientes.</div>'}</div>`;
  if (notes.length) h += `<div class="card"><h3>Notas</h3>${notes.map(noteCard).join("")}</div>`;
  if (done.length) h += `<div class="card"><h3>Completadas</h3>${done.slice(-8).reverse().map(t => taskRow(t, { showDate: true })).join("")}</div>`;
  return h;
}

/* ========================= VISTA: PLANES ========================= */
function viewPlans() {
  const withPlan = state.evals.map(e => ({ e, plan: evalPlanTasks(e.id) })).filter(x => x.plan.length);
  let h = `<div class="vhead"><h2>Planes de estudio</h2><span class="sub">generados desde parciales y finales</span><div class="grow"></div>
    <button class="btn primary" onclick="openEvalEditor()">Nueva evaluación</button></div>`;
  if (!withPlan.length) return h + `<div class="card"><div class="empty">Todavía no generaste ningún plan.<br>Creá una evaluación, cargale los temas y usá “Generar plan”.</div></div>`;
  for (const { e, plan } of withPlan.sort((a, b) => a.e.date < b.e.date ? -1 : 1)) {
    const done = plan.filter(t => t.status === "done").length;
    const pct = Math.round(done / plan.length * 100);
    const late = plan.filter(t => t.status !== "done" && t.date && t.date < todayISO()).length;
    const pend = plan.filter(t => t.status !== "done").reduce((a, t) => a + (t.estMin || 0), 0);
    h += `<div class="card"><h3 style="cursor:pointer" onclick="go('eval','${e.id}')">${esc(e.name)}<div class="grow"></div>
      <span class="tiny">${fmtD(e.date)} · ${daysTo(e.date) >= 0 ? fmtRel(e.date) : "pasado"}</span></h3>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><div class="pbar"><i style="width:${pct}%"></i></div><span class="tiny">${done}/${plan.length}</span></div>
      <div class="tiny">${fmtMin(pend)} pendientes${late ? ` · <span style="color:var(--bad)">${late} atrasadas</span>` : ""}</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn sm" onclick="go('eval','${e.id}')">Abrir</button>
        <button class="btn sm" onclick="replanPending('${e.id}')">Replanificar pendientes</button>
        <button class="btn sm" onclick="openPlanWizard('${e.id}')">Regenerar</button></div></div>`;
  }
  return h;
}
/* ========================== VISTA: NOTAS ========================== */
function noteLinkLabel(n) {
  if (n.subjectId) { const s = subjById(n.subjectId); return s ? s.short : ""; }
  if (n.projectId) { const p = projById(n.projectId); return p ? p.name.slice(0, 18) : ""; }
  if (n.evalId) { const e = evalById(n.evalId); return e ? e.name.slice(0, 18) : ""; }
  if (n.taskId) { const t = taskById(n.taskId); return t ? "Tarea: " + t.title.slice(0, 16) : ""; }
  return "";
}
function noteCard(n) {
  const lk = noteLinkLabel(n);
  return `<div class="card" style="margin:0 0 8px;cursor:pointer" onclick="openNoteEditor('${n.id}')">
    <h3 style="margin-bottom:4px;font-size:.84rem">${n.pinned ? "◆ " : ""}${esc(n.title)}
      <div class="grow"></div>
      <button class="btn sm ghost" title="${n.pinned ? "Desfijar" : "Fijar"}" onclick="event.stopPropagation();pinNote('${n.id}')">${n.pinned ? "Desfijar" : "Fijar"}</button></h3>
    <div class="tiny" style="max-height:74px;overflow:hidden;color:var(--tx2)">${mdLite(n.body.slice(0, 260))}</div>
    <div class="tiny" style="margin-top:6px">${lk ? esc(lk) + " · " : ""}${(n.tags || []).map(t => "#" + esc(t)).join(" ")} · ${new Date(n.updatedAt).toLocaleDateString("es-AR")}</div></div>`;
}
function viewNotes() {
  const q = (ui.notesFilter || "").toLowerCase();
  let list = state.notes.filter(n => !q || (n.title + " " + n.body + " " + (n.tags || []).join(" ")).toLowerCase().includes(q));
  list = [...list.filter(n => n.pinned), ...list.filter(n => !n.pinned)].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  let h = `<div class="vhead"><h2>Notas</h2><div class="grow"></div>
    <input placeholder="Filtrar notas…" value="${escA(ui.notesFilter || "")}" oninput="ui.notesFilter=this.value;render()" style="background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 10px;font-size:.78rem">
    <button class="btn primary" onclick="openNoteEditor()">Nueva nota</button></div>`;
  h += list.length ? `<div class="grid2">${list.map(noteCard).join("")}</div>` : '<div class="card"><div class="empty">Sin notas todavía.</div></div>';
  return h;
}

/* ======================== VISTA: POMODORO ======================== */
function pomoLinkOptions(sel) {
  const today = todayISO();
  const cand = state.tasks.filter(t => !t.archived && t.status !== "done" && t.status !== "canc" && (occursOn(t, today) || (t.due && !t.date) || t.status === "prog")).slice(0, 30);
  let h = `<option value="">Sesión libre (sin vínculo)</option><optgroup label="Tareas">`;
  h += cand.map(t => `<option value="t:${t.id}" ${sel === "t:" + t.id ? "selected" : ""}>${esc(t.title.slice(0, 48))}</option>`).join("");
  h += `</optgroup><optgroup label="Materias">` + activeSubjects().map(s => `<option value="s:${s.id}" ${sel === "s:" + s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("");
  h += `</optgroup><optgroup label="Proyectos">` + state.projects.filter(p => p.status !== "arch" && p.status !== "done").map(p => `<option value="p:${p.id}" ${sel === "p:" + p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("") + "</optgroup>";
  return h;
}
function viewPomodoro() { return `<div class="vhead"><h2>Pomodoro</h2><div class="grow"></div>
    <button class="btn" onclick="openManualSession()">Registrar sesión manual</button></div><div id="pomowrap"></div>`; }
function renderPomoView() {
  const w = byId("pomowrap"); if (!w) return;
  const T = state.timer;
  const today = todayISO();
  const todayMin = minsBetween(today, today), todayPomos = pomosBetween(today, today);
  const sel = T.taskId ? "t:" + T.taskId : T.subjectId ? "s:" + T.subjectId : T.projectId ? "p:" + T.projectId : "";
  const linked = T.taskId ? taskById(T.taskId) : null;
  const dots = Array.from({ length: state.settings.pomo.c }, (_, i) => i < (T.cycle % state.settings.pomo.c) || (T.cycle > 0 && T.cycle % state.settings.pomo.c === 0 && T.phase === "long") ? "●" : "○").join(" ");
  w.innerHTML = `<div class="card pomobig">
    <div class="phase ${T.phase === "focus" ? "" : "break"}">${T.phase === "focus" ? "Foco" : T.phase === "long" ? "Descanso largo" : "Descanso"}</div>
    <div class="ptime" id="ptime">${fmtClock(T.left)}</div>
    <div class="pring"><i id="pfill" style="width:${100 - T.left / T.total * 100}%"></i></div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      ${T.run ? `<button class="btn" onclick="pausePomo()">Pausar</button>` : `<button class="btn primary" onclick="startPomo()">${T.left === T.total ? "Iniciar" : "Continuar"}</button>`}
      <button class="btn" onclick="skipPomo()">Saltar fase</button>
      <button class="btn" onclick="resetPomo()">Reiniciar</button>
      <button class="btn" onclick="openPomoCfg()">Ajustes</button></div>
    <div class="dots">${dots}</div>
    <label style="display:block;font-size:.66rem;color:var(--tx2);margin:16px 0 4px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;text-align:left">Trabajando en</label>
    <select onchange="pomoSetLink(this.value)" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:8px;font-size:.8rem">${pomoLinkOptions(sel)}</select>
    ${linked ? `<p class="tiny" style="margin-top:8px;text-align:left">${fmtMin(linked.realMin || 0)} acumulados en esta tarea · ${linked.pomos || 0} pomodoros</p>` : ""}
  </div>
  <div class="grid3" style="max-width:640px;margin:0 auto">
    <div class="card" style="margin:0"><div class="statnum">${todayPomos}</div><div class="statlab">pomodoros hoy</div></div>
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(todayMin)}</div><div class="statlab">foco hoy</div></div>
    <div class="card" style="margin:0"><div class="statnum">${state.settings.pomo.f}/${state.settings.pomo.s}</div><div class="statlab">min foco / descanso</div></div>
  </div>`;
}

/* ========================= VISTA: HÁBITOS ========================= */
function viewHabits() {
  const today = todayISO();
  const act = state.habits.filter(h => !h.archived);
  const arch = state.habits.filter(h => h.archived);
  const freqLabel = h => {
    const k = h.freq.kind;
    if (k === "daily") return "todos los días";
    if (k === "days") return (h.freq.days || []).map(d => DAYS[d]).join(", ");
    if (k === "weekly") return "semanal (" + DAYS[(h.freq.days || [1])[0]] + ")";
    if (k === "monthly") return "mensual (día " + (h.freq.n || 1) + ")";
    if (k === "interval") return "cada " + (h.freq.n || 2) + " días";
    return "";
  };
  const grid = h => {
    let cells = "";
    for (let i = 27; i >= 0; i--) {
      const d = addDays(today, -i);
      const due = habitDueOn(h, d), on = h.checks && h.checks[d];
      cells += `<div class="hcell ${on ? "on" : ""} ${d === today ? "today" : ""}" style="${!due && !on ? "opacity:.25" : ""}" title="${escA(fmtD(d))}${on ? " · cumplido" : due ? "" : " · no corresponde"}"></div>`;
    }
    return cells;
  };
  let h = `<div class="vhead"><h2>Hábitos</h2><div class="grow"></div><button class="btn primary" onclick="openHabitEditor()">Nuevo hábito</button></div>`;
  h += `<div class="card">`;
  h += act.length ? act.map(hb => {
    const due = habitDueOn(hb, today), on = hb.checks && hb.checks[today];
    const pct = habitWeekPct(hb);
    return `<div class="habitrow">
      <div class="cb ${on ? "on" : ""}" style="${due ? "" : "opacity:.3;pointer-events:none"}" title="${due ? "Marcar hoy" : "Hoy no corresponde"}" onclick="toggleHabit('${hb.id}')">${on ? "✓" : ""}</div>
      <div style="flex:1;min-width:180px">
        <div style="font-weight:600;font-size:.85rem">${esc(hb.name)}</div>
        <div class="tiny">${freqLabel(hb)} · racha <b>${habitStreak(hb)}</b> · mejor ${habitBest(hb)}${pct !== null ? " · semana " + pct + "%" : ""}</div>
      </div>
      <div class="hgrid" title="Últimos 28 días">${grid(hb)}</div>
      <button class="btn sm" onclick="openHabitEditor('${hb.id}')">Editar</button>
      <button class="btn sm ghost" onclick="habitById('${hb.id}').archived=true;change();render()">Archivar</button>
    </div>`;
  }).join("") : '<div class="empty">Sin hábitos. Creá uno, por ejemplo “Subir un commit” o “Leer 30 minutos”.</div>';
  h += "</div>";
  if (arch.length) h += `<div class="card"><h3>Archivados</h3>${arch.map(hb => `<div class="habitrow"><div style="flex:1;color:var(--tx3)">${esc(hb.name)}</div>
    <button class="btn sm" onclick="habitById('${hb.id}').archived=false;change();render()">Reactivar</button>
    <button class="btn sm danger" onclick="deleteHabit('${hb.id}')">Eliminar</button></div>`).join("")}</div>`;
  return h;
}

/* ======================= VISTA: ESTADÍSTICAS ======================= */
function viewStats() {
  const today = todayISO();
  const ws = weekStartOf(today, state.settings.weekStart);
  const prevWs = addDays(ws, -7);
  const monthStart = today.slice(0, 8) + "01";
  const weekMin = minsBetween(ws, today), prevWeekMin = minsBetween(prevWs, addDays(ws, -1));
  const monthMin = minsBetween(monthStart, today);
  const todayMin = minsBetween(today, today);
  const doneTotal = state.tasks.filter(t => t.status === "done").length;
  const od = overdueTasks().length;
  const pomosTotal = state.sessions.reduce((a, s) => a + (s.pomos || 0), 0);
  const activeDays = new Set(state.sessions.map(s => s.date)).size;
  // racha de días con estudio
  let streak = 0; { let d = today; if (!state.sessions.some(s => s.date === d)) d = addDays(d, -1); while (state.sessions.some(s => s.date === d)) { streak++; d = addDays(d, -1); } }
  const diff = weekMin - prevWeekMin;
  let h = `<div class="vhead"><h2>Estadísticas</h2><div class="grow"></div><button class="btn" onclick="exportCSV()">Exportar CSV</button></div>`;
  h += `<div class="grid3" style="margin-bottom:12px">
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(todayMin)}</div><div class="statlab">hoy</div></div>
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(weekMin)}</div><div class="statlab">esta semana · ${diff >= 0 ? "+" : "−"}${fmtMin(Math.abs(diff))} vs anterior</div></div>
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(monthMin)}</div><div class="statlab">este mes</div></div>
    <div class="card" style="margin:0"><div class="statnum">${doneTotal}</div><div class="statlab">tareas completadas${od ? ` · <span style="color:var(--bad)">${od} atrasadas</span>` : ""}</div></div>
    <div class="card" style="margin:0"><div class="statnum">${pomosTotal}</div><div class="statlab">pomodoros totales</div></div>
    <div class="card" style="margin:0"><div class="statnum">${streak}</div><div class="statlab">racha de días · ${activeDays} días activos</div></div>
  </div>`;
  // barras de las últimas 2 semanas
  const days14 = []; for (let i = 13; i >= 0; i--) days14.push(addDays(today, -i));
  const maxD = Math.max(60, ...days14.map(d => minsBetween(d, d)));
  h += `<div class="card"><h3>Últimos 14 días</h3><div class="bars">` + days14.map(d => {
    const m = minsBetween(d, d);
    return `<div class="b"><span class="tiny">${m ? Math.round(m / 6) / 10 + "h" : ""}</span>
      <div class="bar" style="height:${Math.max(3, m / maxD * 100)}px;${d === today ? "" : "opacity:.55"}" title="${escA(fmtD(d) + " · " + fmtMin(m))}"></div>
      <span class="tiny">${dToDate(d).getDate()}</span></div>`;
  }).join("") + "</div></div>";
  // evolución semanal (8 semanas) — línea SVG
  const weeks = []; for (let i = 7; i >= 0; i--) { const s = addDays(ws, -7 * i); weeks.push({ s, min: minsBetween(s, addDays(s, 6)) }); }
  const maxW = Math.max(60, ...weeks.map(w => w.min));
  const pts = weeks.map((w, i) => (i / (weeks.length - 1) * 560 + 20) + "," + (110 - w.min / maxW * 95 + 5)).join(" ");
  h += `<div class="card"><h3>Evolución semanal (horas de estudio)</h3>
    <svg viewBox="0 0 600 130" style="width:100%;height:auto" role="img" aria-label="Evolución semanal">
      <polyline points="${pts}" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${weeks.map((w, i) => `<circle cx="${i / (weeks.length - 1) * 560 + 20}" cy="${110 - w.min / maxW * 95 + 5}" r="3.5" fill="var(--acc)"/><text x="${i / (weeks.length - 1) * 560 + 20}" y="126" text-anchor="middle" style="font-size:9px;fill:var(--tx3)">${fmtD(w.s).slice(4)}</text><text x="${i / (weeks.length - 1) * 560 + 20}" y="${110 - w.min / maxW * 95 - 4}" text-anchor="middle" style="font-size:8.5px;fill:var(--tx2)">${w.min ? Math.round(w.min / 6) / 10 + "h" : ""}</text>`).join("")}
    </svg></div>`;
  // distribución por materia (últimos 30 días)
  const from30 = addDays(today, -29);
  const bySub = activeSubjects().map(s => ({ s, min: minsBetween(from30, today, x => x.subjectId === s.id) })).filter(x => x.min > 0).sort((a, b) => b.min - a.min);
  const byProj = state.projects.map(p => ({ p, min: minsBetween(from30, today, x => x.projectId === p.id && !x.subjectId) })).filter(x => x.min > 0);
  const totDist = bySub.reduce((a, x) => a + x.min, 0) + byProj.reduce((a, x) => a + x.min, 0);
  if (totDist) {
    h += `<div class="card"><h3>Distribución por materia (30 días)</h3>`;
    h += bySub.map(({ s, min }) => `<div style="display:flex;align-items:center;gap:10px;margin:7px 0">
      <span class="tag" style="background:${s.color}1c;color:${s.color};min-width:52px;text-align:center">${esc(s.short)}</span>
      <div class="pbar"><i style="width:${Math.round(min / totDist * 100)}%;background:${s.color}"></i></div>
      <span class="mins" style="min-width:76px;text-align:right">${fmtMin(min)} · ${Math.round(min / totDist * 100)}%</span></div>`).join("");
    h += byProj.map(({ p, min }) => `<div style="display:flex;align-items:center;gap:10px;margin:7px 0">
      <span class="tag" style="background:var(--card2);color:var(--tx2);min-width:52px;text-align:center">${esc(p.name.slice(0, 8))}</span>
      <div class="pbar"><i style="width:${Math.round(min / totDist * 100)}%;background:var(--tx3)"></i></div>
      <span class="mins" style="min-width:76px;text-align:right">${fmtMin(min)}</span></div>`).join("");
    h += "</div>";
  }
  // estimado vs real por materia
  const cmp = activeSubjects().map(s => {
    const ts = state.tasks.filter(t => t.subjectId === s.id && t.status === "done" && (t.estMin || 0) > 0);
    const est = ts.reduce((a, t) => a + t.estMin, 0), real = ts.reduce((a, t) => a + (t.realMin || 0), 0);
    return { s, est, real, n: ts.length };
  }).filter(x => x.est && x.real);
  if (cmp.length) {
    h += `<div class="card"><h3>Estimado vs real (tareas completadas con tiempo registrado)</h3>` + cmp.map(({ s, est, real, n }) =>
      `<div class="tiny" style="margin:6px 0">${esc(s.short)} — estimado ${fmtMin(est)} · real ${fmtMin(real)} · ${real > est ? "subestimaste" : "sobreestimaste"} ${Math.abs(Math.round((real - est) / est * 100))}% (${n} tareas)</div>`).join("") + "</div>";
  }
  // calendario de actividad (12 semanas)
  h += `<div class="card"><h3>Actividad (últimas 12 semanas)</h3><div class="heat" style="grid-template-columns:repeat(28,13px)">`;
  const maxH = Math.max(30, ...state.sessions.map(s => s.min));
  for (let i = 83; i >= 0; i--) {
    const d = addDays(today, -i);
    const m = minsBetween(d, d);
    const op = m ? clamp(.25 + m / maxH * .75, 0, 1) : 0;
    h += `<div title="${escA(fmtD(d) + " · " + fmtMin(m))}" style="${m ? `background:var(--acc);opacity:${op}` : ""}"></div>`;
  }
  h += "</div></div>";
  return h;
}
function exportCSV() {
  let csv = "fecha,minutos,pomodoros,manual,materia,proyecto,tarea\n";
  for (const s of [...state.sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    const sub = s.subjectId ? (subjById(s.subjectId) || {}).short || "" : "";
    const pr = s.projectId ? (projById(s.projectId) || {}).name || "" : "";
    const tk = s.taskId ? (taskById(s.taskId) || {}).title || "" : "";
    csv += `${s.date},${s.min},${s.pomos || 0},${s.manual ? 1 : 0},"${(sub || "").replace(/"/g, "'")}","${(pr || "").replace(/"/g, "'")}","${(tk || "").replace(/"/g, "'")}"\n`;
  }
  downloadFile("aula-estadisticas-" + todayISO() + ".csv", csv, "text/csv");
  toast("CSV exportado");
}
function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime || "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ======================== VISTA: HISTORIAL ======================== */
function viewHistory() {
  const done = state.tasks.filter(t => t.status === "done" && t.doneAt).sort((a, b) => b.doneAt.localeCompare(a.doneAt));
  const sess = [...state.sessions].sort((a, b) => b.ts - a.ts).slice(0, 40);
  const arch = state.tasks.filter(t => t.archived);
  let h = `<div class="vhead"><h2>Historial</h2></div>`;
  h += `<div class="card"><h3>Tareas completadas (${done.length})</h3>`;
  let cur = "";
  for (const t of done.slice(0, 60)) {
    if (t.doneAt !== cur) { cur = t.doneAt; h += `<div class="tiny" style="margin:10px 0 3px;font-weight:700">${fmtD(cur)}</div>`; }
    h += taskRow(t, { showDate: false });
  }
  if (!done.length) h += '<div class="empty">Todavía no completaste tareas.</div>';
  h += "</div>";
  h += `<div class="card"><h3>Sesiones de estudio recientes</h3>`;
  h += sess.length ? sess.map(s => {
    const sub = s.subjectId && subjById(s.subjectId), t = s.taskId && taskById(s.taskId), p = s.projectId && projById(s.projectId);
    return `<div class="task" style="cursor:default"><span class="pill">${fmtD(s.date)}</span>
      <div class="tinfo"><div class="tt">${fmtMin(s.min)}${s.pomos ? " · " + s.pomos + " pomodoro" + (s.pomos > 1 ? "s" : "") : ""}${s.manual ? " · manual" : ""}</div>
      <div class="tmeta">${sub ? `<span class="tag" style="background:${sub.color}1c;color:${sub.color}">${esc(sub.short)}</span>` : ""}${t ? `<span class="tiny">${esc(t.title.slice(0, 44))}</span>` : ""}${p ? `<span class="tiny">${esc(p.name.slice(0, 30))}</span>` : ""}${s.note ? `<span class="tiny">${esc(s.note.slice(0, 40))}</span>` : ""}</div></div></div>`;
  }).join("") : '<div class="empty">Sin sesiones registradas.</div>';
  h += "</div>";
  if (arch.length) h += `<div class="card"><h3>Tareas archivadas (${arch.length})</h3>${arch.map(t => `<div class="task"><div class="tinfo" onclick="openTaskEditor('${t.id}')"><div class="tt" style="color:var(--tx3)">${esc(t.title)}</div></div>
    <button class="btn sm" onclick="archiveTask('${t.id}')">Restaurar</button>
    <button class="btn sm danger" onclick="deleteTask('${t.id}')">Eliminar</button></div>`).join("")}</div>`;
  return h;
}

/* ==================== VISTA: COPIAS DE SEGURIDAD ==================== */
function viewBackups() {
  return `<div class="vhead"><h2>Copias de seguridad</h2><div class="grow"></div>
    <button class="btn" onclick="manualBackup()">Crear copia ahora</button>
    <button class="btn primary" onclick="exportJSON()">Exportar JSON</button></div>
  <div class="card"><h3>Importar datos</h3>
    <p class="muted" style="margin-bottom:10px">Elegí un archivo JSON exportado desde Aula (o desde la versión anterior). Antes de aplicar se valida el contenido y podés elegir fusionar o reemplazar.</p>
    <input type="file" id="impfile" accept=".json,application/json" onchange="importJSON(event)" style="font-size:.8rem"></div>
  <div class="card"><h3>Copias locales automáticas</h3>
    <p class="tiny" style="margin-bottom:8px">Se crea una por día al abrir la aplicación (se conservan las últimas 10, más 10 manuales). Se guardan en este navegador.</p>
    <div id="bklist"><div class="empty">Cargando…</div></div></div>
  <div class="card"><h3>Estado del almacenamiento</h3>
    <p class="muted">Almacenamiento principal: <b>${db ? "IndexedDB (activo)" : "localStorage (IndexedDB no disponible)"}</b> · Copia de emergencia en localStorage: activa.</p></div>`;
}
async function fillBackupsList() {
  const el = byId("bklist"); if (!el) return;
  if (!db) { el.innerHTML = '<div class="empty">IndexedDB no está disponible.</div>'; return; }
  try {
    const keys = (await idbKeys("backups")).sort().reverse();
    if (!keys.length) { el.innerHTML = '<div class="empty">Todavía no hay copias.</div>'; return; }
    const rows = [];
    for (const k of keys) {
      const b = await idbGet("backups", k);
      rows.push(`<div class="task" style="cursor:default"><div class="tinfo"><div class="tt">${esc(b.label || String(k))}</div>
        <div class="tiny">${new Date(b.ts).toLocaleString("es-AR")} · ${Math.round((b.data || "").length / 1024)} KB</div></div>
        <button class="btn sm" onclick="restoreBackup('${escA(String(k))}')">Restaurar</button></div>`);
    }
    el.innerHTML = rows.join("");
  } catch (e) { el.innerHTML = '<div class="empty">No se pudieron leer las copias.</div>'; }
}
async function restoreBackup(key) {
  askConfirm({
    title: "Restaurar copia", body: "Se reemplazará el estado actual por el de esta copia. Antes se creará una copia de seguridad del estado actual.", okLabel: "Restaurar", danger: true,
    onOk: async () => {
      try {
        await idbPut("backups", "pre-restore-" + Date.now(), { ts: Date.now(), label: "Antes de restaurar", data: JSON.stringify(state) });
        const b = await idbGet("backups", key);
        const s = JSON.parse(b.data);
        if (!validState(s)) { toast("La copia está dañada"); return; }
        state = normalizeState(s); change(); render(); toast("Copia restaurada");
      } catch (e) { toast("No se pudo restaurar"); }
    }
  });
}
function exportJSON() {
  downloadFile("aula-backup-" + todayISO() + ".json", JSON.stringify(state, null, 2), "application/json");
  toast("Datos exportados");
}
function importJSON(ev) {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let s = null;
    try { s = JSON.parse(r.result); } catch (e) { toast("El archivo no es un JSON válido"); return; }
    // aceptar también formato de la versión 1
    const isV1 = s && Array.isArray(s.tasks) && s.tasks.length && s.tasks[0].t !== undefined && !s.subjects;
    if (isV1) {
      askConfirm({
        title: "Archivo de la versión anterior", body: "Este archivo es de la app anterior. Se migrará su contenido y se agregará al estado actual.", okLabel: "Migrar e importar",
        onOk: () => { try { localStorage.setItem(OLD_LS_KEY, JSON.stringify(s)); } catch (e) {} const tmp = normalizeState(baseState()); tmp.subjects = state.subjects.length ? JSON.parse(JSON.stringify(state.subjects)) : initialSubjects(); if (migrateV1(tmp)) { mergeStates(state, tmp); change(); render(); toast("Datos de la versión anterior importados"); } else toast("No se pudo migrar el archivo"); }
      });
      ev.target.value = ""; return;
    }
    if (!validState(s)) { toast("El archivo no tiene el formato de Aula"); ev.target.value = ""; return; }
    const box = byId("confirmbox"), bg = byId("confirmbg");
    bg.classList.add("open");
    box.innerHTML = `<h3>Importar datos</h3>
      <p class="muted">Archivo válido: ${s.tasks.length} tareas, ${s.subjects.length} materias, ${(s.evals || []).length} evaluaciones, ${(s.notes || []).length} notas.</p>
      <p class="muted" style="margin-top:8px">¿Cómo querés aplicarlo?</p>
      <div class="mfoot"><button class="btn" onclick="closeConfirm()">Cancelar</button>
      <button class="btn" id="impMerge">Fusionar</button>
      <button class="btn danger" id="impReplace">Reemplazar todo</button></div>`;
    byId("impMerge").onclick = () => { mergeStates(state, normalizeState(s)); closeConfirm(); change(); render(); toast("Datos fusionados"); };
    byId("impReplace").onclick = () => {
      closeConfirm();
      askConfirm({
        title: "Reemplazar todo", body: "Se descartará el estado actual y se usará el del archivo. Esta acción no se puede deshacer (se guarda una copia previa).", okLabel: "Reemplazar", danger: true,
        onOk: async () => { try { if (db) await idbPut("backups", "pre-import-" + Date.now(), { ts: Date.now(), label: "Antes de importar", data: JSON.stringify(state) }); } catch (e) {} state = normalizeState(s); change(); render(); toast("Datos reemplazados"); }
      });
    };
  };
  r.readAsText(f); ev.target.value = "";
}
function mergeStates(dst, src) {
  const addNew = (arr, srcArr) => { const ids = new Set(arr.map(x => x.id)); for (const x of srcArr || []) if (!ids.has(x.id)) arr.push(x); };
  addNew(dst.subjects, src.subjects); addNew(dst.projects, src.projects); addNew(dst.evals, src.evals);
  addNew(dst.tasks, src.tasks); addNew(dst.notes, src.notes); addNew(dst.habits, src.habits); addNew(dst.sessions, src.sessions);
  for (const [k, v] of Object.entries(src.dayLog || {})) if (!dst.dayLog[k]) dst.dayLog[k] = v;
}

/* ======================= VISTA: CONFIGURACIÓN ======================= */
function viewConfig() {
  const st = state.settings;
  const chk = v => v ? "checked" : "";
  return `<div class="vhead"><h2>Configuración</h2></div>
  <div class="grid2">
  <div class="card" style="margin:0"><h3>Apariencia</h3>
    <label class="tiny" style="font-weight:700">Tema</label>
    <div style="display:flex;gap:8px;margin:6px 0 12px">
      ${[["light", "Claro"], ["dark", "Oscuro"], ["auto", "Automático"]].map(([k, v]) => `<button class="btn sm ${st.theme === k ? "primary" : ""}" onclick="setTheme('${k}')">${v}</button>`).join("")}</div>
    <label class="tiny" style="font-weight:700">Color principal</label>
    <div style="display:flex;gap:6px;margin:6px 0 12px;flex-wrap:wrap">
      ${SUBJ_COLORS.slice(0, 8).map(c => `<button title="${c}" style="width:26px;height:26px;border-radius:8px;background:${c};border:2px solid ${st.accent === c ? "var(--tx)" : "transparent"};cursor:pointer" onclick="setAccent('${c}')"></button>`).join("")}
      <input type="color" value="${st.accent}" onchange="setAccent(this.value)" title="Color personalizado" style="width:34px;height:26px;border:none;background:none;cursor:pointer;padding:0">
    </div>
    <label class="tiny" style="font-weight:700">Primer día de la semana</label>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn sm ${st.weekStart === 1 ? "primary" : ""}" onclick="state.settings.weekStart=1;change();render()">Lunes</button>
      <button class="btn sm ${st.weekStart === 0 ? "primary" : ""}" onclick="state.settings.weekStart=0;change();render()">Domingo</button></div>
  </div>
  <div class="card" style="margin:0"><h3>Pomodoro</h3>
    <div class="mrow"><div><label class="tiny" style="font-weight:700">Foco (min)</label><input id="cfg_f" type="number" min="5" max="120" value="${st.pomo.f}" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:7px"></div>
    <div><label class="tiny" style="font-weight:700">Descanso</label><input id="cfg_s" type="number" min="1" max="45" value="${st.pomo.s}" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:7px"></div></div>
    <div class="mrow" style="margin-top:8px"><div><label class="tiny" style="font-weight:700">Descanso largo</label><input id="cfg_l" type="number" min="5" max="90" value="${st.pomo.l}" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:7px"></div>
    <div><label class="tiny" style="font-weight:700">Ciclos p/ largo</label><input id="cfg_c" type="number" min="2" max="10" value="${st.pomo.c}" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:7px"></div></div>
    <button class="btn sm" style="margin-top:10px" onclick="savePomoCfgFromConfig()">Guardar duraciones</button>
    <div class="hr"></div>
    <label style="display:flex;gap:8px;align-items:center;font-size:.8rem;cursor:pointer"><input type="checkbox" style="width:auto" ${chk(st.sounds)} onchange="state.settings.sounds=this.checked;change()">Sonidos al terminar cada fase</label>
  </div>
  <div class="card" style="margin:0"><h3>Notificaciones</h3>
    <label style="display:flex;gap:8px;align-items:center;font-size:.8rem;cursor:pointer"><input type="checkbox" style="width:auto" ${chk(st.notif)} onchange="toggleNotif(this.checked)">Notificaciones locales (pomodoro, vencimientos, parciales)</label>
    <p class="tiny" style="margin-top:8px">El permiso del navegador se pide recién al activar esta opción.</p>
    <div class="hr"></div>
    <label class="tiny" style="font-weight:700">Días considerados “próximos”</label>
    <input type="number" min="1" max="30" value="${st.upcomingDays}" onchange="state.settings.upcomingDays=parseInt(this.value)||7;change();render()" style="width:90px;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:7px;margin-top:4px">
  </div>
  <div class="card" style="margin:0"><h3>Preferencias</h3>
    <label style="display:flex;gap:8px;align-items:center;font-size:.8rem;cursor:pointer"><input type="checkbox" style="width:auto" ${chk(st.showDone)} onchange="state.settings.showDone=this.checked;change();render()">Mostrar tareas completadas en la lista</label>
    <div class="hr"></div>
    <label class="tiny" style="font-weight:700">Formato horario</label>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn sm ${st.hourFmt === 24 ? "primary" : ""}" onclick="state.settings.hourFmt=24;change();render()">24 h</button>
      <button class="btn sm ${st.hourFmt === 12 ? "primary" : ""}" onclick="state.settings.hourFmt=12;change();render()">12 h</button></div>
  </div>
  <div class="card" style="margin:0"><h3>Etiquetas</h3>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${st.tags.map((t, i) => `<span class="pill">#${esc(t)} <a style="cursor:pointer;color:var(--bad);text-decoration:none" onclick="state.settings.tags.splice(${i},1);change();render()" title="Quitar">×</a></span>`).join("") || '<span class="tiny">Sin etiquetas.</span>'}</div>
    <div class="mrow"><div><input id="newTag" placeholder="nueva etiqueta" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:7px" onkeydown="if(event.key==='Enter')addTag()"></div><button class="btn sm" onclick="addTag()">Agregar</button></div>
  </div>
  <div class="card" style="margin:0"><h3>Datos</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn sm" onclick="exportJSON()">Exportar JSON</button>
      <button class="btn sm" onclick="go('backups')">Copias de seguridad</button>
      <button class="btn sm" onclick="exportCSV()">Exportar estadísticas CSV</button>
      <button class="btn sm danger" onclick="resetApp()">Reiniciar aplicación</button></div>
    <div class="hr"></div>
    <p class="tiny">Versión ${APP_VERSION} · ${state.meta.migratedV1 ? "Datos migrados de la versión anterior el " + (state.meta.migratedAt || "").slice(0, 10) : "Instalación nueva"} · Guardado principal: ${db ? "IndexedDB" : "localStorage"}</p>
    <button class="btn sm ghost" style="margin-top:6px" onclick="showShortcuts()">Ver atajos de teclado</button>
    <span id="installSlot"></span>
  </div>
  </div>`;
}
function addTag() { const i = byId("newTag"); const v = (i.value || "").trim().toLowerCase().replace(/^#/, ""); if (!v) return; if (!state.settings.tags.includes(v)) state.settings.tags.push(v); i.value = ""; change(); render(); }
function savePomoCfgFromConfig() {
  const p = state.settings.pomo;
  p.f = clamp(parseInt(byId("cfg_f").value) || p.f, 5, 120);
  p.s = clamp(parseInt(byId("cfg_s").value) || p.s, 1, 45);
  p.l = clamp(parseInt(byId("cfg_l").value) || p.l, 5, 90);
  p.c = clamp(parseInt(byId("cfg_c").value) || p.c, 2, 10);
  if (!state.timer.run) { state.timer.left = state.timer.total = phaseDur(state.timer.phase); }
  change(); renderPomoUI(); toast("Duraciones guardadas");
}
function toggleNotif(on) {
  if (!on) { state.settings.notif = false; change(); return; }
  if (typeof Notification === "undefined") { toast("Este navegador no soporta notificaciones"); render(); return; }
  Notification.requestPermission().then(p => {
    state.settings.notif = (p === "granted");
    if (p !== "granted") toast("Permiso de notificaciones denegado");
    else { toast("Notificaciones activadas"); checkReminders(); }
    change(); render();
  });
}
function setTheme(pref) {
  state.settings.theme = pref; change();
  try { localStorage.setItem("aula-theme", pref); } catch (e) {}
  applyTheme(); render();
}
function applyTheme() {
  const pref = state ? state.settings.theme : "auto";
  const dark = pref === "dark" || (pref === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themePref = pref;
  const btn = byId("btnTheme"); if (btn) btn.title = "Tema: " + (pref === "auto" ? "automático" : pref === "dark" ? "oscuro" : "claro");
}
function cycleTheme() {
  const order = ["light", "dark", "auto"];
  const next = order[(order.indexOf(state.settings.theme) + 1) % 3];
  setTheme(next);
  toast("Tema: " + (next === "auto" ? "automático" : next === "dark" ? "oscuro" : "claro"));
}
function setAccent(c) {
  state.settings.accent = c; change();
  document.documentElement.style.setProperty("--acc", c);
  try { localStorage.setItem("aula-accent", c); } catch (e) {}
  render();
}
function resetApp() {
  askConfirm({
    title: "Reiniciar aplicación", body: "Se borrarán TODAS las tareas, materias, evaluaciones, notas, hábitos y estadísticas de este navegador.", okLabel: "Continuar", danger: true,
    second: { title: "¿Estás completamente seguro?", body: "Esta acción es definitiva. Antes se creará una última copia de seguridad local por si te arrepentís (en Copias de seguridad).", okLabel: "Sí, borrar todo" },
    onOk: async () => {
      try { if (db) await idbPut("backups", "pre-reset-" + Date.now(), { ts: Date.now(), label: "Antes de reiniciar", data: JSON.stringify(state) }); } catch (e) {}
      state = baseState(); state.subjects = initialSubjects(); state.meta.migratedV1 = true; // no re-migrar
      change(); render(); toast("Aplicación reiniciada");
    }
  });
}
/* ============================ MODALES ============================ */
function openModal(html, wide) {
  const bg = byId("modalbg"), box = byId("modalbox");
  box.className = "modal" + (wide ? " wide" : "");
  box.innerHTML = html;
  bg.classList.add("open");
  const f = box.querySelector("input,select,textarea,button");
  if (f) setTimeout(() => f.focus(), 30);
}
function closeModal() { byId("modalbg").classList.remove("open"); }
function linkOptions(sel, includeTasks) {
  let h = `<option value="">— Sin vínculo —</option><optgroup label="Materias">`;
  h += activeSubjects().map(s => `<option value="s:${s.id}" ${sel === "s:" + s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("");
  h += `</optgroup><optgroup label="Proyectos">`;
  h += state.projects.filter(p => p.status !== "arch").map(p => `<option value="p:${p.id}" ${sel === "p:" + p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  h += `</optgroup>`;
  if (includeTasks) {
    h += `<optgroup label="Evaluaciones">` + state.evals.map(e => `<option value="e:${e.id}" ${sel === "e:" + e.id ? "selected" : ""}>${esc(e.name)}</option>`).join("") + `</optgroup>`;
    h += `<optgroup label="Tareas">` + state.tasks.filter(t => !t.archived && t.status !== "done").slice(0, 40).map(t => `<option value="t:${t.id}" ${sel === "t:" + t.id ? "selected" : ""}>${esc(t.title.slice(0, 44))}</option>`).join("") + `</optgroup>`;
  }
  return h;
}

/* ---------- Agregado rápido ---------- */
function openQuick() {
  openModal(`<h3>Agregado rápido</h3>
    <div class="grid3" style="gap:8px">
      ${[["task", "Tarea"], ["eval", "Parcial / final"], ["project", "Proyecto"], ["subject", "Materia"], ["note", "Nota"], ["habit", "Hábito"]].map(([k, v]) =>
        `<button class="btn" style="padding:14px" onclick="quickRoute('${k}')">${v}</button>`).join("")}
    </div>
    <p class="tiny" style="margin-top:12px">Atajos: <kbd>N</kbd> tarea · <kbd>/</kbd> buscar · <kbd>P</kbd> pomodoro · <kbd>Ctrl</kbd>+<kbd>K</kbd> acciones</p>`);
}
function quickRoute(k) {
  closeModal();
  if (k === "task") openQuickTask();
  else if (k === "eval") openEvalEditor();
  else if (k === "project") openProjectEditor();
  else if (k === "subject") openSubjectEditor();
  else if (k === "note") openNoteEditor();
  else if (k === "habit") openHabitEditor();
}
function openQuickTask(date, subjectId, projectId) {
  const sel = subjectId ? "s:" + subjectId : projectId ? "p:" + projectId : "";
  openModal(`<h3>Nueva tarea</h3>
    <label for="qt_title">Título</label><input id="qt_title" placeholder="Ej: resolver práctica de límites" onkeydown="if(event.key==='Enter')saveQuickTask()">
    <div class="mrow">
      <div><label for="qt_link">Materia / proyecto</label><select id="qt_link">${linkOptions(sel)}</select></div>
      <div><label for="qt_min">Tiempo estimado (min)</label><input id="qt_min" type="number" value="60" min="0" step="5"></div>
    </div>
    <div class="mrow">
      <div><label for="qt_mode">Programación</label><select id="qt_mode"><option value="d">Día fijo</option><option value="due" ${!date ? "" : ""}>Fecha límite (flexible)</option><option value="none">Sin fecha</option></select></div>
      <div><label for="qt_date">Fecha</label><input id="qt_date" type="date" value="${date || todayISO()}"></div>
    </div>
    <div class="mfoot"><span class="tiny grow">Después podés abrirla para completar detalles avanzados.</span>
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="saveQuickTask()">Crear tarea</button></div>`);
}
function saveQuickTask() {
  const title = byId("qt_title").value.trim();
  if (!title) { toast("Falta el título"); return; }
  const link = byId("qt_link").value, mode = byId("qt_mode").value, date = byId("qt_date").value || todayISO();
  const t = quickAddTask({
    title, estMin: parseInt(byId("qt_min").value) || 0,
    subjectId: link.startsWith("s:") ? link.slice(2) : null,
    projectId: link.startsWith("p:") ? link.slice(2) : null,
    date: mode === "d" ? date : null, due: mode === "due" ? date : null
  });
  closeModal(); render();
  toast("Tarea creada", () => { state.tasks = state.tasks.filter(x => x.id !== t.id); change(); render(); });
}

/* ---------- Editor completo de tarea ---------- */
function openTaskEditor(id) {
  const t = taskById(id); if (!t) return;
  const sel = t.subjectId ? "s:" + t.subjectId : t.projectId ? "p:" + t.projectId : "";
  const rec = t.recur || {};
  openModal(`<h3>Editar tarea</h3>
    <label for="te_title">Título</label><input id="te_title" value="${escA(t.title)}">
    <label for="te_desc">Descripción</label><textarea id="te_desc" rows="2">${esc(t.desc || "")}</textarea>
    <div class="mrow">
      <div><label for="te_link">Materia / proyecto</label><select id="te_link">${linkOptions(sel)}</select></div>
      <div><label for="te_eval">Evaluación / plan</label><select id="te_eval"><option value="">—</option>${state.evals.map(e => `<option value="${e.id}" ${t.evalId === e.id ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select></div>
    </div>
    <div class="mrow">
      <div><label for="te_date">Fecha programada</label><input id="te_date" type="date" value="${t.date || ""}"></div>
      <div><label for="te_due">Fecha límite</label><input id="te_due" type="date" value="${t.due || ""}"></div>
      <div><label for="te_min">Estimado (min)</label><input id="te_min" type="number" value="${t.estMin || 0}" min="0" step="5"></div>
    </div>
    <div class="mrow">
      <div><label for="te_prio">Prioridad</label><select id="te_prio">${PRIO.map((p, i) => `<option value="${i}" ${t.prio === i ? "selected" : ""}>${p}</option>`).join("")}</select></div>
      <div><label for="te_status">Estado</label><select id="te_status">${Object.entries(TASK_STATUS).map(([k, v]) => `<option value="${k}" ${t.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div><label for="te_type">Tipo</label><select id="te_type">${Object.entries(TASK_TYPES).map(([k, v]) => `<option value="${k}" ${t.type === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
    </div>
    <div class="mrow">
      <div><label for="te_tags">Etiquetas (separadas por coma)</label><input id="te_tags" value="${escA((t.tags || []).join(", "))}"></div>
      <div><label for="te_rec">Recurrencia</label><select id="te_rec" onchange="byId('te_recdays').style.display=(this.value==='days')?'block':'none';byId('te_recn').style.display=(this.value==='interval')?'block':'none'">
        <option value="">No se repite</option>
        <option value="daily" ${rec.kind === "daily" ? "selected" : ""}>Todos los días</option>
        <option value="days" ${rec.kind === "days" ? "selected" : ""}>Días específicos</option>
        <option value="weekly" ${rec.kind === "weekly" ? "selected" : ""}>Semanal</option>
        <option value="monthly" ${rec.kind === "monthly" ? "selected" : ""}>Mensual</option>
        <option value="interval" ${rec.kind === "interval" ? "selected" : ""}>Cada N días</option></select></div>
    </div>
    <div id="te_recdays" style="display:${rec.kind === "days" ? "block" : "none"};margin-top:6px">${DAYS.map((d, i) => `<label style="display:inline-flex;gap:3px;margin-right:8px;font-size:.72rem;text-transform:none;letter-spacing:0"><input type="checkbox" class="te_day" value="${i}" style="width:auto" ${(rec.days || []).includes(i) ? "checked" : ""}>${d}</label>`).join("")}</div>
    <div id="te_recn" style="display:${rec.kind === "interval" ? "block" : "none"};margin-top:6px"><input id="te_n" type="number" min="2" value="${rec.n || 2}" style="width:110px"> <span class="tiny">días de intervalo</span></div>
    <label>Subtareas</label><div id="te_subs"></div>
    <div class="mrow"><div><input id="te_newsub" placeholder="Nueva subtarea…" onkeydown="if(event.key==='Enter')addSubtaskFromEditor('${t.id}')"></div><button class="btn" onclick="addSubtaskFromEditor('${t.id}')">Agregar</button></div>
    <label for="te_notes">Notas de la tarea</label><textarea id="te_notes" rows="2">${esc(t.notes || "")}</textarea>
    <p class="tiny" style="margin-top:8px">Tiempo real: ${fmtMin(t.realMin || 0)} · ${t.pomos || 0} pomodoros · creada ${fmtD(t.createdAt)}${t.doneAt ? " · completada " + fmtD(t.doneAt) : ""}</p>
    <div class="mfoot">
      <button class="btn danger" onclick="deleteTask('${t.id}')">Eliminar</button>
      <button class="btn" onclick="archiveTask('${t.id}');closeModal()">${t.archived ? "Restaurar" : "Archivar"}</button>
      <button class="btn" onclick="duplicateTask('${t.id}');closeModal()">Duplicar</button>
      <div class="grow"></div>
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="saveTaskEditor('${t.id}')">Guardar</button></div>`, true);
  renderTaskEditorSubtasks(t);
}
function renderTaskEditorSubtasks(t) {
  const el = byId("te_subs"); if (!el) return;
  el.innerHTML = (t.subtasks || []).map(s => `<div style="display:flex;gap:8px;align-items:center;padding:4px 0">
    <div class="cb ${s.done ? "on" : ""}" style="width:16px;height:16px" onclick="toggleSubtask('${t.id}','${s.id}')">${s.done ? "✓" : ""}</div>
    <span style="flex:1;font-size:.8rem;${s.done ? "text-decoration:line-through;color:var(--tx3)" : ""}">${esc(s.t)}</span>
    <button class="btn sm ghost" onclick="removeSubtask('${t.id}','${s.id}')">×</button></div>`).join("") || '<p class="tiny">Sin subtareas.</p>';
}
function addSubtaskFromEditor(taskId) {
  const t = taskById(taskId); const i = byId("te_newsub");
  if (!t || !i || !i.value.trim()) return;
  t.subtasks = t.subtasks || [];
  t.subtasks.push({ id: uid(), t: i.value.trim(), done: false });
  i.value = ""; change(); renderTaskEditorSubtasks(t);
}
function removeSubtask(taskId, stId) {
  const t = taskById(taskId); if (!t) return;
  t.subtasks = (t.subtasks || []).filter(s => s.id !== stId);
  change(); renderTaskEditorSubtasks(t);
}
function saveTaskEditor(id) {
  const t = taskById(id); if (!t) return;
  const title = byId("te_title").value.trim();
  if (!title) { toast("El título no puede quedar vacío"); return; }
  t.title = title; t.desc = byId("te_desc").value;
  const link = byId("te_link").value;
  t.subjectId = link.startsWith("s:") ? link.slice(2) : null;
  t.projectId = link.startsWith("p:") ? link.slice(2) : null;
  const ev = byId("te_eval").value; t.evalId = ev || null; if (!ev) t.planId = null; else if (!t.planId) t.planId = ev;
  t.date = byId("te_date").value || null;
  t.due = byId("te_due").value || null;
  t.estMin = parseInt(byId("te_min").value) || 0;
  t.prio = parseInt(byId("te_prio").value);
  const prevStatus = t.status;
  t.status = byId("te_status").value;
  if (t.status === "done" && prevStatus !== "done") { t.doneAt = todayISO(); bumpDayDone(todayISO()); }
  if (t.status !== "done") t.doneAt = null;
  t.type = byId("te_type").value;
  t.tags = byId("te_tags").value.split(",").map(x => x.trim().replace(/^#/, "")).filter(Boolean);
  t.notes = byId("te_notes").value;
  const rk = byId("te_rec").value;
  if (rk) {
    t.recur = { kind: rk, days: [...document.querySelectorAll(".te_day:checked")].map(x => parseInt(x.value)), n: parseInt((byId("te_n") || {}).value) || 2, start: t.date || todayISO() };
    t.recurDone = t.recurDone || {};
  } else t.recur = null;
  change(); closeModal(); render(); toast("Tarea guardada");
}

/* ---------- Materia ---------- */
function openSubjectEditor(id) {
  const s = id ? subjById(id) : null;
  openModal(`<h3>${s ? "Editar materia" : "Nueva materia"}</h3>
    <label for="su_name">Nombre</label><input id="su_name" value="${s ? escA(s.name) : ""}" placeholder="Ej: Física I — Teoría">
    <div class="mrow">
      <div><label for="su_short">Abreviatura</label><input id="su_short" value="${s ? escA(s.short) : ""}" maxlength="5" placeholder="FIS1"></div>
      <div><label for="su_icon">Ícono (1–2 letras)</label><input id="su_icon" value="${s ? escA(s.icon || "") : ""}" maxlength="2" placeholder="F1"></div>
      <div><label for="su_color">Color</label><input id="su_color" type="color" value="${s ? s.color : SUBJ_COLORS[state.subjects.length % SUBJ_COLORS.length]}" style="height:36px;padding:2px"></div>
    </div>
    <div class="mfoot">
      ${s ? `<button class="btn" onclick="archiveSubject('${s.id}');closeModal()">${s.archived ? "Reactivar" : "Archivar"}</button>
      <button class="btn danger" onclick="deleteSubject('${s.id}')">Eliminar</button><div class="grow"></div>` : ""}
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="saveSubjectFromModal(${s ? "'" + s.id + "'" : "null"})">${s ? "Guardar" : "Crear"}</button></div>`);
}

/* ---------- Proyecto ---------- */
function openProjectEditor(id) {
  const p = id ? projById(id) : null;
  openModal(`<h3>${p ? "Editar proyecto" : "Nuevo proyecto u objetivo"}</h3>
    <label for="pr_name">Nombre</label><input id="pr_name" value="${p ? escA(p.name) : ""}" placeholder="Ej: Rendir final de Física / TP integrador">
    <label for="pr_desc">Descripción</label><textarea id="pr_desc" rows="2">${p ? esc(p.desc || "") : ""}</textarea>
    <div class="mrow">
      <div><label for="pr_due">Fecha objetivo</label><input id="pr_due" type="date" value="${p ? (p.due || "") : ""}"></div>
      <div><label for="pr_status">Estado</label><select id="pr_status">${Object.entries(PROJ_STATUS).map(([k, v]) => `<option value="${k}" ${p && p.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
    </div>
    <div class="mfoot">
      ${p ? `<button class="btn danger" onclick="deleteProject('${p.id}')">Eliminar</button><div class="grow"></div>` : ""}
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="saveProjectFromModal(${p ? "'" + p.id + "'" : "null"})">${p ? "Guardar" : "Crear"}</button></div>`);
}

/* ---------- Evaluación ---------- */
function openEvalEditor(id, presetLink) {
  const e = id ? evalById(id) : null;
  const sel = e ? (e.subjectId ? "s:" + e.subjectId : e.projectId ? "p:" + e.projectId : "") : (presetLink || "");
  openModal(`<h3>${e ? "Editar evaluación" : "Nueva evaluación"}</h3>
    <label for="ev_name">Nombre</label><input id="ev_name" value="${e ? escA(e.name) : ""}" placeholder="Ej: Primer parcial de Álgebra">
    <div class="mrow">
      <div><label for="ev_kind">Tipo</label><select id="ev_kind">${Object.entries(EVAL_KINDS).map(([k, v]) => `<option value="${k}" ${e && e.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div><label for="ev_link">Materia / proyecto</label><select id="ev_link">${linkOptions(sel)}</select></div>
    </div>
    <div class="mrow">
      <div><label for="ev_date">Fecha</label><input id="ev_date" type="date" value="${e ? e.date : todayISO()}"></div>
      <div><label for="ev_time">Hora (opcional)</label><input id="ev_time" type="time" value="${e ? (e.time || "") : ""}"></div>
      <div><label for="ev_rev">Días de repaso</label><input id="ev_rev" type="number" min="0" max="14" value="${e ? (e.reviewDays || 0) : 2}"></div>
    </div>
    <div class="mrow">
      <div><label for="ev_mode">Modalidad</label><input id="ev_mode" value="${e ? escA(e.mode || "") : ""}" placeholder="Presencial / Virtual"></div>
      <div><label for="ev_place">Lugar o enlace</label><input id="ev_place" value="${e ? escA(e.place || "") : ""}"></div>
    </div>
    <div class="mrow">
      <div><label for="ev_status">Estado</label><select id="ev_status">${Object.entries(EVAL_STATUS).map(([k, v]) => `<option value="${k}" ${(e ? e.status : "plan") === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div><label for="ev_tgrade">Nota objetivo</label><input id="ev_tgrade" value="${e ? escA(e.targetGrade || "") : ""}" placeholder="8"></div>
      <div><label for="ev_grade">Nota obtenida</label><input id="ev_grade" value="${e ? escA(String(e.grade ?? "")) : ""}" placeholder="—"></div>
    </div>
    <label for="ev_obs">Observaciones</label><textarea id="ev_obs" rows="2">${e ? esc(e.obs || "") : ""}</textarea>
    ${e ? "" : '<p class="tiny" style="margin-top:8px">Después de crearla vas a poder cargar los temas y generar el plan de estudio automático.</p>'}
    <div class="mfoot">
      ${e ? `<button class="btn danger" onclick="deleteEval('${e.id}')">Eliminar</button><div class="grow"></div>` : ""}
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="saveEvalFromModal(${e ? "'" + e.id + "'" : "null"})">${e ? "Guardar" : "Crear"}</button></div>`, true);
}

/* ---------- Asistente de plan ---------- */
function openPlanWizard(evId) {
  const e = evalById(evId); if (!e) return;
  const existing = evalPlanTasks(evId).filter(t => t.status !== "done").length;
  openModal(`<h3>Generar plan de estudio — ${esc(e.name)}</h3>
    <p class="tiny">${e.topics.length} temas cargados · examen el ${fmtD(e.date)} (${fmtRel(e.date)}) · ${e.reviewDays || 0} días finales de repaso${existing ? ` · <b style="color:var(--warn)">hay ${existing} tareas pendientes de un plan anterior</b>` : ""}</p>
    ${e.topics.length === 0 ? '<p class="muted" style="margin-top:8px;color:var(--warn)">No cargaste temas: el plan solo tendrá días de repaso y simulacros. Podés volver atrás y cargar temas en la ficha de la evaluación.</p>' : ""}
    <div class="mrow">
      <div><label for="pw_start">Empezar el</label><input id="pw_start" type="date" value="${todayISO()}"></div>
      <div><label for="pw_int">Intensidad</label><select id="pw_int"><option value="l">Liviana (~2,5 h/día)</option><option value="n" selected>Normal (~4 h/día)</option><option value="i">Intensa (~6 h/día)</option></select></div>
    </div>
    <label>Días en los que NO podés estudiar</label>
    <div>${DAYS.map((d, i) => `<label style="display:inline-flex;gap:3px;margin-right:8px;font-size:.72rem;text-transform:none;letter-spacing:0"><input type="checkbox" class="pw_blk" value="${i}" style="width:auto">${d}</label>`).join("")}</div>
    <label>Días preferidos (opcional)</label>
    <div>${DAYS.map((d, i) => `<label style="display:inline-flex;gap:3px;margin-right:8px;font-size:.72rem;text-transform:none;letter-spacing:0"><input type="checkbox" class="pw_pref" value="${i}" style="width:auto">${d}</label>`).join("")}</div>
    <div class="mrow" style="margin-top:10px">
      <div><label style="display:flex;gap:6px;align-items:center;text-transform:none;letter-spacing:0;font-size:.76rem"><input id="pw_theory" type="checkbox" checked style="width:auto">Generar tareas de teoría</label></div>
      <div><label style="display:flex;gap:6px;align-items:center;text-transform:none;letter-spacing:0;font-size:.76rem"><input id="pw_prac" type="checkbox" checked style="width:auto">Generar tareas de práctica</label></div>
    </div>
    <div class="mrow">
      <div><label style="display:flex;gap:6px;align-items:center;text-transform:none;letter-spacing:0;font-size:.76rem"><input id="pw_sum" type="checkbox" style="width:auto">Incluir resúmenes por tema</label></div>
      <div><label style="display:flex;gap:6px;align-items:center;text-transform:none;letter-spacing:0;font-size:.76rem"><input id="pw_exday" type="checkbox" style="width:auto">Permitir tareas el día del examen</label></div>
    </div>
    <p class="tiny" style="margin-top:10px">La intensidad es orientativa: nunca se bloquea agregar más tiempo. Los temas difíciles se priorizan primero. El progreso ya hecho no se borra.</p>
    <div class="mfoot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="runPlanWizard('${evId}')">${existing ? "Regenerar plan" : "Generar plan"}</button></div>`, true);
}
function runPlanWizard(evId) {
  const opts = {
    start: byId("pw_start").value || todayISO(),
    intensity: byId("pw_int").value,
    blockedWeekdays: [...document.querySelectorAll(".pw_blk:checked")].map(x => parseInt(x.value)),
    preferredWeekdays: [...document.querySelectorAll(".pw_pref:checked")].map(x => parseInt(x.value)),
    genTheory: byId("pw_theory").checked, genPractice: byId("pw_prac").checked,
    genSummary: byId("pw_sum").checked, allowExamDay: byId("pw_exday").checked
  };
  const existing = evalPlanTasks(evId).filter(t => t.status !== "done").length;
  const doRun = () => {
    const r = generatePlan(evId, Object.assign({ replaceExisting: true }, opts));
    closeModal();
    if (r.ok) { toast(r.msg); go("eval", evId); render(); }
    else toast(r.msg);
  };
  if (existing) {
    askConfirm({ title: "Reemplazar plan anterior", body: "Hay " + existing + " tareas pendientes del plan anterior que serán reemplazadas. Las completadas se conservan siempre.", okLabel: "Reemplazar y generar", onOk: doRun });
  } else doRun();
}

/* ---------- Hábito ---------- */
function openHabitEditor(id) {
  const h = id ? habitById(id) : null;
  const fr = h ? h.freq : { kind: "daily", days: [], n: 2 };
  openModal(`<h3>${h ? "Editar hábito" : "Nuevo hábito"}</h3>
    <label for="h_name">Nombre</label><input id="h_name" value="${h ? escA(h.name) : ""}" placeholder="Ej: Subir un commit / Leer 30 min">
    <label for="h_desc">Descripción</label><textarea id="h_desc" rows="2">${h ? esc(h.desc || "") : ""}</textarea>
    <div class="mrow">
      <div><label for="h_kind">Frecuencia</label><select id="h_kind" onchange="byId('h_days').style.display=(this.value==='days'||this.value==='weekly')?'block':'none';byId('h_nwrap').style.display=(this.value==='interval'||this.value==='monthly')?'block':'none'">
        <option value="daily" ${fr.kind === "daily" ? "selected" : ""}>Todos los días</option>
        <option value="days" ${fr.kind === "days" ? "selected" : ""}>Días específicos</option>
        <option value="weekly" ${fr.kind === "weekly" ? "selected" : ""}>Semanal</option>
        <option value="monthly" ${fr.kind === "monthly" ? "selected" : ""}>Mensual (día N)</option>
        <option value="interval" ${fr.kind === "interval" ? "selected" : ""}>Cada N días</option></select></div>
      <div><label for="h_subj">Materia (opcional)</label><select id="h_subj"><option value="">—</option>${activeSubjects().map(s => `<option value="${s.id}" ${h && h.subjectId === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></div>
    </div>
    <div id="h_days" style="display:${fr.kind === "days" || fr.kind === "weekly" ? "block" : "none"};margin-top:6px">${DAYS.map((d, i) => `<label style="display:inline-flex;gap:3px;margin-right:8px;font-size:.72rem;text-transform:none;letter-spacing:0"><input type="checkbox" class="h_day" value="${i}" style="width:auto" ${(fr.days || []).includes(i) ? "checked" : ""}>${d}</label>`).join("")}</div>
    <div id="h_nwrap" style="display:${fr.kind === "interval" || fr.kind === "monthly" ? "block" : "none"};margin-top:6px"><input id="h_n" type="number" min="1" max="30" value="${fr.n || 2}" style="width:110px"> <span class="tiny">N (día del mes o intervalo)</span></div>
    <div class="mrow">
      <div><label for="h_start">Desde</label><input id="h_start" type="date" value="${h ? (h.start || todayISO()) : todayISO()}"></div>
      <div><label for="h_end">Hasta (opcional)</label><input id="h_end" type="date" value="${h ? (h.end || "") : ""}"></div>
    </div>
    <div class="mfoot">
      ${h ? `<button class="btn danger" onclick="deleteHabit('${h.id}')">Eliminar</button><div class="grow"></div>` : ""}
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="saveHabitFromModal(${h ? "'" + h.id + "'" : "null"})">${h ? "Guardar" : "Crear"}</button></div>`);
}
/* ---------- Nota ---------- */
function openNoteEditor(id, presetLink) {
  const n = id ? noteById(id) : null;
  const sel = n ? (n.subjectId ? "s:" + n.subjectId : n.projectId ? "p:" + n.projectId : n.evalId ? "e:" + n.evalId : n.taskId ? "t:" + n.taskId : "") : (presetLink || "");
  openModal(`<h3>${n ? "Editar nota" : "Nueva nota"}</h3>
    <label for="n_title">Título</label><input id="n_title" value="${n ? escA(n.title) : ""}">
    <label for="n_body">Contenido <span style="text-transform:none;letter-spacing:0">(admite # títulos, - listas, **negrita**)</span></label>
    <textarea id="n_body" rows="9" oninput="autoSaveNote(${n ? "'" + n.id + "'" : "null"})">${n ? esc(n.body) : ""}</textarea>
    <div class="mrow">
      <div><label for="n_link">Vinculada a</label><select id="n_link">${linkOptions(sel, true)}</select></div>
      <div><label for="n_tags">Etiquetas</label><input id="n_tags" value="${n ? escA((n.tags || []).join(", ")) : ""}" placeholder="parcial, fórmulas"></div>
    </div>
    <p class="tiny" id="n_autosave" style="margin-top:6px">${n ? "Última modificación: " + new Date(n.updatedAt).toLocaleString("es-AR") : "El contenido se guarda automáticamente mientras escribís."}</p>
    <div class="mfoot">
      ${n ? `<button class="btn danger" onclick="deleteNote('${n.id}')">Eliminar</button>
      <button class="btn" onclick="pinNote('${n.id}');closeModal()">${n.pinned ? "Desfijar" : "Fijar"}</button><div class="grow"></div>` : ""}
      <button class="btn" onclick="closeModal()">Cerrar</button>
      <button class="btn primary" onclick="saveNoteFromModal(${n ? "'" + n.id + "'" : "null"})">Guardar</button></div>`, true);
}
let noteAsTimer = null;
function autoSaveNote(id) {
  clearTimeout(noteAsTimer);
  noteAsTimer = setTimeout(() => {
    const body = byId("n_body"); if (!body) return;
    if (id) { const n = noteById(id); if (n) { n.body = body.value; n.title = byId("n_title").value.trim() || n.title; n.updatedAt = new Date().toISOString(); change(); const a = byId("n_autosave"); if (a) a.textContent = "Guardado automáticamente " + new Date().toLocaleTimeString("es-AR"); } }
  }, 800);
}

/* ---------- Sesión manual ---------- */
function openManualSession() {
  openModal(`<h3>Registrar sesión manual</h3>
    <p class="tiny">Para cuando estudiaste sin el temporizador.</p>
    <div class="mrow">
      <div><label for="ms_min">Minutos</label><input id="ms_min" type="number" min="5" step="5" value="60"></div>
      <div><label for="ms_date">Fecha</label><input id="ms_date" type="date" value="${todayISO()}"></div>
    </div>
    <label for="ms_link">Vinculada a</label><select id="ms_link">${linkOptions("", true)}</select>
    <label for="ms_note">Nota (opcional)</label><input id="ms_note" placeholder="Qué estudiaste">
    <div class="mfoot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="logManualSession()">Registrar</button></div>`);
}
function openPomoCfg() { go("config"); toast("Las duraciones del pomodoro se editan acá"); }

/* ======================== BÚSQUEDA GLOBAL ======================== */
let searchMode = "search"; // 'search' | 'cmd'
function openSearch(mode) {
  searchMode = mode || "search";
  const bg = byId("searchbg"), box = byId("searchbox2");
  box.innerHTML = `<input id="sinput" placeholder="${searchMode === "cmd" ? "Escribí una acción…" : "Buscar tareas, materias, parciales, notas…"}"
      style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:9px;padding:11px 13px;font-size:.9rem"
      oninput="renderSearchResults()" onkeydown="searchKeydown(event)" aria-label="Buscar">
    <div id="sresults" style="margin-top:10px;max-height:56vh;overflow-y:auto"></div>
    <p class="tiny" style="margin-top:10px">↑↓ navegar · Enter abrir · Esc cerrar${searchMode === "search" ? " · Ctrl+K acciones rápidas" : ""}</p>`;
  bg.classList.add("open");
  ui.searchSel = 0;
  setTimeout(() => { const i = byId("sinput"); if (i) { i.focus(); renderSearchResults(); } }, 20);
}
function closeSearch() { byId("searchbg").classList.remove("open"); }
function searchItems(q) {
  q = q.toLowerCase().trim();
  const out = [];
  const match = s => !q || (s || "").toLowerCase().includes(q);
  if (searchMode === "cmd") {
    const cmds = [
      ["Nueva tarea", () => openQuickTask()], ["Nueva evaluación", () => openEvalEditor()], ["Nueva materia", () => openSubjectEditor()],
      ["Nuevo proyecto", () => openProjectEditor()], ["Nueva nota", () => openNoteEditor()], ["Nuevo hábito", () => openHabitEditor()],
      ["Registrar sesión manual", () => openManualSession()], ["Empezar pomodoro", () => { startPomo(); go("pomodoro"); }],
      ["Ir a Inicio", () => go("home")], ["Ir a Hoy", () => go("today")], ["Ir a Calendario", () => go("calendar")], ["Ir a Semana", () => go("week")],
      ["Ir a Materias", () => go("subjects")], ["Ir a Parciales y finales", () => go("evals")], ["Ir a Proyectos", () => go("projects")],
      ["Ir a Planes de estudio", () => go("plans")], ["Ir a Notas", () => go("notes")], ["Ir a Hábitos", () => go("habits")],
      ["Ir a Estadísticas", () => go("stats")], ["Ir a Historial", () => go("history")], ["Ir a Configuración", () => go("config")],
      ["Crear copia de seguridad", () => manualBackup()], ["Exportar JSON", () => exportJSON()], ["Exportar estadísticas CSV", () => exportCSV()],
      ["Cambiar tema", () => cycleTheme()], ["Ver atajos de teclado", () => showShortcuts()], ["Forzar guardado", () => { persist(); toast("Guardado"); }]
    ];
    for (const [label, fn] of cmds) if (match(label)) out.push({ kind: "Acción", label, fn });
    return out.slice(0, 14);
  }
  for (const t of state.tasks) if (!t.archived && (match(t.title) || match(t.desc) || (t.tags || []).some(x => match("#" + x)))) out.push({ kind: "Tarea", label: t.title, sub: (ownerOf(t) || {}).full, fn: () => openTaskEditor(t.id) });
  for (const s of state.subjects) if (match(s.name) || match(s.short)) out.push({ kind: "Materia", label: s.name, fn: () => go("subject", s.id) });
  for (const p of state.projects) if (match(p.name) || match(p.desc)) out.push({ kind: "Proyecto", label: p.name, fn: () => go("project", p.id) });
  for (const e of state.evals) if (match(e.name)) out.push({ kind: EVAL_KINDS[e.kind] || "Evaluación", label: e.name, sub: fmtD(e.date), fn: () => go("eval", e.id) });
  for (const n of state.notes) if (match(n.title) || match(n.body) || (n.tags || []).some(x => match("#" + x))) out.push({ kind: "Nota", label: n.title, fn: () => openNoteEditor(n.id) });
  for (const h of state.habits) if (match(h.name)) out.push({ kind: "Hábito", label: h.name, fn: () => go("habits") });
  return out.slice(0, 14);
}
function renderSearchResults() {
  const q = (byId("sinput") || {}).value || "";
  const res = searchItems(q);
  ui.searchRes = res;
  ui.searchSel = clamp(ui.searchSel, 0, Math.max(0, res.length - 1));
  const el = byId("sresults");
  el.innerHTML = res.length ? res.map((r, i) => `<div class="sres ${i === ui.searchSel ? "sel" : ""}" onclick="pickSearch(${i})">
    <span class="k">${esc(r.kind)}</span><span style="flex:1">${esc(r.label)}</span>${r.sub ? `<span class="tiny">${esc(r.sub)}</span>` : ""}</div>`).join("")
    : '<div class="empty">Sin resultados.</div>';
}
function pickSearch(i) {
  const r = (ui.searchRes || [])[i]; if (!r) return;
  closeSearch(); r.fn();
}
function searchKeydown(e) {
  if (e.key === "ArrowDown") { e.preventDefault(); ui.searchSel++; renderSearchResults(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); ui.searchSel--; renderSearchResults(); }
  else if (e.key === "Enter") { e.preventDefault(); pickSearch(ui.searchSel); }
}

/* ===================== ATAJOS DE TECLADO ===================== */
function showShortcuts() {
  openModal(`<h3>Atajos de teclado</h3>
    <div class="muted" style="line-height:2.2">
      <kbd>N</kbd> Nueva tarea<br>
      <kbd>/</kbd> Buscar<br>
      <kbd>P</kbd> Abrir Pomodoro<br>
      <kbd>Ctrl</kbd> + <kbd>K</kbd> Acciones rápidas<br>
      <kbd>Ctrl</kbd> + <kbd>S</kbd> Forzar guardado<br>
      <kbd>Esc</kbd> Cerrar modal o menú<br>
      <kbd>?</kbd> Esta ayuda
    </div>
    <div class="mfoot"><button class="btn primary" onclick="closeModal()">Cerrar</button></div>`);
}
function isTyping() {
  const a = document.activeElement;
  return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable);
}
function onKeydown(e) {
  if (e.key === "Escape") {
    if (byId("confirmbg").classList.contains("open")) { closeConfirm(); return; }
    if (byId("searchbg").classList.contains("open")) { closeSearch(); return; }
    if (byId("modalbg").classList.contains("open")) { closeModal(); return; }
    if (window.innerWidth < 980 && document.body.classList.contains("sb-open")) { toggleSidebar(false); return; }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); persist(); toast("Guardado"); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch("cmd"); return; }
  if (isTyping()) return;
  if (e.key === "n" || e.key === "N") { e.preventDefault(); openQuickTask(); }
  else if (e.key === "/") { e.preventDefault(); openSearch(); }
  else if (e.key === "p" || e.key === "P") { e.preventDefault(); go("pomodoro"); }
  else if (e.key === "?") { e.preventDefault(); showShortcuts(); }
}
/* Bloqueo de foco dentro del modal superior */
function trapFocus(e) {
  if (e.key !== "Tab") return;
  const tops = ["confirmbg", "searchbg", "modalbg"];
  let cont = null;
  for (const id of tops) { const el = byId(id); if (el && el.classList.contains("open")) { cont = el; break; } }
  if (!cont) return;
  const foc = [...cont.querySelectorAll("button,input,select,textarea,a[href],[tabindex]")].filter(x => !x.disabled && x.offsetParent !== null);
  if (!foc.length) return;
  const first = foc[0], last = foc[foc.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ============================ INIT ============================ */
async function init() {
  await loadState();
  applyTheme();
  try { localStorage.setItem("aula-theme", state.settings.theme); localStorage.setItem("aula-accent", state.settings.accent); } catch (e) {}
  document.documentElement.style.setProperty("--acc", state.settings.accent);
  // timer: recuperar si venció con la app cerrada
  const T = state.timer;
  if (!T.total) T.total = phaseDur(T.phase || "focus");
  if (T.run && T.ends) {
    if (Date.now() >= T.ends) { endPhase(true); T.run = false; T.ends = null; T.phase = "focus"; T.left = T.total = phaseDur("focus"); }
    else T.left = Math.round((T.ends - Date.now()) / 1000);
  }
  // sidebar: abierto por defecto en escritorio
  let sbPref = null; try { sbPref = localStorage.getItem("aula-sb"); } catch (e) {}
  if (window.innerWidth >= 980 && sbPref !== "0") document.body.classList.add("sb-open");
  byId("btnMenu").onclick = () => toggleSidebar();
  byId("btnTheme").onclick = cycleTheme;
  if (window.matchMedia) { try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch (e) {} }
  window.addEventListener("hashchange", () => { render(); if (window.innerWidth < 980) toggleSidebar(false); });
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("keydown", trapFocus);
  // cerrar modales al clickear el fondo
  for (const id of ["modalbg", "searchbg"]) byId(id).addEventListener("mousedown", e => { if (e.target.id === id) (id === "searchbg" ? closeSearch : closeModal)(); });
  byId("confirmbg").addEventListener("mousedown", e => { if (e.target.id === "confirmbg") closeConfirm(); });
  await dailyBackup();
  persist();
  render();
  setInterval(pomoTick, 300);
  setInterval(persist, 15000);
  setInterval(checkReminders, 5 * 60 * 1000);
  checkReminders();
  window.addEventListener("beforeunload", () => { try { const j = JSON.stringify(state); if (db) { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(j, "state"); } localStorage.setItem(EMERGENCY_KEY, j); } catch (e) {} });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") persist(); });
  // PWA: service worker + instalación
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); ui.installEvt = e;
    const slot = byId("installSlot");
    if (slot) slot.innerHTML = '<button class="btn sm primary" style="margin-left:8px" onclick="ui.installEvt&&ui.installEvt.prompt()">Instalar aplicación</button>';
  });
}
if (typeof document !== "undefined" && document.readyState !== "loading") init();
else if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);

