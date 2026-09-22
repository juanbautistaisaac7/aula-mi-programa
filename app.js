"use strict";
/* =====================================================================
   AULA — Organizador académico personal
   Vanilla JS · IndexedDB · PWA · sin dependencias externas
   ===================================================================== */
const APP_VERSION = "2.5.0";
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
function hmToMin(s) { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null; }

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
    dayLog: {}, dayPlan: {},
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
function change() { markDirty(); }

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
  s.dayLog = s.dayLog || {}; s.dayPlan = s.dayPlan || {}; s.meta = Object.assign(b.meta, s.meta || {});
  s.timer = Object.assign(b.timer, s.timer || {});
  s.v = 2;
  return s;
}

/* ================== MIGRACIÓN DESDE LA VERSIÓN 1 ================== */
function migrateV1(newState) {
  let old = null;
  try { old = JSON.parse(localStorage.getItem(OLD_LS_KEY)); } catch (e) { return false; }
  if (!old || !Array.isArray(old.tasks)) return false;

  const S = {};
  for (const sub of newState.subjects) S[sub.short] = sub.id;

  const projMQ = { id: uid(), name: "Presentación MQTT (POC)", desc: "Proyecto migrado desde la versión anterior. Ver videos, profundizar, armar POC y practicar la presentación.", due: "2026-08-05", status: "prog", createdAt: todayISO(), milestones: [], subjectIds: [S.CDT].filter(Boolean) };
  newState.projects.push(projMQ);

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
    if (t.exam) {
      if (t.done) { const map = { AN: evAN, CD: evCD, EC: evEC, MQ: evMQ }; if (map[t.s]) map[t.s].status = "rendido"; }
      continue;
    }
    newState.tasks.push(mapTask(t));
  }

  const habit = {
    id: uid(), name: "Proyecto de Desarrollo de Software (1–2 h)",
    desc: "Entender el proyecto y el trabajo de los compañeros, tomar apuntes, subir commits.",
    freq: { kind: "daily", days: [], n: 1 }, start: "2026-07-22", end: null,
    checks: Object.assign({}, old.habit || {}), archived: false, subjectId: S.DS, createdAt: todayISO()
  };
  newState.habits.push(habit);

  for (const [date, l] of Object.entries(old.log || {})) {
    if (l && l.p) newState.sessions.push({ id: uid(), date, min: l.p, pomos: l.n || 0, taskId: null, subjectId: null, projectId: null, evalId: null, manual: false, auto: false, ts: dToDate(date).getTime(), note: "Migrado de la versión anterior" });
    if (l && l.dt) newState.dayLog[date] = { tasksDone: l.dt };
  }
  if (old.cfg) newState.settings.pomo = { f: old.cfg.f || 25, s: old.cfg.s || 5, l: old.cfg.l || 15, c: old.cfg.c || 4 };

  newState.meta.migratedV1 = true;
  newState.meta.migratedAt = new Date().toISOString();
  return true;
}

async function loadState() {
  try { db = await idbOpen(); } catch (e) { db = null; }
  let raw = null;
  if (db) { try { raw = await idbGet("kv", "state"); } catch (e) {} }
  if (!raw && typeof localStorage !== "undefined") raw = localStorage.getItem("aula-state-fallback");
  if (raw) {
    try { const s = JSON.parse(raw); if (validState(s)) { state = normalizeState(s); return; } } catch (e) { console.warn("Estado dañado, intentando backups…"); }
  }
  if (db) {
    try {
      const keys = (await idbKeys("backups")).sort().reverse();
      for (const k of keys) {
        try { const b = await idbGet("backups", k); const s = JSON.parse(b.data); if (validState(s)) { state = normalizeState(s); toast("Datos recuperados desde una copia de seguridad"); return; } } catch (e) {}
      }
    } catch (e) {}
  }
  try {
    const em = typeof localStorage !== "undefined" ? localStorage.getItem(EMERGENCY_KEY) : null;
    if (em) { const s = JSON.parse(em); if (validState(s)) { state = normalizeState(s); toast("Datos recuperados desde la copia de emergencia"); return; } }
  } catch (e) {}
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
function ownerOf(t) {
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
  return orderedTasks(state.tasks.filter(t => !t.archived && t.status !== "canc" && occursOn(t, date)));
}
/* Orden dentro del día: primero las que ordenaste a mano (campo ord),
   después el resto por prioridad y duración. */
function orderedTasks(list) {
  return [...list].sort((a, b) => {
    const ao = (a.ord == null ? Infinity : a.ord), bo = (b.ord == null ? Infinity : b.ord);
    if (ao !== bo) return ao - bo;
    return (b.prio - a.prio) || ((a.estMin || 0) - (b.estMin || 0)) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
}
/* Reordenamiento por arrastre (escritorio) y botones ↑ ↓ (todos los dispositivos) */
let dragId = null, dragAfter = false;
function dragArm(el) { const p = el.closest && el.closest(".task"); if (p) p.draggable = true; }
function dragDisarm(el) { const p = el.closest && el.closest(".task"); if (p) p.draggable = false; }
function clearDropMarks() {
  document.querySelectorAll(".task.dropbefore,.task.dropafter").forEach(x => x.classList.remove("dropbefore", "dropafter"));
}
function taskDragStart(ev, id) {
  dragId = id; dragAfter = false;
  try { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", id); } catch (e) {}
  const el = ev.currentTarget;
  setTimeout(() => { if (el && el.classList) el.classList.add("dragging"); }, 0);
}
function taskDragEnd(ev) {
  const el = ev.currentTarget;
  if (el && el.classList) { el.classList.remove("dragging"); el.draggable = false; }
  clearDropMarks(); dragId = null;
}
function taskDragOver(ev, id) {
  if (!dragId || id === dragId) return;
  ev.preventDefault();
  try { ev.dataTransfer.dropEffect = "move"; } catch (e) {}
  const el = ev.currentTarget, r = el.getBoundingClientRect();
  dragAfter = (ev.clientY - r.top) > r.height / 2;
  clearDropMarks();
  el.classList.add(dragAfter ? "dropafter" : "dropbefore");
}
function taskDragLeave(ev) { const el = ev.currentTarget; if (el && el.classList) el.classList.remove("dropbefore", "dropafter"); }
function taskDrop(ev, targetId, date) {
  ev.preventDefault(); ev.stopPropagation();
  clearDropMarks();
  const src = dragId; dragId = null;
  if (!src || src === targetId) return;
  const ids = tasksOn(date).map(t => t.id);
  const from = ids.indexOf(src);
  if (from < 0) return;
  ids.splice(from, 1);
  let at = ids.indexOf(targetId);
  if (at < 0) return;
  applyOrder(ids, at + (dragAfter ? 1 : 0), src);
  toast("Orden actualizado");
}
function moveTaskOrder(id, dir, date) {
  const ids = tasksOn(date).map(t => t.id);
  const i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  ids.splice(i, 1);
  applyOrder(ids, j, id);
}
function applyOrder(ids, at, id) {
  ids.splice(clamp(at, 0, ids.length), 0, id);
  ids.forEach((x, k) => { const t = taskById(x); if (t) t.ord = k; });
  change(); render();
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
  const s = { id: uid(), date: opts.date || todayISO(), min: Math.round(min), pomos: opts.pomos || 0, taskId: opts.taskId || null, subjectId: opts.subjectId || null, projectId: opts.projectId || null, evalId: opts.evalId || null, manual: !!opts.manual, auto: !!opts.auto, ts: Date.now(), note: opts.note || "" };
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

function askConfirm(opts) {
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
    if (t.recurDone[d]) { delete t.recurDone[d]; uncreditTaskDone(t, d); }
    else { t.recurDone[d] = 1; bumpDayDone(d); askDoneTime(id, d); }
  } else if (t.status === "done") {
    t.status = "pend"; t.doneAt = null; uncreditTaskDone(t);
  } else {
    t.status = "done"; t.doneAt = todayISO(); bumpDayDone(todayISO()); askDoneTime(id);
  }
  change(); render();
}
function bumpDayDone(d) { state.dayLog[d] = state.dayLog[d] || {}; state.dayLog[d].tasksDone = (state.dayLog[d].tasksDone || 0) + 1; }
/* Al completar una tarea se pregunta cuánto llevó realmente: ese tiempo (no el estimado)
   es el que suma a las estadísticas de la materia. Se descuenta lo ya cronometrado con
   pomodoro/manual para no contar doble, y todo se revierte al desmarcar. */
function askDoneTime(taskId, date) {
  const t = taskById(taskId); if (!t) return;
  const already = t.recur ? 0 : (t.realMin || 0);
  const box = byId("confirmbox"), bg = byId("confirmbg");
  bg.classList.add("open");
  box.innerHTML = `<h3>Tarea completada</h3>
    <p class="muted">¿Cuánto tiempo te llevó “${esc(t.title.slice(0, 55))}”?${already ? " Ya tenés " + fmtMin(already) + " cronometrados: se suma solo la diferencia." : ""}</p>
    <label style="display:block;font-size:.66rem;color:var(--tx2);margin:12px 0 4px;text-transform:uppercase;letter-spacing:.06em;font-weight:700" for="dt_min">Tiempo real (minutos)</label>
    <input id="dt_min" type="number" min="0" step="5" value="${t.estMin || 60}" style="width:130px;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:8px"
      onkeydown="if(event.key==='Enter')resolveDoneTime('${t.id}','${date || ""}','input')">
    <div class="mfoot">
      <button class="btn" onclick="resolveDoneTime('${t.id}','${date || ""}',null)">Sin tiempo</button>
      <div class="grow"></div>
      ${t.estMin ? `<button class="btn" onclick="resolveDoneTime('${t.id}','${date || ""}','est')">Usar estimado (${fmtMin(t.estMin)})</button>` : ""}
      <button class="btn primary" onclick="resolveDoneTime('${t.id}','${date || ""}','input')">Guardar</button>
    </div>`;
  setTimeout(() => { const i = byId("dt_min"); if (i && i.focus) i.focus(); }, 40);
}
function resolveDoneTime(taskId, date, mode) {
  closeConfirm();
  const t = taskById(taskId); if (!t) { render(); return; }
  if (mode !== null) {
    const min = mode === "est" ? (t.estMin || 0) : Math.max(0, parseInt((byId("dt_min") || {}).value) || 0);
    const already = t.recur ? 0 : (t.realMin || 0);
    const credit = Math.max(0, min - already);
    if (credit > 0) addSession(credit, { taskId: t.id, date: t.recur ? (date || todayISO()) : todayISO(), auto: true, note: "Tarea completada (tiempo real)" });
    if (credit > 0 || already) toast("Registradas " + fmtMin(Math.max(min, already)) + " en la tarea");
    else toast("Tarea completada");
  } else toast("Tarea completada (sin tiempo registrado)");
  render();
}
function uncreditTaskDone(t, recurDate) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const s = state.sessions[i];
    if (s.taskId === t.id && s.auto && (!t.recur || s.date === recurDate)) {
      t.realMin = Math.max(0, (t.realMin || 0) - s.min);
      state.sessions.splice(i, 1);
    }
  }
  change();
}
function postponeTask(id) {
  const t = taskById(id); if (!t || t.recur) return;
  if (t.date) t.date = addDays(t.date < todayISO() ? todayISO() : t.date, 1);
  else if (t.due) t.due = addDays(t.due < todayISO() ? todayISO() : t.due, 1);
  else t.date = addDays(todayISO(), 1);
  t.status = t.status === "done" ? t.status : "post";
  t.ord = null; // al cambiar de día vuelve al final de ese día
  change(); render(); toast("Pospuesta para " + fmtD(t.date || t.due));
}
function assignToday(id) {
  const t = taskById(id); if (!t || t.recur) return;
  t.date = todayISO();
  if (t.status === "post") t.status = "pend";
  t.ord = null;
  change(); render(); toast("Asignada a hoy");
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

/* ================= ESTUDIO DE HOY (bloques horarios) ================= */
function pruneDayPlan() {
  const lim = addDays(todayISO(), -14);
  for (const k of Object.keys(state.dayPlan || {})) if (k < lim) delete state.dayPlan[k];
}
function blockMinutes(b) { const a = hmToMin(b.from), c = hmToMin(b.to); return a != null && c != null ? Math.max(0, c - a) : 0; }
function pomosInBlock(b) {
  if (!b.pomo) return 0;
  const P = state.settings.pomo;
  return Math.max(0, Math.floor((blockMinutes(b) + P.s) / (P.f + P.s)));
}
function addStudyBlock() {
  const from = byId("sb_from").value, to = byId("sb_to").value;
  const f = hmToMin(from), t = hmToMin(to);
  if (f == null || t == null) { toast("Cargá hora de inicio y de fin"); return; }
  if (t <= f) { toast("La hora de fin debe ser posterior a la de inicio"); return; }
  const dp = state.dayPlan[todayISO()] = state.dayPlan[todayISO()] || { blocks: [] };
  dp.blocks.push({ id: uid(), from, to, pomo: byId("sb_pomo").checked });
  dp.blocks.sort((a, b) => hmToMin(a.from) - hmToMin(b.from));
  change(); render(); toast("Bloque agregado");
}
function delStudyBlock(id) {
  const dp = state.dayPlan[todayISO()]; if (!dp) return;
  dp.blocks = dp.blocks.filter(b => b.id !== id);
  change(); render();
}
function updateDistLeft(total) {
  let sum = 0;
  document.querySelectorAll(".dist-inp").forEach(i => { sum += parseInt(i.value) || 0; });
  const el = byId("distLeft"); if (!el) return;
  if (sum > total) { el.textContent = "te pasás por " + (sum - total); el.style.color = "var(--warn)"; }
  else { el.textContent = "quedan " + (total - sum); el.style.color = ""; }
}
function createDistTasks() {
  const today = todayISO(), P = state.settings.pomo;
  let created = 0;
  document.querySelectorAll(".dist-inp").forEach(inp => {
    const n = parseInt(inp.value) || 0;
    if (n > 0) {
      quickAddTask({ title: "Sesión de estudio (" + n + " pomodoro" + (n > 1 ? "s" : "") + ")", subjectId: inp.dataset.sid, date: today, estMin: n * P.f, type: "estudio" });
      created++;
    }
  });
  if (!created) { toast("Asigná al menos un pomodoro a una materia"); return; }
  render(); toast(created + " tarea" + (created > 1 ? "s" : "") + " creada" + (created > 1 ? "s" : "") + " para hoy");
}
function studyTodayCard() {
  const today = todayISO();
  pruneDayPlan();
  const dp = state.dayPlan[today] = state.dayPlan[today] || { blocks: [] };
  const P = state.settings.pomo;
  const rows = dp.blocks.map(b => {
    const min = blockMinutes(b), n = pomosInBlock(b);
    return `<div class="task" style="cursor:default">
      <span class="pill acc" style="min-width:104px;text-align:center">${esc(b.from)} – ${esc(b.to)}</span>
      <div class="tinfo"><div class="tt">${fmtMin(min)}${b.pomo ? ` · con pomodoro: entran <b>${n}</b>` : " · sin pomodoro"}</div></div>
      <button class="btn sm ghost" title="Quitar bloque" onclick="delStudyBlock('${b.id}')">×</button></div>`;
  }).join("");
  const totMin = dp.blocks.reduce((a, b) => a + blockMinutes(b), 0);
  const totPom = dp.blocks.reduce((a, b) => a + pomosInBlock(b), 0);
  let dist = "";
  if (totPom > 0) {
    dist = `<div class="hr"></div>
    <p class="tiny" style="margin-bottom:6px">Distribuí los <b>${totPom}</b> pomodoros por materia y creá las tareas de hoy — <span id="distLeft">quedan ${totPom}</span></p>` +
    activeSubjects().map(s => `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">
      <span class="tag" style="background:${s.color}1c;color:${s.color};min-width:52px;text-align:center">${esc(s.short)}</span>
      <span style="flex:1;font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</span>
      <input type="number" class="dist-inp" data-sid="${s.id}" value="0" min="0" max="${totPom}" oninput="updateDistLeft(${totPom})" aria-label="Pomodoros para ${escA(s.name)}" style="width:64px;background:var(--card2);border:1px solid var(--line);border-radius:7px;padding:5px 7px"></div>`).join("") +
    `<div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn sm primary" onclick="createDistTasks()">Crear tareas para hoy</button></div>`;
  }
  return `<div class="card"><h3>Estudio de hoy<div class="grow"></div>
    <span class="tiny">${totMin ? fmtMin(totMin) + " disponibles" + (totPom ? " · " + totPom + " pomodoros posibles" : "") : ""}</span></h3>
    ${rows || '<p class="tiny" style="margin-bottom:6px">Cargá tus horarios de estudio de hoy. Podés agregar varios bloques (por ejemplo 14:00–17:00 y 20:00–22:00) y elegir en cuáles usás pomodoro.</p>'}
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
      <input type="time" id="sb_from" value="14:00" aria-label="Hora de inicio" style="background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:6px">
      <span class="tiny">a</span>
      <input type="time" id="sb_to" value="17:00" aria-label="Hora de fin" style="background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:6px">
      <label style="display:flex;gap:5px;align-items:center;font-size:.76rem;color:var(--tx2);cursor:pointer"><input type="checkbox" id="sb_pomo" checked style="width:auto">con pomodoro (${P.f}/${P.s})</label>
      <button class="btn sm" onclick="addStudyBlock()">Agregar bloque</button>
    </div>${dist}</div>`;
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
  const e = evalById(evId); if (!e) return { ok: false, msg: "Evaluación inexistente" };
  const topics = (e.topics || []).filter(t => t.state !== "dom");
  if (!topics.length && !e.reviewDays) return { ok: false, msg: "Cargá temas o días de repaso antes de generar el plan" };
  const start = opts.start || todayISO();
  const lastDay = opts.allowExamDay ? e.date : addDays(e.date, -1);
  if (start > lastDay) return { ok: false, msg: "No hay días disponibles entre el inicio y el examen" };

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
  const guide = opts.intensity === "l" ? 150 : opts.intensity === "i" ? 360 : 240;

  if (opts.replaceExisting) {
    state.tasks = state.tasks.filter(t => !(t.planId === evId && t.status !== "done"));
  }

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

  const load = {}; studyDays.forEach(d => load[d] = 0);
  const isPref = d => (opts.preferredWeekdays || []).length ? opts.preferredWeekdays.includes(dToDate(d).getDay()) : true;
  let created = 0;
  if (studyDays.length) {
    let di = 0;
    for (const job of jobs) {
      let placed = false, tries = 0;
      while (!placed && tries < studyDays.length * 2) {
        const d = studyDays[di % studyDays.length];
        const bonus = isPref(d) ? 0 : guide * .3;
        if (load[d] + bonus < guide || tries >= studyDays.length) {
          quickAddTask({ title: job.title, subjectId: e.subjectId, projectId: e.projectId, evalId: evId, planId: evId, date: d, estMin: job.min, type: job.type, prio: job.diff >= 3 ? 2 : 1 });
          load[d] += job.min; created++; placed = true;
        }
        di++; tries++;
      }
      if (!placed) { const d = studyDays[0]; quickAddTask({ title: job.title, subjectId: e.subjectId, projectId: e.projectId, evalId: evId, planId: evId, date: d, estMin: job.min, type: job.type }); created++; }
    }
  }
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
  if (!h.checks || (!h.checks[d] && habitDueOn(h, d))) d = addDays(d, -1);
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

/* ============= EVALUACIONES Y PROYECTOS QUE YA PASARON =============
   Al pasar la fecha (y hora) de un parcial/final/presentación —o la fecha
   objetivo de un proyecto— se pregunta el resultado en la próxima apertura
   o mientras la app esté abierta, hasta que el usuario cargue un estado. */
function checkPastEvals() {
  if (byId("confirmbg").classList.contains("open")) return; // no pisar otro diálogo
  const now = new Date();
  const asked = state.meta.askedPast = state.meta.askedPast || {};
  const dism = ui.dismissedAsk = ui.dismissedAsk || new Set();
  for (const e of state.evals) {
    if (["rendido", "aprob", "desaprob"].includes(e.status)) continue;
    const dt = dToDate(e.date);
    if (e.time) { const [hh, mm] = e.time.split(":"); dt.setHours(parseInt(hh) || 0, parseInt(mm) || 0); }
    else dt.setHours(23, 59);
    if (now > dt && asked["e" + e.id] !== e.date && !dism.has("e" + e.id)) { showPastAsk({ kind: "eval", e }); return; }
  }
  for (const p of state.projects) {
    if (["done", "arch"].includes(p.status) || !p.due) continue;
    if (todayISO() > p.due && asked["p" + p.id] !== p.due && !dism.has("p" + p.id)) { showPastAsk({ kind: "proj", p }); return; }
  }
}
function showPastAsk(item) {
  const box = byId("confirmbox"), bg = byId("confirmbg");
  bg.classList.add("open");
  if (item.kind === "eval") {
    const e = item.e;
    box.innerHTML = `<h3>Pasó ${EVAL_KINDS[e.kind] ? "tu " + EVAL_KINDS[e.kind].toLowerCase() : "tu evaluación"}: ${esc(e.name)}</h3>
      <p class="muted">Fue el ${fmtD(e.date)}${e.time ? " a las " + esc(e.time) : ""}. ¿Cómo te fue? Actualizá su estado para no olvidarte:</p>
      <label style="display:block;font-size:.66rem;color:var(--tx2);margin:12px 0 4px;text-transform:uppercase;letter-spacing:.06em;font-weight:700" for="pe_grade">Nota (opcional)</label>
      <input id="pe_grade" placeholder="Ej: 8" style="width:130px;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:7px">
      <div class="mfoot">
        <button class="btn ghost" onclick="dismissPastAsk('e${e.id}')">Más tarde</button>
        <div class="grow"></div>
        <button class="btn" onclick="setEvalOutcome('${e.id}','reprog')">Se reprogramó</button>
        <button class="btn" onclick="setEvalOutcome('${e.id}','rendido')">Rendido (sin nota aún)</button>
        <button class="btn danger" onclick="setEvalOutcome('${e.id}','desaprob')">Desaprobado</button>
        <button class="btn primary" onclick="setEvalOutcome('${e.id}','aprob')">Aprobado</button>
      </div>`;
  } else {
    const p = item.p;
    box.innerHTML = `<h3>Pasó la fecha objetivo: ${esc(p.name)}</h3>
      <p class="muted">Era el ${fmtD(p.due)}. ¿Cómo terminó el proyecto?</p>
      <div class="mfoot">
        <button class="btn ghost" onclick="dismissPastAsk('p${p.id}')">Más tarde</button>
        <div class="grow"></div>
        <button class="btn" onclick="setProjOutcome('${p.id}','prog')">Sigue en curso</button>
        <button class="btn" onclick="setProjOutcome('${p.id}','pausa')">Pausado</button>
        <button class="btn primary" onclick="setProjOutcome('${p.id}','done')">Completado</button>
      </div>`;
  }
}
function dismissPastAsk(key) {
  (ui.dismissedAsk = ui.dismissedAsk || new Set()).add(key); // vuelve a preguntar en la próxima apertura
  closeConfirm(); checkPastEvals();
}
function setEvalOutcome(id, status) {
  const e = evalById(id); if (!e) return;
  e.status = status;
  const g = (byId("pe_grade") || {}).value;
  if (g && String(g).trim()) e.grade = String(g).trim();
  (state.meta.askedPast = state.meta.askedPast || {})["e" + id] = e.date;
  change(); closeConfirm(); render();
  if (status === "reprog") { toast("Cargá la nueva fecha"); openEvalEditor(id); }
  else { toast("Estado actualizado: " + EVAL_STATUS[status]); checkPastEvals(); }
}
function setProjOutcome(id, status) {
  const p = projById(id); if (!p) return;
  p.status = status;
  (state.meta.askedPast = state.meta.askedPast || {})["p" + id] = p.due;
  change(); closeConfirm(); render();
  toast("Proyecto: " + PROJ_STATUS[status]);
  checkPastEvals();
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
  const canToday = !t.recur && !done && t.date !== todayISO();
  const srt = !!opts.sortable;
  const dnd = srt ? ` ondragstart="taskDragStart(event,'${t.id}')" ondragend="taskDragEnd(event)" ondragover="taskDragOver(event,'${t.id}')" ondragleave="taskDragLeave(event)" ondrop="taskDrop(event,'${t.id}','${date}')"` : "";
  return `<div class="task ${done ? "done" : ""}"${dnd} onclick="openTaskEditor('${t.id}')">
    ${srt ? `<span class="drag" title="Arrastrá para cambiar el orden del día" aria-hidden="true"
      onclick="event.stopPropagation()" onmousedown="dragArm(this)" onmouseup="dragDisarm(this)" ontouchstart="dragArm(this)">⣿</span>` : ""}
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
      ${srt ? `<button title="Subir en el orden del día" onclick="moveTaskOrder('${t.id}',-1,'${date}')">↑</button>
      <button title="Bajar en el orden del día" onclick="moveTaskOrder('${t.id}',1,'${date}')">↓</button>` : ""}
      <button title="Empezar pomodoro" onclick="startFromTask('${t.id}')">▸</button>
      ${canToday ? `<button title="Asignar a hoy" onclick="assignToday('${t.id}')">Hoy</button>` : ""}
      ${!t.recur ? `<button title="Posponer para mañana" onclick="postponeTask('${t.id}')">+1d</button>` : ""}
      <button title="Editar" onclick="openTaskEditor('${t.id}')">Editar</button>
      <button title="Eliminar definitivamente" style="color:var(--bad)" onclick="deleteTask('${t.id}')">×</button>
    </div>
  </div>`;
}
function startFromTask(id) { startPomo(id); go("pomodoro"); }

/* ============================ VISTA: INICIO ============================ */
function viewHome() {
  const today = todayISO();
  const dayTasks = tasksOn(today);
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

  h += `<div class="grid3" style="margin-bottom:12px">
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(est)}</div><div class="statlab">restante estimado para hoy${est > 420 ? ' · <span style="color:var(--warn)">día muy cargado</span>' : ""}</div></div>
    <div class="card" style="margin:0"><div class="statnum">${done.length}/${dayTasks.length}</div><div class="statlab">tareas de hoy (${donePct}%)</div>
      <div class="pbar" style="margin-top:6px"><i style="width:${donePct}%"></i></div></div>
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(focusToday)}</div><div class="statlab">estudiado hoy</div></div>
  </div>`;

  h += studyTodayCard();

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

  const sug = suggestNow(dayTasks, od, flex, evs);
  if (sug) h += `<div class="card" style="border-left:3px solid var(--acc)"><h3>Qué conviene hacer ahora</h3>${sug}</div>`;

  if (od.length) {
    h += `<div class="card" style="border-left:3px solid var(--bad)"><h3>Atrasadas (${od.length})
      <div class="grow"></div><button class="btn sm" onclick="postponeAllOverdue()">Mover todas a hoy</button></h3>`;
    h += od.slice(0, 8).map(t => taskRow(t, { showDate: true })).join("");
    if (od.length > 8) h += `<p class="tiny" style="padding:6px">y ${od.length - 8} más — <a href="#/list">ver lista completa</a></p>`;
    h += "</div>";
  }

  h += `<div class="card"><h3>Para hoy<div class="grow"></div><span class="tiny">${dayTasks.length ? fmtMin(dayTasks.reduce((a, t) => a + (t.estMin || 0), 0)) + " en total" : ""}</span></h3>`;
  h += dayTasks.length ? dayTasks.map(t => taskRow(t, { sortable: true })).join("") : `<div class="empty">Nada programado para hoy. Agregá una tarea o revisá las flexibles.</div>`;
  h += "</div>";

  if (habitsToday.length) {
    h += `<div class="card"><h3>Hábitos de hoy<div class="grow"></div><button class="btn sm ghost" onclick="go('habits')">Administrar</button></h3>`;
    h += habitsToday.map(hb => `<div class="task" onclick="go('habits')">
      <div class="cb ${hb.checks && hb.checks[today] ? "on" : ""}" onclick="event.stopPropagation();toggleHabit('${hb.id}')">${hb.checks && hb.checks[today] ? "✓" : ""}</div>
      <div class="tinfo"><div class="tt">${esc(hb.name)}</div></div>
      <span class="tiny">racha ${habitStreak(hb)}</span></div>`).join("");
    h += "</div>";
  }

  if (flex.length) {
    h += `<div class="card"><h3>Flexibles próximas a vencer<div class="grow"></div><span class="tiny">botón “Hoy” para asignarlas</span></h3>` + flex.slice(0, 6).map(t => taskRow(t, { showDate: true })).join("") + "</div>";
  }

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
  h += `<div class="card"><h3>Programadas para hoy<div class="grow"></div><span class="tiny">arrastrá ⣿ para ordenar tu día</span></h3>${dayTasks.length ? dayTasks.map(t => taskRow(t, { sortable: true })).join("") : '<div class="empty">Sin tareas programadas.</div>'}</div>`;
  if (flex.length) h += `<div class="card"><h3>Flexibles (vencen pronto)</h3>${flex.map(t => taskRow(t, { showDate: true })).join("")}</div>`;
  const tom = addDays(today, 1);
  const tomTasks = tasksOn(tom);
  if (tomTasks.length) h += `<div class="card"><h3>Mañana<div class="grow"></div><span class="tiny">podés marcarlas hechas si las adelantaste</span></h3>${tomTasks.map(t => taskRow(t, { date: tom, showDate: true, sortable: true })).join("")}</div>`;
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
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(real)}</div><div class="statlab">horas estudiadas (pomodoro + tareas hechas) · ${fmtMin(weekMin)} esta semana</div></div>
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
  h += `<div class="card"><h3>Temas<div class="grow"></div><span class="tiny">${fmtMin(e.topics.reduce((a, t) => a + (t.estMin || 0), 0))} estimados</span></h3>`;
  h += e.topics.map(tp => `<div class="task" style="cursor:default">
      <span class="pill ${tp.diff >= 3 ? "bad" : tp.diff === 2 ? "warn" : ""}" title="Dificultad">${tp.diff >= 3 ? "difícil" : tp.diff === 2 ? "media" : "fácil"}</span>
      <div class="tinfo"><div class="tt">${esc(tp.name)}</div><div class="tmeta"><span class="mins">${fmtMin(tp.estMin)}</span></div></div>
      <select style="width:auto;background:var(--card2);border:1px solid var(--line);border-radius:7px;padding:4px;font-size:.7rem" onchange="setTopicState('${e.id}','${tp.id}',this.value)" aria-label="Estado del tema">
        ${[["nv", "No visto"], ["emp", "Empezado"], ["ent", "Entendido"], ["dom", "Dominado"]].map(([k, v]) => `<option value="${k}" ${tp.state === k ? "selected" : ""}>${v}</option>`).join("")}
      </select>
      <button class="btn sm ghost" title="Eliminar tema" onclick="delTopic('${e.id}','${tp.id}')">×</button></div>`).join("");
  h += `<div class="mrow" style="margin-top:8px">
      <div style="flex:2"><input id="tp_new" placeholder="Nuevo tema…" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:8px"></div>
      <div><select id="tp_diff" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:8px"><option value="1">Fácil</option><option value="2" selected>Media</option><option value="3">Difícil</option></select></div>
      <div><input id="tp_min" type="number" value="90" min="10" step="10" title="Minutos estimados" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:8px"></div>
      <button class="btn" onclick="addTopic('${e.id}')">Agregar</button></div></div>`;
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
    <input placeholder="Filtrar notas…" value="${escA(ui.notesFilter || "")}" oninput="ui.notesFilter=this.value;render()" style="background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 10px;font-size:.78rem" aria-label="Filtrar notas">
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
    <select onchange="pomoSetLink(this.value)" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:8px;font-size:.8rem" aria-label="Vincular sesión">${pomoLinkOptions(sel)}</select>
    ${linked ? `<p class="tiny" style="margin-top:8px;text-align:left">${fmtMin(linked.realMin || 0)} acumulados en esta tarea · ${linked.pomos || 0} pomodoros</p>` : ""}
  </div>
  <div class="grid3" style="max-width:640px;margin:0 auto">
    <div class="card" style="margin:0"><div class="statnum">${todayPomos}</div><div class="statlab">pomodoros hoy</div></div>
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(todayMin)}</div><div class="statlab">estudiado hoy</div></div>
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

/* =====================================================================
   ESTADÍSTICAS — núcleo de cálculo, motor de gráficos SVG y póster
   ===================================================================== */
let svgUid = 0;
/* Colores resueltos a valores literales: los SVG deben verse igual dentro
   de la app y al exportarlos (donde las variables CSS no existen). */
function chartColors() {
  let cs = null;
  try { cs = getComputedStyle(document.documentElement); } catch (e) {}
  const dark = ((document.documentElement || {}).dataset || {}).theme === "dark";
  const g = (v, fb) => { try { const x = cs && cs.getPropertyValue(v); return (x && x.trim()) || fb; } catch (e) { return fb; } };
  return {
    dark,
    acc: g("--acc", "#4338ca"),
    tx: g("--tx", dark ? "#eef1f6" : "#101828"),
    tx2: g("--tx2", dark ? "#a8b3c4" : "#475467"),
    tx3: g("--tx3", dark ? "#66738a" : "#98a2b3"),
    card: g("--card", dark ? "#161b24" : "#ffffff"),
    card2: g("--card2", dark ? "#1d2430" : "#f1f3f6"),
    line: g("--line", dark ? "#2a3342" : "#e4e7ec"),
    ok: g("--ok", dark ? "#3ccb7f" : "#067647"),
    warn: g("--warn", dark ? "#f0b13c" : "#b54708"),
    bad: g("--bad", dark ? "#f27a6c" : "#b42318"),
    bg: g("--bg", dark ? "#0e1117" : "#f5f6f8")
  };
}
const SVG_FONT = "Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
function hClock(m) { const h = m / 60; return (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10) + " h"; }

/* ------------------------- Rango temporal ------------------------- */
function getStatsRange() {
  const today = todayISO();
  const kind = ui.statsRange || "month";
  const anc = ui.statsAnchor || today;
  if (kind === "week") {
    const ws = weekStartOf(anc, state.settings.weekStart);
    return { kind, from: ws, to: addDays(ws, 6), label: "Semana del " + fmtD(ws), short: "Semana" };
  }
  if (kind === "month") {
    const [Y, M] = anc.split("-").map(Number);
    const last = new Date(Y, M, 0).getDate();
    return { kind, from: Y + "-" + pad(M) + "-01", to: Y + "-" + pad(M) + "-" + pad(last), label: capitalize(MESL[M - 1]) + " " + Y, short: "Mes" };
  }
  if (kind === "year") {
    const Y = parseInt(anc.slice(0, 4));
    return { kind, from: Y + "-01-01", to: Y + "-12-31", label: "Año " + Y, short: "Año" };
  }
  return { kind: "all", from: firstActivityDate(), to: today, label: "Histórico completo", short: "Histórico" };
}
function firstActivityDate() {
  let d = null;
  for (const s of state.sessions) if (s.date && (!d || s.date < d)) d = s.date;
  for (const t of state.tasks) { const x = t.doneAt || t.createdAt; if (x && (!d || x < d)) d = x; }
  return d || state.meta.created || todayISO();
}
function shiftStats(dir) {
  const kind = ui.statsRange || "month";
  const anc = ui.statsAnchor || todayISO();
  if (kind === "week") ui.statsAnchor = addDays(weekStartOf(anc, state.settings.weekStart), dir * 7);
  else if (kind === "month") { const [Y, M] = anc.split("-").map(Number); ui.statsAnchor = iso(new Date(Y, M - 1 + dir, 1)); }
  else if (kind === "year") ui.statsAnchor = (parseInt(anc.slice(0, 4)) + dir) + "-01-01";
  render();
}
function setStatsRange(k) { ui.statsRange = k; ui.statsAnchor = todayISO(); render(); }

/* ---------------------- Cálculo de estadísticas ---------------------- */
function computeStats(R) {
  const today = todayISO();
  const inR = d => d && d >= R.from && d <= R.to;
  const sess = state.sessions.filter(s => inR(s.date));
  const byDay = {};
  for (const s of sess) byDay[s.date] = (byDay[s.date] || 0) + s.min;

  const days = [];
  for (let d = R.from; d <= R.to && days.length < 4000; d = addDays(d, 1)) days.push(d);
  const elapsed = days.filter(d => d <= today);
  const total = sess.reduce((a, s) => a + s.min, 0);
  const activeDays = Object.keys(byDay).length;
  const vals = Object.values(byDay).sort((a, b) => a - b);
  const median = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : Math.round((vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2)) : 0;
  let best = { d: null, m: 0 };
  for (const [d, m] of Object.entries(byDay)) if (m > best.m) best = { d, m };

  // rachas (globales, sobre todo el historial)
  const allDays = new Set(state.sessions.map(s => s.date));
  let streak = 0; { let d = today; if (!allDays.has(d)) d = addDays(d, -1); while (allDays.has(d)) { streak++; d = addDays(d, -1); } }
  let bestStreak = 0; { const srt = [...allDays].sort(); let cur = 0, prev = null; for (const d of srt) { cur = (prev && addDays(prev, 1) === d) ? cur + 1 : 1; bestStreak = Math.max(bestStreak, cur); prev = d; } }

  // composición del tiempo
  const comp = { pomo: 0, manual: 0, auto: 0, otro: 0 };
  for (const s of sess) {
    if (s.pomos) comp.pomo += s.min;
    else if (s.manual) comp.manual += s.min;
    else if (s.auto) comp.auto += s.min;
    else comp.otro += s.min;
  }

  // por día de la semana y por hora
  const dow = Array.from({ length: 7 }, () => ({ min: 0, n: 0 }));
  for (const [d, m] of Object.entries(byDay)) { const k = dToDate(d).getDay(); dow[k].min += m; dow[k].n++; }
  const hours = Array.from({ length: 24 }, () => 0);
  let hourKnown = 0;
  for (const s of sess) {
    if (!s.ts) continue;
    const dt = new Date(s.ts);
    if (isNaN(dt)) continue;
    const hh = dt.getHours(), mm = dt.getMinutes();
    if (hh === 0 && mm === 0) continue; // sesiones migradas sin hora real
    hours[hh] += s.min; hourKnown += s.min;
  }

  // materias y proyectos
  const subs = state.subjects.map(s => ({
    s, min: sess.filter(x => x.subjectId === s.id).reduce((a, x) => a + x.min, 0),
    done: state.tasks.filter(t => t.subjectId === s.id && t.status === "done" && inR(t.doneAt)).length,
    pend: state.tasks.filter(t => t.subjectId === s.id && !t.archived && t.status !== "done" && t.status !== "canc").length,
    sessions: sess.filter(x => x.subjectId === s.id).length
  })).filter(x => x.min > 0 || x.done > 0);
  subs.sort((a, b) => b.min - a.min);
  const projs = state.projects.map(p => ({
    p, min: sess.filter(x => x.projectId === p.id && !x.subjectId).reduce((a, x) => a + x.min, 0)
  })).filter(x => x.min > 0).sort((a, b) => b.min - a.min);

  // tareas
  const doneR = state.tasks.filter(t => t.status === "done" && inR(t.doneAt));
  const createdR = state.tasks.filter(t => inR(t.createdAt));
  const onTime = doneR.filter(t => { const lim = t.date || t.due; return lim && t.doneAt <= lim; }).length;
  const withLim = doneR.filter(t => t.date || t.due).length;
  const timed = doneR.filter(t => (t.estMin || 0) > 0 && (t.realMin || 0) > 0);
  const estSum = timed.reduce((a, t) => a + t.estMin, 0), realSum = timed.reduce((a, t) => a + t.realMin, 0);
  const byType = {};
  for (const t of doneR) byType[t.type || "estudio"] = (byType[t.type || "estudio"] || 0) + 1;
  const statusCount = { pend: 0, prog: 0, done: 0, post: 0, canc: 0 };
  for (const t of state.tasks) if (!t.archived) statusCount[t.status] = (statusCount[t.status] || 0) + 1;

  // evaluaciones
  const evalsR = state.evals.filter(e => inR(e.date));
  const graded = state.evals.filter(e => e.grade !== "" && e.grade != null && !isNaN(parseFloat(e.grade)))
    .map(e => ({ e, g: parseFloat(e.grade) })).sort((a, b) => a.e.date.localeCompare(b.e.date));
  const gradeAvg = graded.length ? Math.round(graded.reduce((a, x) => a + x.g, 0) / graded.length * 10) / 10 : null;

  // hábitos
  const habits = state.habits.filter(h => !h.archived).map(h => {
    let due = 0, ok = 0;
    for (const d of elapsed) { if (habitDueOn(h, d)) { due++; if (h.checks && h.checks[d]) ok++; } }
    return { h, due, ok, pct: due ? Math.round(ok / due * 100) : null };
  });

  // serie temporal con granularidad adaptativa
  let series = [], gran = "day";
  if (days.length <= 62) {
    gran = "day";
    series = days.map(d => ({ k: d, v: byDay[d] || 0, label: String(dToDate(d).getDate()), full: fmtD(d) }));
  } else if (days.length <= 190) {
    gran = "week";
    let cur = weekStartOf(R.from, state.settings.weekStart);
    while (cur <= R.to) {
      let v = 0; for (let i = 0; i < 7; i++) { const d = addDays(cur, i); if (d >= R.from && d <= R.to) v += byDay[d] || 0; }
      series.push({ k: cur, v, label: dToDate(cur).getDate() + "/" + (dToDate(cur).getMonth() + 1), full: "Semana del " + fmtD(cur) });
      cur = addDays(cur, 7);
    }
  } else {
    gran = "month";
    let [Y, M] = R.from.split("-").map(Number);
    const endK = R.to.slice(0, 7);
    while (Y + "-" + pad(M) <= endK && series.length < 240) {
      const key = Y + "-" + pad(M);
      let v = 0; for (const [d, m] of Object.entries(byDay)) if (d.slice(0, 7) === key) v += m;
      series.push({ k: key + "-01", v, label: MES[M - 1] + (M === 1 || series.length === 0 ? " " + String(Y).slice(2) : ""), full: capitalize(MESL[M - 1]) + " " + Y });
      M++; if (M > 12) { M = 1; Y++; }
    }
  }

  // comparación con el período anterior
  const spanDays = days.length;
  const prevFrom = addDays(R.from, -spanDays), prevTo = addDays(R.from, -1);
  const prevTotal = state.sessions.filter(s => s.date >= prevFrom && s.date <= prevTo).reduce((a, s) => a + s.min, 0);
  const prevDone = state.tasks.filter(t => t.status === "done" && t.doneAt >= prevFrom && t.doneAt <= prevTo).length;

  return {
    R, days, elapsed, byDay, sess, total, activeDays, median, best, streak, bestStreak, comp, dow, hours, hourKnown,
    subs, projs, doneR, createdR, onTime, withLim, timed, estSum, realSum, byType, statusCount,
    evalsR, graded, gradeAvg, habits, series, gran, prevTotal, prevDone,
    avgCalendar: elapsed.length ? total / elapsed.length : 0,
    avgActive: activeDays ? total / activeDays : 0,
    pomos: sess.reduce((a, s) => a + (s.pomos || 0), 0),
    sessionAvg: sess.length ? total / sess.length : 0,
    overdue: overdueTasks().length,
    coverage: elapsed.length ? Math.round(activeDays / elapsed.length * 100) : 0
  };
}

/* ========================= MOTOR DE GRÁFICOS ========================= */
function svgWrap(w, h, inner, cls) {
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block;height:auto;max-height:${h * 1.1}px;font-family:${SVG_FONT}" role="img" class="${cls || ""}">${inner}</svg>`;
}
function txt(x, y, s, size, fill, anchor, weight) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor || "start"}"${weight ? ` font-weight="${weight}"` : ""} font-family="${SVG_FONT}">${esc(s)}</text>`;
}
/* Línea + área con media móvil */
function chartTimeline(st, C, W, H) {
  const pts = st.series;
  const P = { l: 46, r: 16, t: 20, b: 34 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const max = Math.max(60, ...pts.map(p => p.v));
  const uid = "tl" + (++svgUid);
  const X = i => P.l + (pts.length <= 1 ? iw / 2 : i * iw / (pts.length - 1));
  const Y = v => P.t + ih - (v / max) * ih;
  let g = `<defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.acc}" stop-opacity=".38"/><stop offset="100%" stop-color="${C.acc}" stop-opacity="0"/></linearGradient></defs>`;
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4, y = Y(v);
    g += `<line x1="${P.l}" y1="${y}" x2="${W - P.r}" y2="${y}" stroke="${C.line}" stroke-width="1"${i ? ' stroke-dasharray="2 4"' : ""}/>`;
    g += txt(P.l - 8, y + 3.5, hClock(v), 9.5, C.tx3, "end");
  }
  const d = pts.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.v).toFixed(1)).join(" ");
  g += `<path d="${d} L ${X(pts.length - 1).toFixed(1)} ${P.t + ih} L ${X(0).toFixed(1)} ${P.t + ih} Z" fill="url(#${uid})"/>`;
  g += `<path d="${d}" fill="none" stroke="${C.acc}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
  // media móvil
  if (pts.length >= 5) {
    const win = pts.length > 40 ? 7 : 3;
    const ma = pts.map((_, i) => { const s = Math.max(0, i - win + 1); const sl = pts.slice(s, i + 1); return sl.reduce((a, p) => a + p.v, 0) / sl.length; });
    g += `<path d="${ma.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ")}" fill="none" stroke="${C.warn}" stroke-width="1.6" stroke-dasharray="5 4" opacity=".85"/>`;
    g += txt(W - P.r, P.t - 7, "media móvil " + win, 9, C.warn, "end");
  }
  const step = Math.ceil(pts.length / (W > 800 ? 26 : 12));
  pts.forEach((p, i) => {
    if (pts.length <= 40 && p.v > 0) g += `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="2.6" fill="${C.acc}"><title>${escA(p.full + " · " + fmtMin(p.v))}</title></circle>`;
    if (i % step === 0 || i === pts.length - 1) g += txt(X(i), H - 12, p.label, 9, C.tx3, "middle");
  });
  const avg = st.total / Math.max(1, pts.length);
  if (avg > 0) {
    g += `<line x1="${P.l}" y1="${Y(avg)}" x2="${W - P.r}" y2="${Y(avg)}" stroke="${C.ok}" stroke-width="1.3" stroke-dasharray="7 5" opacity=".9"/>`;
    g += txt(P.l + 5, Y(avg) - 5, "promedio " + hClock(avg), 9, C.ok, "start", 700);
  }
  return svgWrap(W, H, g);
}
/* Barras verticales genéricas */
function chartBars(items, C, W, H, o) {
  o = o || {};
  const P = { l: o.noAxis ? 8 : 40, r: 12, t: 16, b: 28 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const max = Math.max(1, ...items.map(x => x.v));
  const bw = iw / items.length;
  let g = "";
  if (!o.noAxis) for (let i = 0; i <= 3; i++) {
    const v = max * i / 3, y = P.t + ih - (v / max) * ih;
    g += `<line x1="${P.l}" y1="${y}" x2="${W - P.r}" y2="${y}" stroke="${C.line}" stroke-width="1"${i ? ' stroke-dasharray="2 4"' : ""}/>`;
    g += txt(P.l - 7, y + 3.5, o.fmt ? o.fmt(v) : hClock(v), 9, C.tx3, "end");
  }
  items.forEach((x, i) => {
    const bh = Math.max(x.v > 0 ? 3 : 0, (x.v / max) * ih);
    const bx = P.l + i * bw + bw * .16, w = bw * .68;
    g += `<rect x="${bx.toFixed(1)}" y="${(P.t + ih - bh).toFixed(1)}" width="${w.toFixed(1)}" height="${bh.toFixed(1)}" rx="${Math.min(4, w / 3).toFixed(1)}" fill="${x.color || C.acc}" opacity="${x.dim ? .45 : .95}"><title>${escA((x.full || x.label) + " · " + (o.fmt ? o.fmt(x.v) : fmtMin(x.v)))}</title></rect>`;
    if (items.length <= 26) g += txt(bx + w / 2, H - 10, x.label, items.length > 14 ? 8 : 9.5, x.hi ? C.acc : C.tx3, "middle", x.hi ? 700 : 400);
    if (o.valueLabels && x.v > 0) g += txt(bx + w / 2, P.t + ih - bh - 5, o.fmt ? o.fmt(x.v) : hClock(x.v), 8.5, C.tx2, "middle", 600);
  });
  return svgWrap(W, H, g);
}
/* Dona con leyenda */
function chartDonut(items, C, W, H, o) {
  o = o || {};
  const cx = H / 2 + 6, cy = H / 2, rOut = H / 2 - 12, rIn = rOut * .62;
  const tot = items.reduce((a, x) => a + x.v, 0) || 1;
  let a0 = -Math.PI / 2, g = "";
  items.forEach(x => {
    const a1 = a0 + (x.v / tot) * Math.PI * 2;
    const big = (a1 - a0) > Math.PI ? 1 : 0;
    const p = (r, a) => [(cx + r * Math.cos(a)).toFixed(2), (cy + r * Math.sin(a)).toFixed(2)];
    const [x1, y1] = p(rOut, a0), [x2, y2] = p(rOut, a1), [x3, y3] = p(rIn, a1), [x4, y4] = p(rIn, a0);
    g += `<path d="M${x1} ${y1} A${rOut} ${rOut} 0 ${big} 1 ${x2} ${y2} L${x3} ${y3} A${rIn} ${rIn} 0 ${big} 0 ${x4} ${y4} Z" fill="${x.color}" opacity=".93"><title>${escA(x.label + " · " + fmtMin(x.v) + " · " + Math.round(x.v / tot * 100) + "%")}</title></path>`;
    a0 = a1;
  });
  g += txt(cx, cy - 2, o.center || hClock(tot), 17, C.tx, "middle", 800);
  g += txt(cx, cy + 14, o.sub || "total", 9, C.tx3, "middle");
  const lx = H + 22;
  items.slice(0, 9).forEach((x, i) => {
    const ly = 22 + i * 19;
    g += `<rect x="${lx}" y="${ly - 8}" width="10" height="10" rx="3" fill="${x.color}"/>`;
    g += txt(lx + 16, ly + 1, x.label.length > 24 ? x.label.slice(0, 23) + "…" : x.label, 10.5, C.tx2);
    g += txt(W - 8, ly + 1, hClock(x.v) + "  " + Math.round(x.v / tot * 100) + "%", 10, C.tx3, "end");
  });
  return svgWrap(W, H, g);
}
/* Barras horizontales */
function chartHBars(items, C, W, H, o) {
  o = o || {};
  const rowH = Math.min(30, (H - 14) / Math.max(1, items.length));
  const lw = o.labelW || 84, vw = 86;
  const max = Math.max(1, ...items.map(x => x.v));
  let g = "";
  items.forEach((x, i) => {
    const y = 10 + i * rowH;
    g += `<rect x="${lw - 8 - Math.min(52, x.label.length * 6.2)}" y="${y + rowH / 2 - 8}" width="${Math.min(52, x.label.length * 6.2)}" height="16" rx="5" fill="${x.color}" opacity=".16"/>`;
    g += txt(lw - 12, y + rowH / 2 + 4, x.label, 10, x.color, "end", 700);
    const bw = (W - lw - vw) * (x.v / max);
    g += `<rect x="${lw}" y="${y + rowH / 2 - 7}" width="${W - lw - vw}" height="14" rx="7" fill="${C.card2}"/>`;
    g += `<rect x="${lw}" y="${y + rowH / 2 - 7}" width="${Math.max(2, bw).toFixed(1)}" height="14" rx="7" fill="${x.color}"><title>${escA(x.full || x.label)}</title></rect>`;
    g += txt(W - 6, y + rowH / 2 + 4, x.vLabel || hClock(x.v), 10, C.tx2, "end", 600);
  });
  return svgWrap(W, H, g);
}
/* Barras dobles (estimado vs real) */
function chartDual(items, C, W, H) {
  const P = { l: 62, r: 14, t: 26, b: 26 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const max = Math.max(1, ...items.map(x => Math.max(x.a, x.b)));
  const bw = iw / items.length;
  let g = txt(P.l, 12, "estimado", 9.5, C.tx3) + `<rect x="${P.l - 12}" y="5" width="8" height="8" rx="2" fill="${C.tx3}" opacity=".5"/>`;
  g += txt(P.l + 74, 12, "real", 9.5, C.acc) + `<rect x="${P.l + 62}" y="5" width="8" height="8" rx="2" fill="${C.acc}"/>`;
  for (let i = 0; i <= 3; i++) {
    const v = max * i / 3, y = P.t + ih - (v / max) * ih;
    g += `<line x1="${P.l}" y1="${y}" x2="${W - P.r}" y2="${y}" stroke="${C.line}" stroke-width="1"${i ? ' stroke-dasharray="2 4"' : ""}/>` + txt(P.l - 7, y + 3.5, hClock(v), 9, C.tx3, "end");
  }
  items.forEach((x, i) => {
    const x0 = P.l + i * bw;
    const ha = (x.a / max) * ih, hb = (x.b / max) * ih;
    g += `<rect x="${(x0 + bw * .16).toFixed(1)}" y="${(P.t + ih - ha).toFixed(1)}" width="${(bw * .3).toFixed(1)}" height="${ha.toFixed(1)}" rx="3" fill="${C.tx3}" opacity=".45"><title>estimado ${escA(fmtMin(x.a))}</title></rect>`;
    g += `<rect x="${(x0 + bw * .52).toFixed(1)}" y="${(P.t + ih - hb).toFixed(1)}" width="${(bw * .3).toFixed(1)}" height="${hb.toFixed(1)}" rx="3" fill="${x.color || C.acc}"><title>real ${escA(fmtMin(x.b))}</title></rect>`;
    g += txt(x0 + bw / 2, H - 9, x.label, 9, C.tx3, "middle");
  });
  return svgWrap(W, H, g);
}
/* Barra apilada horizontal */
function chartStack(parts, C, W, H) {
  const tot = parts.reduce((a, p) => a + p.v, 0) || 1;
  let x = 0, g = "";
  parts.forEach(p => {
    const w = (p.v / tot) * W;
    if (w > 0) g += `<rect x="${x.toFixed(1)}" y="0" width="${Math.max(1, w - 2).toFixed(1)}" height="26" rx="6" fill="${p.color}"><title>${escA(p.label + " · " + fmtMin(p.v) + " · " + Math.round(p.v / tot * 100) + "%")}</title></rect>`;
    x += w;
  });
  parts.filter(p => p.v > 0).forEach((p, i) => {
    g += `<rect x="${i * Math.min(160, W / 4)}" y="36" width="9" height="9" rx="2.5" fill="${p.color}"/>`;
    g += txt(i * Math.min(160, W / 4) + 14, 44, p.label + " " + Math.round(p.v / tot * 100) + "%", 9.5, C.tx2);
  });
  return svgWrap(W, H, g);
}
/* Mapa de calor anual estilo contribuciones */
function chartHeat(C, W, H, endDate, weeks) {
  const cell = 11, gap = 3, step = cell + gap;
  const end = weekStartOf(endDate, state.settings.weekStart);
  const start = addDays(end, -7 * (weeks - 1));
  const byDay = {};
  for (const s of state.sessions) byDay[s.date] = (byDay[s.date] || 0) + s.min;
  const max = Math.max(60, ...Object.values(byDay));
  let g = "", lastMonth = "";
  for (let w = 0; w < weeks; w++) {
    const colDate = addDays(start, w * 7);
    const mk = colDate.slice(5, 7);
    if (mk !== lastMonth && dToDate(colDate).getDate() <= 7) { g += txt(34 + w * step, 10, MES[parseInt(mk) - 1], 8.5, C.tx3); lastMonth = mk; }
    for (let d = 0; d < 7; d++) {
      const date = addDays(colDate, d);
      if (date > endDate) continue;
      const m = byDay[date] || 0;
      const op = m ? clamp(.22 + (m / max) * .78, .22, 1) : 1;
      g += `<rect x="${34 + w * step}" y="${16 + d * step}" width="${cell}" height="${cell}" rx="2.6" fill="${m ? C.acc : C.card2}" opacity="${op.toFixed(2)}"><title>${escA(fmtD(date) + " · " + fmtMin(m))}</title></rect>`;
    }
  }
  const ws = state.settings.weekStart;
  [1, 3, 5].forEach(i => { g += txt(28, 16 + i * step + 9, DAYS[(ws + i) % 7], 8.5, C.tx3, "end"); });
  const lx = 34 + weeks * step - 118;
  g += txt(lx - 6, 16 + 7 * step + 14, "menos", 8.5, C.tx3, "end");
  [.22, .45, .68, .85, 1].forEach((op, i) => { g += `<rect x="${lx + i * 15}" y="${16 + 7 * step + 5}" width="11" height="11" rx="2.6" fill="${C.acc}" opacity="${op}"/>`; });
  g += txt(lx + 82, 16 + 7 * step + 14, "más", 8.5, C.tx3);
  return svgWrap(W, H, g);
}
/* Evolución de notas */
function chartGrades(graded, C, W, H) {
  const P = { l: 30, r: 14, t: 16, b: 30 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const max = Math.max(10, ...graded.map(x => x.g));
  const X = i => P.l + (graded.length <= 1 ? iw / 2 : i * iw / (graded.length - 1));
  const Y = v => P.t + ih - (v / max) * ih;
  let g = "";
  for (let i = 0; i <= 2; i++) { const v = max * i / 2, y = Y(v); g += `<line x1="${P.l}" y1="${y}" x2="${W - P.r}" y2="${y}" stroke="${C.line}" stroke-dasharray="2 4"/>` + txt(P.l - 6, y + 3.5, String(Math.round(v)), 9, C.tx3, "end"); }
  const y4 = Y(4);
  g += `<line x1="${P.l}" y1="${y4}" x2="${W - P.r}" y2="${y4}" stroke="${C.bad}" stroke-width="1.2" stroke-dasharray="6 4" opacity=".7"/>`;
  if (graded.length > 1) g += `<path d="${graded.map((x, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(x.g).toFixed(1)).join(" ")}" fill="none" stroke="${C.acc}" stroke-width="2.2" stroke-linejoin="round"/>`;
  graded.forEach((x, i) => {
    g += `<circle cx="${X(i).toFixed(1)}" cy="${Y(x.g).toFixed(1)}" r="4.5" fill="${x.g >= 4 ? C.ok : C.bad}"><title>${escA(x.e.name + " · " + x.g)}</title></circle>`;
    g += txt(X(i), Y(x.g) - 9, String(x.g), 9.5, C.tx2, "middle", 700);
    g += txt(X(i), H - 16, (x.e.name || "").slice(0, 12), 8, C.tx3, "middle");
    g += txt(X(i), H - 6, fmtD(x.e.date).slice(4), 7.5, C.tx3, "middle");
  });
  return svgWrap(W, H, g);
}
/* Anillo de progreso */
function chartRing(pct, C, size, color, label, sub) {
  const r = size / 2 - 9, cx = size / 2, cy = size / 2, cir = 2 * Math.PI * r;
  const off = cir * (1 - clamp(pct, 0, 100) / 100);
  let g = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.card2}" stroke-width="9"/>`;
  g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${cir.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
  g += txt(cx, cy + 3, label, size / 5, C.tx, "middle", 800);
  if (sub) g += txt(cx, cy + size / 5 + 6, sub, size / 12, C.tx3, "middle");
  return svgWrap(size, size, g);
}

/* ========================== VISTA COMPLETA ========================== */
function viewStats() {
  const R = getStatsRange();
  const st = computeStats(R);
  const C = chartColors();
  const dTot = st.total - st.prevTotal;
  const tab = (k, l) => `<button class="btn sm ${(ui.statsRange || "month") === k ? "primary" : ""}" onclick="setStatsRange('${k}')">${l}</button>`;

  let h = `<div class="vhead"><h2>Estadísticas</h2><span class="sub">${esc(R.label)}</span><div class="grow"></div>
    <button class="btn primary" onclick="openPosterModal()">Descargar informe</button>
    <button class="btn ghost" onclick="exportRangeCSV()" title="Planilla con el resumen de este período">CSV</button></div>`;

  h += `<div class="card" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 12px">
    ${tab("week", "Semana")}${tab("month", "Mes")}${tab("year", "Año")}${tab("all", "Histórico")}
    <div class="grow"></div>
    ${R.kind !== "all" ? `<button class="btn sm ghost" onclick="shiftStats(-1)" title="Anterior">‹</button>
    <span class="tiny" style="min-width:120px;text-align:center;font-weight:700;color:var(--tx2)">${esc(R.label)}</span>
    <button class="btn sm ghost" onclick="shiftStats(1)" title="Siguiente" ${R.to >= todayISO() ? "disabled" : ""}>›</button>` : `<span class="tiny">${fmtD(R.from)} → ${fmtD(R.to)} · ${st.days.length} días</span>`}
  </div>`;

  /* --- KPIs --- */
  const kpi = (v, l, extra) => `<div class="card"><div class="statnum">${v}</div><div class="statlab">${l}</div>${extra || ""}</div>`;
  h += `<div class="statgrid">
    ${kpi(hClock(st.total), "total estudiado" + (st.prevTotal ? ` · <span style="color:${dTot >= 0 ? "var(--ok)" : "var(--bad)"}">${dTot >= 0 ? "▲" : "▼"} ${hClock(Math.abs(dTot))} vs período anterior</span>` : ""))}
    ${kpi(hClock(st.avgCalendar), "promedio por día (todos los días)")}
    ${kpi(hClock(st.avgActive), "promedio por día activo")}
    ${kpi(hClock(st.median), "mediana diaria")}
    ${kpi(st.best.d ? hClock(st.best.m) : "—", st.best.d ? "mejor día · " + fmtD(st.best.d) : "mejor día")}
    ${kpi(st.activeDays + "<span style='font-size:1rem;color:var(--tx3)'>/" + st.elapsed.length + "</span>", "días con actividad (" + st.coverage + "% de constancia)")}
    ${kpi(st.streak, "racha actual · mejor: " + st.bestStreak + " días")}
    ${kpi(st.pomos, "pomodoros · " + st.sess.length + " sesiones")}
    ${kpi(hClock(st.sessionAvg), "duración media por sesión")}
    ${kpi(st.doneR.length, "tareas completadas" + (st.prevDone ? ` · ${st.doneR.length >= st.prevDone ? "▲" : "▼"} ${Math.abs(st.doneR.length - st.prevDone)} vs anterior` : ""))}
    ${kpi(st.withLim ? Math.round(st.onTime / st.withLim * 100) + "%" : "—", "completadas en fecha (" + st.onTime + "/" + st.withLim + ")")}
    ${kpi(st.overdue, st.overdue ? `tareas atrasadas <span style="color:var(--bad)">a resolver</span>` : "tareas atrasadas · estás al día")}
  </div>`;

  /* --- Evolución --- */
  h += `<div class="card"><h3>Evolución ${st.gran === "day" ? "diaria" : st.gran === "week" ? "semanal" : "mensual"}<div class="grow"></div>
    <span class="tiny">${st.series.length} ${st.gran === "day" ? "días" : st.gran === "week" ? "semanas" : "meses"} · pico ${hClock(Math.max(0, ...st.series.map(p => p.v)))}</span></h3>
    ${chartTimeline(st, C, 880, 250)}</div>`;

  /* --- Ritmo: día de semana + franja horaria --- */
  const dowItems = st.dow.map((x, i) => ({ label: DAYS[i], full: DAYSL[i], v: x.n ? Math.round(x.min / x.n) : 0, hi: i === new Date().getDay() }));
  const bestDow = dowItems.reduce((a, b) => b.v > a.v ? b : a, dowItems[0]);
  h += `<div class="grid2">
    <div class="card" style="margin:0"><h3>Promedio por día de la semana<div class="grow"></div><span class="tiny">mejor: ${esc(bestDow.full)}</span></h3>
      ${chartBars(dowItems, C, 430, 200, { valueLabels: true })}</div>`;
  if (st.hourKnown > 0) {
    const hrItems = st.hours.map((v, i) => ({ label: i % 3 === 0 ? String(i) : "", full: i + ":00", v }));
    const peak = st.hours.indexOf(Math.max(...st.hours));
    h += `<div class="card" style="margin:0"><h3>¿A qué hora estudiás?<div class="grow"></div><span class="tiny">pico: ${peak}:00 hs</span></h3>
      ${chartBars(hrItems, C, 430, 200, {})}</div>`;
  } else {
    h += `<div class="card" style="margin:0"><h3>¿A qué hora estudiás?</h3><div class="empty">Se completa con las sesiones de pomodoro y las manuales que registres de acá en adelante.</div></div>`;
  }
  h += `</div>`;

  /* --- Distribución por materia --- */
  const distItems = [
    ...st.subs.filter(x => x.min > 0).map(x => ({ label: x.s.name, short: x.s.short, v: x.min, color: x.s.color })),
    ...st.projs.map(x => ({ label: x.p.name, short: x.p.name.slice(0, 6), v: x.min, color: C.tx3 }))
  ];
  if (distItems.length) {
    h += `<div class="grid2">
      <div class="card" style="margin:0"><h3>Distribución del tiempo</h3>${chartDonut(distItems, C, 440, 210, { center: hClock(st.total), sub: R.short.toLowerCase() })}</div>
      <div class="card" style="margin:0"><h3>Horas por materia</h3>
        ${chartHBars(distItems.slice(0, 9).map(x => ({ label: x.short, color: x.color, v: x.v, full: x.label + " · " + fmtMin(x.v) })), C, 430, Math.max(80, distItems.slice(0, 9).length * 28 + 14))}</div>
    </div>`;
  }

  /* --- Composición del tiempo --- */
  const compParts = [
    { label: "Pomodoro", v: st.comp.pomo, color: C.acc },
    { label: "Tareas completadas", v: st.comp.auto, color: C.ok },
    { label: "Manual", v: st.comp.manual, color: C.warn },
    { label: "Otras", v: st.comp.otro, color: C.tx3 }
  ].filter(p => p.v > 0);
  if (compParts.length) h += `<div class="card"><h3>¿De dónde vienen las horas?<div class="grow"></div><span class="tiny">cómo se registró cada minuto</span></h3>${chartStack(compParts, C, 860, 54)}</div>`;

  /* --- Precisión de estimación --- */
  if (st.timed.length) {
    const ratio = st.realSum / st.estSum;
    const cmpItems = st.subs.filter(x => x.min > 0).map(x => {
      const ts = st.doneR.filter(t => t.subjectId === x.s.id && (t.estMin || 0) > 0 && (t.realMin || 0) > 0);
      return { label: x.s.short, a: ts.reduce((a, t) => a + t.estMin, 0), b: ts.reduce((a, t) => a + t.realMin, 0), color: x.s.color };
    }).filter(x => x.a > 0);
    h += `<div class="grid2"><div class="card" style="margin:0"><h3>Precisión de tus estimaciones</h3>
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <div style="width:118px">${chartRing(clamp(100 - Math.abs(1 - ratio) * 100, 0, 100), C, 118, ratio > 1.15 ? C.bad : ratio < .85 ? C.warn : C.ok, Math.round(ratio * 100) + "%", "real/est")}</div>
        <div style="flex:1;min-width:180px"><p class="muted" style="line-height:1.6">Sobre ${st.timed.length} tareas con tiempo real cargado: estimaste <b>${hClock(st.estSum)}</b> y te llevó <b>${hClock(st.realSum)}</b>.<br>
        ${ratio > 1.08 ? "Tendés a <b style='color:var(--bad)'>subestimar</b>: sumale un " + Math.round((ratio - 1) * 100) + "% a lo que calculás." : ratio < .92 ? "Tendés a <b style='color:var(--warn)'>sobreestimar</b>: te sobra un " + Math.round((1 - ratio) * 100) + "% del tiempo que reservás." : "Tus estimaciones son <b style='color:var(--ok)'>muy precisas</b>. Seguí planificando así."}</p></div>
      </div></div>`;
    h += cmpItems.length ? `<div class="card" style="margin:0"><h3>Estimado vs real por materia</h3>${chartDual(cmpItems, C, 430, 210)}</div>` : `<div class="card" style="margin:0"><h3>Estimado vs real por materia</h3><div class="empty">Cargá el tiempo real al completar tareas para ver esta comparación.</div></div>`;
    h += `</div>`;
  }

  /* --- Tareas --- */
  const typeItems = Object.entries(st.byType).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ label: TASK_TYPES[k] || k, v, color: SUBJ_COLORS[i % SUBJ_COLORS.length] }));
  h += `<div class="grid2">
    <div class="card" style="margin:0"><h3>Tareas del período<div class="grow"></div><span class="tiny">${st.createdR.length} creadas · ${st.doneR.length} completadas</span></h3>
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        <div style="width:112px">${chartRing(st.createdR.length ? clamp(st.doneR.length / Math.max(st.createdR.length, 1) * 100, 0, 100) : 0, C, 112, C.acc, (st.createdR.length ? Math.round(st.doneR.length / st.createdR.length * 100) : 0) + "%", "cerradas")}</div>
        <div style="flex:1;min-width:150px" class="tiny">
          ${Object.entries(st.statusCount).filter(([, v]) => v > 0).map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--line2)"><span>${TASK_STATUS[k]}</span><b>${v}</b></div>`).join("")}
        </div></div></div>
    <div class="card" style="margin:0"><h3>Qué tipo de trabajo hiciste</h3>
      ${typeItems.length ? chartHBars(typeItems.map(x => ({ label: x.label.length > 12 ? x.label.slice(0, 11) + "…" : x.label, v: x.v, color: x.color, vLabel: x.v + (x.v === 1 ? " tarea" : " tareas"), full: x.label + ": " + x.v })), C, 430, Math.max(70, typeItems.length * 26 + 12), { labelW: 100 }) : '<div class="empty">Sin tareas completadas en este período.</div>'}</div>
  </div>`;

  /* --- Notas y evaluaciones --- */
  if (st.graded.length) {
    const apr = st.graded.filter(x => x.g >= 4).length;
    h += `<div class="card"><h3>Rendimiento en evaluaciones<div class="grow"></div>
      <span class="tiny">promedio ${st.gradeAvg} · ${apr}/${st.graded.length} aprobadas</span></h3>${chartGrades(st.graded.slice(-14), C, 860, 190)}</div>`;
  }

  /* --- Hábitos --- */
  const hb = st.habits.filter(x => x.due > 0);
  if (hb.length) {
    h += `<div class="card"><h3>Cumplimiento de hábitos<div class="grow"></div><span class="tiny">en ${esc(R.label.toLowerCase())}</span></h3>
      ${chartHBars(hb.map(x => ({ label: x.h.name.length > 14 ? x.h.name.slice(0, 13) + "…" : x.h.name, v: x.pct, color: x.pct >= 80 ? C.ok : x.pct >= 50 ? C.warn : C.bad, vLabel: x.pct + "% (" + x.ok + "/" + x.due + ")", full: x.h.name })), C, 860, Math.max(70, hb.length * 28 + 12), { labelW: 120 })}</div>`;
  }

  /* --- Mapa de calor --- */
  h += `<div class="card"><h3>Mapa de actividad<div class="grow"></div><span class="tiny">último año · cada cuadrito es un día</span></h3>
    <div style="overflow-x:auto">${chartHeat(C, 800, 130, todayISO(), 53)}</div></div>`;

  /* --- Ranking de materias (tabla) --- */
  if (st.subs.length) {
    h += `<div class="card"><h3>Detalle por materia</h3>
      <div style="overflow-x:auto"><table class="stt">
      <thead><tr><th>Materia</th><th style="text-align:right">Horas</th><th style="text-align:right">% del total</th>
        <th style="text-align:right">Sesiones</th><th style="text-align:right">Completadas</th>
        <th style="text-align:right">Pendientes</th><th style="text-align:right">Prom./día activo</th></tr></thead><tbody>`;
    for (const x of st.subs) {
      const dAct = new Set(st.sess.filter(s => s.subjectId === x.s.id).map(s => s.date)).size;
      h += `<tr style="cursor:pointer" onclick="go('subject','${x.s.id}')">
        <td><span class="tag" style="background:${x.s.color}1c;color:${x.s.color}">${esc(x.s.short)}</span> ${esc(x.s.name)}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums"><b>${hClock(x.min)}</b></td>
        <td style="text-align:right;color:var(--tx3)">${st.total ? Math.round(x.min / st.total * 100) : 0}%</td>
        <td style="text-align:right;color:var(--tx3)">${x.sessions}</td>
        <td style="text-align:right;color:var(--ok)">${x.done}</td>
        <td style="text-align:right;color:${x.pend ? "var(--warn)" : "var(--tx3)"}">${x.pend}</td>
        <td style="text-align:right;color:var(--tx3)">${dAct ? hClock(x.min / dAct) : "—"}</td></tr>`;
    }
    h += `</tbody></table></div></div>`;
  }

  /* --- Conclusiones automáticas --- */
  const ins = buildInsights(st, C);
  if (ins.length) h += `<div class="card" style="border-left:3px solid var(--acc)"><h3>Lo que dicen tus números</h3>${ins.map(x => `<p class="muted" style="margin:6px 0;line-height:1.55">${x}</p>`).join("")}</div>`;
  return h;
}

function buildInsights(st, C) {
  const out = [];
  if (!st.total) return ["Todavía no hay tiempo registrado en este período. Usá el pomodoro, registrá una sesión manual o completá tareas cargando cuánto te llevaron."];
  out.push(`Estudiaste <b>${hClock(st.total)}</b> en ${st.activeDays} de ${st.elapsed.length} días (${st.coverage}% de constancia), con un promedio de <b>${hClock(st.avgActive)}</b> los días que te sentaste a estudiar.`);
  const bd = st.dow.map((x, i) => ({ i, avg: x.n ? x.min / x.n : 0 })).sort((a, b) => b.avg - a.avg);
  if (bd[0].avg > 0) {
    const worst = bd.filter(x => x.avg > 0).slice(-1)[0];
    out.push(`Tu mejor día es el <b>${DAYSL[bd[0].i]}</b> (${hClock(bd[0].avg)} en promedio)${worst && worst.i !== bd[0].i ? `, y el más flojo el <b>${DAYSL[worst.i]}</b> (${hClock(worst.avg)})` : ""}.`);
  }
  if (st.hourKnown > 0) {
    const peak = st.hours.indexOf(Math.max(...st.hours));
    const fr = peak < 6 ? "de madrugada" : peak < 12 ? "a la mañana" : peak < 19 ? "a la tarde" : "a la noche";
    out.push(`Rendís más <b>${fr}</b>: tu franja pico arranca a las <b>${peak}:00</b>. Reservá ahí lo más difícil.`);
  }
  if (st.subs.length > 1 && st.total) {
    const top = st.subs[0], last = st.subs.filter(x => x.min > 0).slice(-1)[0];
    out.push(`<b>${esc(top.s.name)}</b> se llevó el ${Math.round(top.min / st.total * 100)}% de tus horas${last && last.s.id !== top.s.id ? `, mientras que <b>${esc(last.s.name)}</b> apenas el ${Math.round(last.min / st.total * 100)}%` : ""}.`);
    const abandoned = state.subjects.filter(s => !s.archived && !st.subs.some(x => x.s.id === s.id && x.min > 0) && state.tasks.some(t => t.subjectId === s.id && !t.archived && t.status !== "done"));
    if (abandoned.length) out.push(`Sin una sola hora en este período pero con pendientes: <b>${abandoned.map(s => esc(s.short)).join(", ")}</b>.`);
  }
  if (st.timed.length >= 3) {
    const r = st.realSum / st.estSum;
    if (r > 1.08) out.push(`Cuando planificás, te quedás corto: lo real fue un <b>${Math.round((r - 1) * 100)}% más</b> de lo estimado. Multiplicá por ${Math.round(r * 100) / 100} tus próximas estimaciones.`);
    else if (r < .92) out.push(`Reservás de más: usás solo el <b>${Math.round(r * 100)}%</b> del tiempo que estimás. Podés meter más cosas por día.`);
    else out.push(`Tus estimaciones son muy precisas (${Math.round(r * 100)}% de lo previsto). Confiá en tu planificación.`);
  }
  if (st.prevTotal) {
    const d = st.total - st.prevTotal, p = Math.round(Math.abs(d) / st.prevTotal * 100);
    out.push(d >= 0 ? `Vas <b style="color:var(--ok)">${p}% arriba</b> del período anterior (${hClock(st.prevTotal)} → ${hClock(st.total)}).`
      : `Bajaste un <b style="color:var(--bad)">${p}%</b> respecto del período anterior (${hClock(st.prevTotal)} → ${hClock(st.total)}).`);
  }
  if (st.streak >= 3) out.push(`Llevás <b>${st.streak} días seguidos</b> estudiando${st.streak >= st.bestStreak ? " — es tu mejor racha histórica." : ` (tu récord es ${st.bestStreak}).`}`);
  if (st.overdue) out.push(`Tenés <b style="color:var(--bad)">${st.overdue} tareas atrasadas</b>: conviene replanificarlas antes de que se acumulen.`);
  if (st.gradeAvg !== null) out.push(`Tu promedio de notas cargadas es <b>${st.gradeAvg}</b> sobre ${st.graded.length} evaluaciones.`);
  return out;
}

/* ===================== INFORME DESCARGABLE (PÓSTER) ===================== */
function openPosterModal() {
  const R = getStatsRange();
  openModal(`<h3>Descargar informe de estadísticas</h3>
    <p class="muted">Genera una lámina con todos tus números y gráficos de <b>${esc(R.label)}</b>, lista para guardar o compartir.</p>
    <label for="po_fmt">Formato</label>
    <select id="po_fmt"><option value="png">PNG (imagen, ideal para compartir)</option><option value="svg">SVG (vectorial, calidad infinita)</option></select>
    <label for="po_scale">Resolución (solo PNG)</label>
    <select id="po_scale"><option value="2">Alta (2x · ~2480 px)</option><option value="3">Muy alta (3x · ~3720 px)</option><option value="1">Normal (1x)</option></select>
    <p class="tiny" style="margin-top:10px">Usa el tema actual (${chartColors().dark ? "oscuro" : "claro"}). Si querés la versión clara, cambiá el tema antes de descargar.</p>
    <div class="mfoot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="downloadPoster()">Generar y descargar</button></div>`);
}
function downloadPoster() {
  const fmt = (byId("po_fmt") || {}).value || "png";
  const scale = parseFloat((byId("po_scale") || {}).value) || 2;
  closeModal();
  toast("Generando informe…");
  setTimeout(() => {
    let svg;
    try { svg = buildStatsPoster(); } catch (e) { console.error(e); toast("No se pudo generar el informe"); return; }
    const R = getStatsRange();
    const name = "aula-informe-" + R.label.toLowerCase().replace(/[^a-z0-9]+/gi, "-") + "-" + todayISO();
    if (fmt === "svg") { downloadFile(name + ".svg", svg, "image/svg+xml;charset=utf-8"); toast("Informe SVG descargado"); return; }
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement("canvas");
        cv.width = Math.round(POSTER_W * scale); cv.height = Math.round(POSTER_H * scale);
        const ctx = cv.getContext("2d");
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, POSTER_W, POSTER_H);
        URL.revokeObjectURL(url);
        cv.toBlob(b => {
          if (!b) { toast("No se pudo generar el PNG — probá el formato SVG"); return; }
          const a = document.createElement("a");
          a.href = URL.createObjectURL(b); a.download = name + ".png"; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          toast("Informe descargado");
        }, "image/png");
      } catch (e) { console.error(e); toast("No se pudo generar el PNG — probá el formato SVG"); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast("No se pudo rasterizar; descargando SVG"); downloadFile(name + ".svg", svg, "image/svg+xml;charset=utf-8"); };
    img.src = url;
  }, 60);
}
const POSTER_W = 1240, POSTER_H = 1860;
function buildStatsPoster() {
  const R = getStatsRange(), st = computeStats(R), C = chartColors();
  const W = POSTER_W, H = POSTER_H;
  const M = 44, colW = W - M * 2;
  const panel = (x, y, w, h, title, sub) => {
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${C.card}" stroke="${C.line}"/>`;
    if (title) s += txt(x + 18, y + 26, title, 13.5, C.tx, "start", 700);
    if (sub) s += txt(x + w - 18, y + 26, sub, 10.5, C.tx3, "end");
    return s;
  };
  const nest = (x, y, w, h, svg) => svg.replace(/^<svg /, `<svg x="${x}" y="${y}" width="${w}" height="${h}" `).replace(' width="100%"', "").replace(/ style="[^"]*"/, "");
  let g = `<rect width="${W}" height="${H}" fill="${C.bg}"/>`;

  /* Encabezado */
  g += `<rect x="${M}" y="30" width="${colW}" height="104" rx="18" fill="${C.acc}"/>`;
  g += `<rect x="${M}" y="30" width="${colW}" height="104" rx="18" fill="${C.card}" opacity="${C.dark ? .12 : .06}"/>`;
  g += txt(M + 26, 70, "Informe de estudio", 24, "#ffffff", "start", 800);
  g += txt(M + 26, 96, R.label + "  ·  " + fmtD(R.from) + " → " + fmtD(R.to), 13, "#ffffff", "start", 500);
  g += txt(M + 26, 118, "Aula · generado el " + fmtDFull(todayISO()), 10.5, "#ffffff", "start");
  g += txt(W - M - 26, 78, hClock(st.total), 34, "#ffffff", "end", 800);
  g += txt(W - M - 26, 100, "tiempo total estudiado", 11, "#ffffff", "end");
  g += txt(W - M - 26, 118, st.activeDays + " días activos · " + st.pomos + " pomodoros", 10.5, "#ffffff", "end");

  /* Tira de KPIs */
  const kpis = [
    [hClock(st.avgCalendar), "promedio por día"],
    [hClock(st.avgActive), "prom. día activo"],
    [hClock(st.median), "mediana diaria"],
    [st.best.d ? hClock(st.best.m) : "—", "mejor día"],
    [st.coverage + "%", "constancia"],
    [st.streak + "", "racha actual"],
    [st.bestStreak + "", "mejor racha"],
    [st.doneR.length + "", "tareas hechas"],
    [st.withLim ? Math.round(st.onTime / st.withLim * 100) + "%" : "—", "en fecha"],
    [hClock(st.sessionAvg), "media/sesión"]
  ];
  const kw = colW / kpis.length;
  kpis.forEach((k, i) => {
    const x = M + i * kw;
    g += `<rect x="${x + 4}" y="150" width="${kw - 8}" height="76" rx="12" fill="${C.card}" stroke="${C.line}"/>`;
    g += txt(x + kw / 2, 186, k[0], 19, C.tx, "middle", 800);
    g += txt(x + kw / 2, 206, k[1], 9.5, C.tx3, "middle");
  });

  /* Evolución */
  let y = 244;
  g += panel(M, y, colW, 280, "Evolución " + (st.gran === "day" ? "diaria" : st.gran === "week" ? "semanal" : "mensual"), "pico " + hClock(Math.max(0, ...st.series.map(p => p.v))));
  g += nest(M + 10, y + 34, colW - 20, 236, chartTimeline(st, C, 1120, 236));
  y += 296;

  /* Fila: dona + día de semana + horas */
  const c3 = (colW - 32) / 3;
  const distItems = [
    ...st.subs.filter(x => x.min > 0).map(x => ({ label: x.s.short + " · " + x.s.name, short: x.s.short, v: x.min, color: x.s.color })),
    ...st.projs.map(x => ({ label: x.p.name, short: x.p.name.slice(0, 6), v: x.min, color: C.tx3 }))
  ];
  g += panel(M, y, c3, 250, "Distribución del tiempo");
  if (distItems.length) g += nest(M + 8, y + 48, c3 - 16, 172, chartDonut(distItems.map(x => ({ label: x.short, v: x.v, color: x.color })), C, 440, 210, { center: hClock(st.total), sub: R.short.toLowerCase() }));
  else g += txt(M + c3 / 2, y + 130, "sin datos", 12, C.tx3, "middle");

  const dowItems = st.dow.map((x, i) => ({ label: DAYS[i], full: DAYSL[i], v: x.n ? Math.round(x.min / x.n) : 0 }));
  g += panel(M + c3 + 16, y, c3, 250, "Promedio por día");
  g += nest(M + c3 + 24, y + 34, c3 - 16, 208, chartBars(dowItems, C, 380, 208, { valueLabels: true }));

  g += panel(M + (c3 + 16) * 2, y, c3, 250, "Franja horaria", st.hourKnown ? "pico " + st.hours.indexOf(Math.max(...st.hours)) + ":00" : "");
  if (st.hourKnown) g += nest(M + (c3 + 16) * 2 + 8, y + 34, c3 - 16, 208, chartBars(st.hours.map((v, i) => ({ label: i % 4 === 0 ? String(i) : "", full: i + ":00", v })), C, 380, 208, {}));
  else g += txt(M + (c3 + 16) * 2 + c3 / 2, y + 130, "sin horas registradas", 11, C.tx3, "middle");
  y += 266;

  /* Fila: horas por materia + composición + precisión */
  const cL = colW * .52, cR = colW - cL - 16;
  g += panel(M, y, cL, 236, "Horas por materia");
  if (distItems.length) g += nest(M + 10, y + 36, cL - 20, 190, chartHBars(distItems.slice(0, 9).map(x => ({ label: x.short, color: x.color, v: x.v, full: x.label })), C, 560, Math.max(120, Math.min(9, distItems.length) * 22 + 12)));
  const compParts = [
    { label: "Pomodoro", v: st.comp.pomo, color: C.acc },
    { label: "Tareas", v: st.comp.auto, color: C.ok },
    { label: "Manual", v: st.comp.manual, color: C.warn },
    { label: "Otras", v: st.comp.otro, color: C.tx3 }
  ].filter(p => p.v > 0);
  g += panel(M + cL + 16, y, cR, 236, "Origen de las horas");
  if (compParts.length) g += nest(M + cL + 28, y + 44, cR - 24, 56, chartStack(compParts, C, 520, 56));
  if (st.timed.length) {
    const ratio = st.realSum / st.estSum;
    g += txt(M + cL + 28, y + 132, "Precisión de estimaciones", 12, C.tx, "start", 700);
    g += nest(M + cL + 28, y + 142, 78, 78, chartRing(clamp(100 - Math.abs(1 - ratio) * 100, 0, 100), C, 78, ratio > 1.15 ? C.bad : ratio < .85 ? C.warn : C.ok, Math.round(ratio * 100) + "%", ""));
    g += txt(M + cL + 118, y + 172, "Estimado " + hClock(st.estSum) + "  ·  real " + hClock(st.realSum), 11, C.tx2, "start", 600);
    g += txt(M + cL + 118, y + 192, ratio > 1.08 ? "Subestimás un " + Math.round((ratio - 1) * 100) + "%" : ratio < .92 ? "Sobreestimás un " + Math.round((1 - ratio) * 100) + "%" : "Estimaciones muy precisas", 11, ratio > 1.08 ? C.bad : ratio < .92 ? C.warn : C.ok, "start", 700);
    g += txt(M + cL + 118, y + 210, "sobre " + st.timed.length + " tareas cronometradas", 9.5, C.tx3, "start");
  }
  y += 252;

  /* Mapa de calor */
  g += panel(M, y, colW, 190, "Mapa de actividad — último año", "cada cuadrito es un día");
  g += nest(M + (colW - 820) / 2, y + 38, 820, 140, chartHeat(C, 820, 140, todayISO(), 53));
  y += 206;

  /* Fila final: notas + tabla materias */
  const tW = colW * .58, nW = colW - tW - 16;
  g += panel(M, y, tW, 300, "Detalle por materia");
  let ty = y + 52;
  g += txt(M + 18, y + 46, "Materia", 10, C.tx3, "start", 600);
  g += txt(M + tW - 210, y + 46, "Horas", 10, C.tx3, "end", 600);
  g += txt(M + tW - 140, y + 46, "%", 10, C.tx3, "end", 600);
  g += txt(M + tW - 76, y + 46, "Hechas", 10, C.tx3, "end", 600);
  g += txt(M + tW - 18, y + 46, "Pend.", 10, C.tx3, "end", 600);
  st.subs.slice(0, 9).forEach((x, i) => {
    const yy = ty + i * 26;
    g += `<line x1="${M + 14}" y1="${yy - 13}" x2="${M + tW - 14}" y2="${yy - 13}" stroke="${C.line}"/>`;
    g += `<rect x="${M + 18}" y="${yy - 10}" width="${Math.min(46, x.s.short.length * 9 + 12)}" height="15" rx="4" fill="${x.s.color}" opacity=".18"/>`;
    g += txt(M + 24, yy + 1, x.s.short, 9.5, x.s.color, "start", 700);
    g += txt(M + 72, yy + 1, x.s.name.length > 30 ? x.s.name.slice(0, 29) + "…" : x.s.name, 10.5, C.tx2);
    g += txt(M + tW - 210, yy + 1, hClock(x.min), 10.5, C.tx, "end", 700);
    g += txt(M + tW - 140, yy + 1, (st.total ? Math.round(x.min / st.total * 100) : 0) + "%", 10.5, C.tx3, "end");
    g += txt(M + tW - 76, yy + 1, String(x.done), 10.5, C.ok, "end");
    g += txt(M + tW - 18, yy + 1, String(x.pend), 10.5, x.pend ? C.warn : C.tx3, "end");
  });
  if (!st.subs.length) g += txt(M + tW / 2, y + 150, "sin actividad por materia", 12, C.tx3, "middle");

  g += panel(M + tW + 16, y, nW, 300, st.graded.length ? "Evolución de notas" : "Resumen de tareas", st.graded.length ? "promedio " + st.gradeAvg : "");
  if (st.graded.length) {
    g += nest(M + tW + 26, y + 40, nW - 20, 150, chartGrades(st.graded.slice(-8), C, 460, 170));
    const apr = st.graded.filter(x => x.g >= 4).length;
    g += txt(M + tW + 30, y + 218, "Aprobadas: " + apr + " de " + st.graded.length, 11.5, C.ok, "start", 700);
    g += txt(M + tW + 30, y + 240, "Promedio general: " + st.gradeAvg, 11.5, C.tx2, "start", 600);
    g += txt(M + tW + 30, y + 262, "Mejor nota: " + Math.max(...st.graded.map(x => x.g)), 11.5, C.tx2, "start", 600);
  } else {
    const rows = Object.entries(st.statusCount).filter(([, v]) => v > 0);
    rows.forEach(([k, v], i) => {
      const yy = y + 66 + i * 30;
      g += txt(M + tW + 32, yy, TASK_STATUS[k], 11.5, C.tx2, "start");
      g += txt(M + tW + nW - 32, yy, String(v), 13, C.tx, "end", 800);
    });
    g += txt(M + tW + 32, y + 66 + rows.length * 30 + 14, "Creadas en el período: " + st.createdR.length, 11, C.tx3, "start");
  }
  y += 316;

  /* Conclusiones */
  const insights = buildInsights(st, C).map(s => s.replace(/<[^>]+>/g, "")).slice(0, 5);
  g += panel(M, y, colW, 152, "Lo que dicen tus números");
  insights.forEach((s, i) => {
    const line = s.length > 150 ? s.slice(0, 149) + "…" : s;
    g += `<circle cx="${M + 24}" cy="${y + 52 + i * 22 - 4}" r="3" fill="${C.acc}"/>`;
    g += txt(M + 36, y + 52 + i * 22, line, 11, C.tx2);
  });

  /* Pie */
  g += txt(M, H - 20, "Aula v" + APP_VERSION + " · organizador académico personal", 10, C.tx3);
  g += txt(W - M, H - 20, "Datos locales de este dispositivo · " + st.sess.length + " sesiones analizadas", 10, C.tx3, "end");

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SVG_FONT}">${g}</svg>`;
}
/* CSV del período analizado: resumen diario + por materia + métricas globales */
function exportRangeCSV() {
  const R = getStatsRange(), st = computeStats(R);
  const q = s => '"' + String(s == null ? "" : s).replace(/"/g, "'") + '"';
  let csv = "AULA - INFORME DE ESTADISTICAS\n";
  csv += "periodo," + q(R.label) + "\ndesde," + R.from + "\nhasta," + R.to + "\ngenerado," + todayISO() + "\n\n";
  csv += "METRICA,VALOR\n";
  [["Total estudiado (min)", Math.round(st.total)], ["Promedio por dia (min)", Math.round(st.avgCalendar)],
  ["Promedio por dia activo (min)", Math.round(st.avgActive)], ["Mediana diaria (min)", st.median],
  ["Mejor dia", st.best.d || "-"], ["Mejor dia (min)", st.best.m], ["Dias del periodo", st.elapsed.length],
  ["Dias con actividad", st.activeDays], ["Constancia (%)", st.coverage], ["Racha actual", st.streak],
  ["Mejor racha", st.bestStreak], ["Pomodoros", st.pomos], ["Sesiones", st.sess.length],
  ["Duracion media sesion (min)", Math.round(st.sessionAvg)], ["Tareas completadas", st.doneR.length],
  ["Tareas creadas", st.createdR.length], ["Completadas en fecha", st.onTime], ["Con fecha limite", st.withLim],
  ["Tiempo estimado (min)", st.estSum], ["Tiempo real (min)", st.realSum],
  ["Promedio de notas", st.gradeAvg == null ? "-" : st.gradeAvg], ["Atrasadas hoy", st.overdue]]
    .forEach(r => { csv += q(r[0]) + "," + r[1] + "\n"; });
  csv += "\nDIA,MINUTOS,HORAS,DIA_SEMANA\n";
  for (const d of st.elapsed) csv += d + "," + (st.byDay[d] || 0) + "," + Math.round((st.byDay[d] || 0) / 6) / 10 + "," + q(DAYSL[dToDate(d).getDay()]) + "\n";
  csv += "\nMATERIA,ABREV,MINUTOS,HORAS,PORCENTAJE,SESIONES,COMPLETADAS,PENDIENTES\n";
  for (const x of st.subs) csv += q(x.s.name) + "," + q(x.s.short) + "," + x.min + "," + Math.round(x.min / 6) / 10 + "," + (st.total ? Math.round(x.min / st.total * 100) : 0) + "," + x.sessions + "," + x.done + "," + x.pend + "\n";
  csv += "\nDIA_SEMANA,MINUTOS_TOTAL,DIAS,PROMEDIO_MIN\n";
  st.dow.forEach((x, i) => { csv += q(DAYSL[i]) + "," + x.min + "," + x.n + "," + (x.n ? Math.round(x.min / x.n) : 0) + "\n"; });
  if (st.hourKnown) { csv += "\nHORA,MINUTOS\n"; st.hours.forEach((v, i) => { if (v) csv += i + ":00," + v + "\n"; }); }
  if (st.graded.length) { csv += "\nEVALUACION,FECHA,NOTA,ESTADO\n"; for (const x of st.graded) csv += q(x.e.name) + "," + x.e.date + "," + x.g + "," + q(EVAL_STATUS[x.e.status] || x.e.status) + "\n"; }
  downloadFile("aula-informe-" + R.from + "_" + R.to + ".csv", csv, "text/csv;charset=utf-8");
  toast("CSV del período descargado");
}
function exportCSV() {
  let csv = "fecha,minutos,pomodoros,manual,por_tarea_completada,materia,proyecto,tarea\n";
  for (const s of [...state.sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    const sub = s.subjectId ? (subjById(s.subjectId) || {}).short || "" : "";
    const pr = s.projectId ? (projById(s.projectId) || {}).name || "" : "";
    const tk = s.taskId ? (taskById(s.taskId) || {}).title || "" : "";
    csv += `${s.date},${s.min},${s.pomos || 0},${s.manual ? 1 : 0},${s.auto ? 1 : 0},"${(sub || "").replace(/"/g, "'")}","${(pr || "").replace(/"/g, "'")}","${(tk || "").replace(/"/g, "'")}"\n`;
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
      <div class="tinfo"><div class="tt">${fmtMin(s.min)}${s.pomos ? " · " + s.pomos + " pomodoro" + (s.pomos > 1 ? "s" : "") : ""}${s.manual ? " · manual" : ""}${s.auto ? " · por tarea completada" : ""}</div>
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
    <input type="file" id="impfile" accept=".json,application/json" onchange="importJSON(event)" style="font-size:.8rem" aria-label="Importar archivo JSON"></div>
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
      ${SUBJ_COLORS.slice(0, 8).map(c => `<button title="${c}" style="width:26px;height:26px;border-radius:8px;background:${c};border:2px solid ${st.accent === c ? "var(--tx)" : "transparent"};cursor:pointer" onclick="setAccent('${c}')" aria-label="Color ${c}"></button>`).join("")}
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
    <input type="number" min="1" max="30" value="${st.upcomingDays}" onchange="state.settings.upcomingDays=parseInt(this.value)||7;change();render()" style="width:90px;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:7px;margin-top:4px" aria-label="Días próximos">
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
      state = baseState(); state.subjects = initialSubjects(); state.meta.migratedV1 = true;
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
      <div><label for="qt_mode">Programación</label><select id="qt_mode" onchange="byId('qt_p2').style.display=this.value==='period'?'block':'none'">
        <option value="d">Día fijo</option>
        <option value="due">Fecha límite (flexible)</option>
        <option value="period">Todos los días (período)</option>
        <option value="none">Sin fecha</option></select></div>
      <div><label for="qt_date">Fecha${""}</label><input id="qt_date" type="date" value="${date || todayISO()}"></div>
    </div>
    <div id="qt_p2" style="display:none">
      <label for="qt_date2">Hasta (inclusive)</label><input id="qt_date2" type="date" value="${date || todayISO()}">
      <p class="tiny" style="margin-top:4px">Se crea una tarea igual por cada día del período, cada una con su tiempo estimado. Ideal para “practicar con parciales viejos, 1 h por día hasta el examen”.</p>
    </div>
    <div class="mfoot"><span class="tiny grow">Después podés abrirla para completar detalles avanzados.</span>
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="saveQuickTask()">Crear tarea</button></div>`);
}
function saveQuickTask() {
  const title = byId("qt_title").value.trim();
  if (!title) { toast("Falta el título"); return; }
  const link = byId("qt_link").value, mode = byId("qt_mode").value, date = byId("qt_date").value || todayISO();
  const base = {
    title, estMin: parseInt(byId("qt_min").value) || 0,
    subjectId: link.startsWith("s:") ? link.slice(2) : null,
    projectId: link.startsWith("p:") ? link.slice(2) : null
  };
  if (mode === "period") {
    const d2 = byId("qt_date2").value || date;
    if (d2 < date) { toast("La fecha final debe ser igual o posterior a la inicial"); return; }
    const total = Math.round((dToDate(d2) - dToDate(date)) / 864e5) + 1;
    if (total > 120) { toast("Máximo 120 días por período"); return; }
    const ids = [];
    for (let d = date; d <= d2; d = addDays(d, 1)) ids.push(quickAddTask(Object.assign({ date: d }, base)).id);
    closeModal(); render();
    toast(total + " tareas creadas: " + fmtD(date) + " a " + fmtD(d2), () => { state.tasks = state.tasks.filter(x => !ids.includes(x.id)); change(); render(); });
    return;
  }
  const t = quickAddTask(Object.assign({ date: mode === "d" ? date : null, due: mode === "due" ? date : null }, base));
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
  const prevDate = t.date;
  t.date = byId("te_date").value || null;
  if (t.date !== prevDate) t.ord = null;
  t.due = byId("te_due").value || null;
  t.estMin = parseInt(byId("te_min").value) || 0;
  t.prio = parseInt(byId("te_prio").value);
  const prevStatus = t.status;
  t.status = byId("te_status").value;
  if (t.status === "done" && prevStatus !== "done") { t.doneAt = todayISO(); bumpDayDone(todayISO()); askDoneTime(t.id); }
  if (t.status !== "done") { t.doneAt = null; if (prevStatus === "done") uncreditTaskDone(t); }
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
    ${e.topics.length === 0 ? '<p class="muted" style="margin-top:8px;color:var(--warn)">No cargaste temas: el plan solo tendrá días de repaso y simulacros.</p>' : ""}
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
let searchMode = "search";
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
      ["Descargar informe de estadísticas", () => { go("stats"); setTimeout(openPosterModal, 80); }],
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
  const T = state.timer;
  if (!T.total) T.total = phaseDur(T.phase || "focus");
  if (T.run && T.ends) {
    if (Date.now() >= T.ends) { endPhase(true); T.run = false; T.ends = null; T.phase = "focus"; T.left = T.total = phaseDur("focus"); }
    else T.left = Math.round((T.ends - Date.now()) / 1000);
  }
  let sbPref = null; try { sbPref = localStorage.getItem("aula-sb"); } catch (e) {}
  if (window.innerWidth >= 980 && sbPref !== "0") document.body.classList.add("sb-open");
  byId("btnMenu").onclick = () => toggleSidebar();
  byId("btnTheme").onclick = cycleTheme;
  if (window.matchMedia) { try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch (e) {} }
  window.addEventListener("hashchange", () => { render(); if (window.innerWidth < 980) toggleSidebar(false); });
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("keydown", trapFocus);
  for (const id of ["modalbg", "searchbg"]) byId(id).addEventListener("mousedown", e => { if (e.target.id === id) (id === "searchbg" ? closeSearch : closeModal)(); });
  byId("confirmbg").addEventListener("mousedown", e => { if (e.target.id === "confirmbg") closeConfirm(); });
  await dailyBackup();
  persist();
  render();
  setInterval(pomoTick, 300);
  setInterval(persist, 15000);
  setInterval(checkReminders, 5 * 60 * 1000);
  checkReminders();
  ui.dismissedAsk = new Set();
  setTimeout(checkPastEvals, 600);
  setInterval(checkPastEvals, 5 * 60 * 1000);
  window.addEventListener("beforeunload", () => { try { const j = JSON.stringify(state); if (db) { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(j, "state"); } localStorage.setItem(EMERGENCY_KEY, j); } catch (e) {} });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") persist(); });
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
