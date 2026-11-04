"use strict";
/* =====================================================================
   AULA — Organizador académico personal
   Vanilla JS · IndexedDB · PWA · sin dependencias externas
   ===================================================================== */
const APP_VERSION = "2.28.0";
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
/* "Hoy" para la app. Antes de la hora en que termina tu día (Configuración →
   "Mi día termina a las…", por defecto 04:00) sigue siendo el día anterior:
   lo que marcás a las 00:30 cuenta para el día que estabas haciendo. Se aplica a
   todo (vista Hoy, completar, rachas, estadísticas) para que no haya dos "hoy". */
function dayEndMin() { const m = state && state.settings ? hmToMin(state.settings.dayEnd) : null; return m == null ? 0 : m; }
function todayISO() {
  const d = new Date(), m = dayEndMin();
  if (m && d.getHours() * 60 + d.getMinutes() < m) d.setDate(d.getDate() - 1);
  return iso(d);
}
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
/* Hora "HH:MM" según el formato elegido (24 h o 12 h). */
function fmtTime(hm) {
  const m = hmToMin(hm); if (m == null) return "";
  if (!state || state.settings.hourFmt !== 12) return pad(Math.floor(m / 60)) + ":" + pad(m % 60);
  const h = Math.floor(m / 60), h12 = h % 12 || 12;
  return h12 + (m % 60 ? ":" + pad(m % 60) : "") + (h < 12 ? " a. m." : " p. m.");
}
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
    upcomingDays: 7, tags: ["repaso", "importante", "entrega"], dayEnd: "04:00",
    doneKeepDays: 7 // B5: la Lista completa oculta las hechas hace más de N días (0 = nunca)
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
/* Guardado sincrónico de último momento (al cerrar, recargar o mandar la app al fondo).
   IndexedDB es asíncrono y el navegador puede cortar la transacción cuando mata la
   página; localStorage es sincrónico y siempre llega. loadState usa la copia de
   emergencia si es más nueva que la de IndexedDB (compara meta.lastSave). */
function flushNow() {
  if (!state) return;
  try {
    state.meta.lastSave = Date.now();
    const j = JSON.stringify(state);
    try { if (typeof localStorage !== "undefined") localStorage.setItem(EMERGENCY_KEY, j); } catch (e) {}
    if (db) db.transaction("kv", "readwrite").objectStore("kv").put(j, "state");
  } catch (e) {}
}

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

/* ===================== MIGRACIONES VERSIONADAS =====================
   state.meta.schema dice qué forma tienen los datos. Los guardados por la 2.6
   o antes no lo tienen: cuentan como esquema 1.
   Reglas para agregar un paso (ver CLAUDE.md):
   - Cada paso lleva de (to - 1) a `to`, es idempotente y NUNCA borra campos ni datos.
   - Antes de correr pasos, loadState guarda una copia del estado viejo en
     "Copias de seguridad" (clave premig-…) para poder volver atrás.
   - Cada paso agrega un test que carga tests/fixtures/estado-v2.6.json. */
const SCHEMA_VERSION = 3;
const MIGRATIONS = [
  { to: 2, desc: "Esquema versionado (Aula 2.7)", run: () => {} },
  { to: 3, desc: "Series explícitas con seriesId (Aula 2.10)", run: s => inferSeriesIds(s.tasks) }
];
/* A3 · Antes, cualquier par de tareas con el mismo título y materia se mostraba como
   "serie". Ahora una serie es explícita (t.seriesId). Para los datos viejos se
   reconstruye con una heurística conservadora. Las únicas formas de crear series
   sin repetición eran "Todos los días (período)" y "Agregar días", y las dos crean
   tareas DIARIAS con el mismo título, materia y fecha de creación. Entonces:
   - Se agrupan tareas con fecha, no recurrentes, por materia + proyecto + título + día de creación.
   - El grupo es serie si sus fechas son distintas y casi todas seguidas (paso de 1 día;
     se toleran huecos de días borrados a mano). Si son solo 2, además tienen que tener
     los mismos minutos (si no, no hay forma de distinguirlas de dos tareas sueltas).
   - Las tareas agregadas después con "Agregar días" (otro día de creación) se suman a
     la serie si empiezan justo al día siguiente de su última fecha.
   - Lo demás queda como tarea suelta. Nunca se toca una tarea que ya tenga seriesId. */
function inferSeriesIds(tasks) {
  const norm = x => String(x || "").trim().toLowerCase();
  const tkey = t => (t.subjectId || "") + "|" + (t.projectId || "") + "|" + norm(t.title);
  const groups = new Map();
  for (const t of tasks) {
    if (t.recur || !t.date || t.seriesId) continue;
    const k = tkey(t) + "|" + (t.createdAt || "");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const runs = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.date.localeCompare(b.date));
    let series = false;
    if (g.length >= 2) {
      const diffs = g.slice(1).map((t, i) => Math.round((dToDate(t.date) - dToDate(g[i].date)) / 864e5));
      const ones = diffs.filter(d => d === 1).length;
      series = diffs.every(d => d >= 1) && ones * 2 >= diffs.length && (g.length > 2 || (g[0].estMin || 0) === (g[1].estMin || 0));
    }
    runs.push({ k: tkey(g[0]), created: g[0].createdAt || "", tasks: g, series });
  }
  runs.sort((a, b) => a.tasks[0].date.localeCompare(b.tasks[0].date));
  for (const a of runs) {
    if (!a.series || a.merged) continue;
    for (let found = true; found;) {
      found = false;
      const next = addDays(a.tasks[a.tasks.length - 1].date, 1);
      for (const b of runs) {
        if (b === a || b.merged || b.k !== a.k || b.created <= a.created) continue;
        if ((b.series || b.tasks.length === 1) && b.tasks[0].date === next) {
          a.tasks = a.tasks.concat(b.tasks); b.merged = true; found = true; break;
        }
      }
    }
    const sid = "sr-" + uid();
    for (const t of a.tasks) t.seriesId = sid;
  }
}
function schemaOf(s) { return (s && s.meta && Number(s.meta.schema)) || 1; }
function needsMigration(s) { return schemaOf(s) < SCHEMA_VERSION; }
/* Corre los pasos pendientes sobre un estado ya normalizado. Devuelve {from, to}. */
function migrateState(s) {
  const from = schemaOf(s);
  for (const m of MIGRATIONS) {
    if (schemaOf(s) < m.to) { m.run(s); s.meta.schema = m.to; }
  }
  return { from, to: schemaOf(s) };
}
/* Normaliza + migra, guardando antes una copia del JSON original tal cual estaba. */
async function prepareLoaded(s, raw) {
  s = normalizeState(s);
  if (needsMigration(s)) {
    const from = schemaOf(s);
    const copy = { ts: Date.now(), label: "Antes de actualizar a Aula " + APP_VERSION, version: APP_VERSION, schema: from, data: raw };
    try {
      if (db) await idbPut("backups", "premig-v" + from + "-" + Date.now(), copy);
      else if (typeof localStorage !== "undefined") localStorage.setItem("aula-premig-v" + from, raw);
    } catch (e) { console.warn("No se pudo guardar la copia previa a la migración", e); }
    migrateState(s);
  }
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
  // Si la app se cerró antes de que IndexedDB terminara de guardar, la copia de
  // emergencia (sincrónica) es más nueva: se usa esa.
  try {
    const em = typeof localStorage !== "undefined" ? localStorage.getItem(EMERGENCY_KEY) : null;
    if (em && em !== raw) {
      const e = JSON.parse(em), lastOf = x => (x && x.meta && Number(x.meta.lastSave)) || 0;
      let cur = null; try { cur = raw ? JSON.parse(raw) : null; } catch (err) {}
      if (validState(e) && (!validState(cur) || lastOf(e) > lastOf(cur))) raw = em;
    }
  } catch (e) {}
  if (raw) {
    let s = null;
    try { s = JSON.parse(raw); } catch (e) { console.warn("Estado dañado, intentando backups…"); }
    if (validState(s)) { state = await prepareLoaded(s, raw); return; }
  }
  if (db) {
    try {
      const keys = (await idbKeys("backups")).sort().reverse();
      for (const k of keys) {
        try { const b = await idbGet("backups", k); const s = JSON.parse(b.data); if (validState(s)) { state = await prepareLoaded(s, b.data); toast("Datos recuperados desde una copia de seguridad"); return; } } catch (e) {}
      }
    } catch (e) {}
  }
  try {
    const em = typeof localStorage !== "undefined" ? localStorage.getItem(EMERGENCY_KEY) : null;
    if (em) { const s = JSON.parse(em); if (validState(s)) { state = await prepareLoaded(s, em); toast("Datos recuperados desde la copia de emergencia"); return; } }
  } catch (e) {}
  state = baseState();
  state.subjects = initialSubjects();
  try { if (typeof localStorage !== "undefined" && localStorage.getItem(OLD_LS_KEY) && migrateV1(state)) toast("Datos de la versión anterior migrados correctamente"); } catch (e) { console.warn("Fallo de migración", e); }
  migrateState(state); // estado nuevo (o recién migrado de la v1): sin datos previos que respaldar
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
/* Orden dentro del día (B1): primero las que tienen hora, por hora. Después las
   sin hora: las que ordenaste a mano (campo ord) y el resto por prioridad y duración. */
function orderedTasks(list) {
  return [...list].sort((a, b) => {
    const at = hmToMin(a.time), bt = hmToMin(b.time);
    if (at != null || bt != null) {
      if (at == null) return 1;
      if (bt == null) return -1;
      if (at !== bt) return at - bt;
    }
    const ao = (a.ord == null ? Infinity : a.ord), bo = (b.ord == null ? Infinity : b.ord);
    if (ao !== bo) return ao - bo;
    return (b.prio - a.prio) || ((a.estMin || 0) - (b.estMin || 0)) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
}
/* ===================== MOVER Y ARRASTRAR TAREAS (B4) =====================
   Un solo sistema con pointer events para mouse y dedo:
   - Mouse: se agarra la manija ⣿ y se arrastra.
   - Dedo: mantener apretada la fila (~0,4 s). Si movés el dedo, arrastrás; si
     soltás sin mover, se abre "Mover a…". Si el dedo se mueve antes, es scroll.
   Se puede soltar sobre cualquier sección con data-dropdate (Hoy, Mañana): si es
   el mismo día cambia el orden (campo ord), si es otro día cambia la fecha. */
const LONGPRESS_MS = 400;
let drag = null;
function clearDropMarks() {
  document.querySelectorAll(".task.dropbefore,.task.dropafter").forEach(x => x.classList.remove("dropbefore", "dropafter"));
  document.querySelectorAll("[data-dropdate].over").forEach(x => x.classList.remove("over"));
}
function canMoveTask(t) { return !!t && !t.recur; }
function touchUI() { try { return matchMedia("(hover:none)").matches; } catch (e) { return false; } }
function dragPointerDown(ev) {
  if (ev.button !== 0 || drag || ui.selMode || selSet().size) return;
  const row = ev.target.closest && ev.target.closest("#view .task[data-id]");
  if (!row || ev.target.closest(".cb,.tactions,button,a,input,select,textarea")) return;
  const t = taskById(row.dataset.id);
  if (!t || (!canMoveTask(t) && !row.dataset.date)) return; // las que se repiten solo se reordenan dentro del día
  const handle = ev.target.closest(".drag[title]");
  if (!handle && ev.pointerType === "mouse") return; // con mouse, el clic en la fila abre el editor
  drag = { id: t.id, row, pid: ev.pointerId, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY,
    from: row.dataset.date || null, state: handle ? "armed" : "press", timer: null, ghost: null, target: null };
  if (!handle) drag.timer = setTimeout(dragLift, LONGPRESS_MS);
  window.addEventListener("pointermove", dragPointerMove, { passive: false });
  window.addEventListener("pointerup", dragPointerUp);
  window.addEventListener("pointercancel", dragCancel);
}
function dragLift() {
  if (!drag || drag.state !== "press") return;
  drag.state = "lifted";
  drag.row.classList.add("lifted");
  try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
}
function dragPointerMove(ev) {
  if (!drag || ev.pointerId !== drag.pid) return;
  drag.x = ev.clientX; drag.y = ev.clientY;
  const dist = Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0);
  if (drag.state === "press") { if (dist > 10) dragCancel(); return; } // se movió antes: es scroll
  if (drag.state === "armed" || drag.state === "lifted") {
    if (dist < (drag.state === "armed" ? 4 : 6)) return;
    dragBegin();
  }
  if (drag.state === "dragging") { ev.preventDefault(); dragUpdate(); }
}
function dragBegin() {
  const r = drag.row.getBoundingClientRect();
  const g = drag.row.cloneNode(true);
  g.classList.remove("lifted", "sel"); g.classList.add("dragghost");
  g.removeAttribute("data-id"); g.setAttribute("aria-hidden", "true");
  g.style.width = r.width + "px"; g.style.left = r.left + "px"; g.style.top = r.top + "px";
  document.body.appendChild(g);
  drag.ghost = g; drag.dx = drag.x0 - r.left; drag.dy = drag.y0 - r.top;
  drag.row.classList.remove("lifted"); drag.row.classList.add("dragging");
  document.body.classList.add("is-dragging");
  drag.state = "dragging";
  dragAutoScroll();
}
function dragUpdate() {
  const d = drag;
  d.ghost.style.left = (d.x - d.dx) + "px"; d.ghost.style.top = (d.y - d.dy) + "px";
  clearDropMarks();
  d.target = null;
  const el = document.elementFromPoint(d.x, d.y);
  const zone = el && el.closest && el.closest("#view [data-dropdate]");
  if (!zone) return;
  zone.classList.add("over");
  const row = el.closest(".task[data-id]");
  let before = null, after = false;
  if (row && zone.contains(row) && row !== d.row) {
    const r = row.getBoundingClientRect();
    after = (d.y - r.top) > r.height / 2;
    before = row.dataset.id;
    row.classList.add(after ? "dropafter" : "dropbefore");
  }
  d.target = { date: zone.dataset.dropdate, near: before, after };
}
function dragAutoScroll() {
  if (!drag || drag.state !== "dragging") return;
  const m = 70, y = drag.y, h = window.innerHeight;
  const v = y < m ? -Math.ceil((m - y) / 5) : y > h - m ? Math.ceil((y - (h - m)) / 5) : 0;
  if (v) { window.scrollBy(0, v); dragUpdate(); }
  requestAnimationFrame(dragAutoScroll);
}
function dragEnd() {
  window.removeEventListener("pointermove", dragPointerMove, { passive: false });
  window.removeEventListener("pointerup", dragPointerUp);
  window.removeEventListener("pointercancel", dragCancel);
  if (!drag) return;
  clearTimeout(drag.timer);
  if (drag.ghost) drag.ghost.remove();
  drag.row.classList.remove("lifted", "dragging");
  document.body.classList.remove("is-dragging");
  clearDropMarks();
  drag = null;
}
function dragCancel() { dragEnd(); }
/* Después de mantener apretado o arrastrar, el navegador manda un "click": no tiene que abrir el editor. */
function swallowNextClick() {
  // En táctil el "tap" cae donde está el dedo: sobre la lista o sobre el fondo de la hoja
  // recién abierta (que la cerraría). El "Deshacer" del aviso tiene que andar enseguida.
  const kill = e => { if (e.target.closest && e.target.closest("#view,#sheetbg")) { e.stopPropagation(); e.preventDefault(); window.removeEventListener("click", kill, { capture: true }); } };
  window.addEventListener("click", kill, { capture: true });
  setTimeout(() => window.removeEventListener("click", kill, { capture: true }), 400);
}
function dragPointerUp(ev) {
  if (!drag || ev.pointerId !== drag.pid) return;
  const d = drag;
  dragEnd();
  if (d.state === "lifted") { swallowNextClick(); openMoveSheet(d.id); return; }
  if (d.state !== "dragging") return;
  swallowNextClick();
  if (d.target) dropTask(d.id, d.from, d.target);
}
function dropTask(id, from, tg) {
  const t = taskById(id); if (!t) return;
  if (tg.date === from) {
    if (t.time) { toast("Las tareas con hora se ordenan solas por hora"); return; }
    if (!tg.near) return;
    const ids = tasksOn(from).map(x => x.id);
    const i = ids.indexOf(id); if (i < 0) return;
    ids.splice(i, 1);
    const at = ids.indexOf(tg.near); if (at < 0) return;
    applyOrder(ids, at + (tg.after ? 1 : 0), id);
    toast("Orden actualizado");
    return;
  }
  if (!canMoveTask(t)) { toast("Las tareas que se repiten no se mueven de día"); return; }
  moveTaskTo(id, tg.date, tg.near ? { near: tg.near, after: tg.after } : null);
}
/* Cambia el día de una tarea (no las que se repiten). Si viene `pos`, la ubica
   antes/después de otra tarea de ese día; si no, al final. Siempre con deshacer. */
function moveTaskTo(id, date, pos) {
  const t = taskById(id);
  if (!canMoveTask(t) || !date) return false;
  if (t.date === date && !pos) return false;
  const snap = state.tasks.filter(x => x === t || occursOn(x, date)).map(x => [x, x.date, x.ord, x.status]);
  t.date = date;
  if (t.status === "post") t.status = "pend";
  t.ord = null;
  if (pos && !t.time) {
    const ids = tasksOn(date).map(x => x.id).filter(x => x !== id);
    const at = ids.indexOf(pos.near);
    if (at >= 0) { ids.splice(at + (pos.after ? 1 : 0), 0, id); ids.forEach((x, k) => { const y = taskById(x); if (y) y.ord = k; }); }
  }
  change(); render();
  toast("Movida a " + dayName(date), () => {
    for (const [x, dt, ord, st] of snap) { x.date = dt; x.ord = ord; x.status = st; }
    change(); render();
  });
  return true;
}
/* "hoy", "mañana" o "jue 5 nov" */
function dayName(d) {
  const t = todayISO();
  return d === t ? "hoy" : d === addDays(t, 1) ? "mañana" : fmtD(d);
}
function nextMonday(d) { const w = dToDate(d).getDay(); return addDays(d, ((8 - w) % 7) || 7); }
function moveOptions() {
  const t = todayISO();
  return [["Hoy", t], ["Mañana", addDays(t, 1)], ["Pasado mañana", addDays(t, 2)], ["En 3 días", addDays(t, 3)],
    ["Próximo lunes", nextMonday(t)], ["En 1 semana", addDays(t, 7)]];
}
/* Hoja "Mover a…": abajo en el celu (al alcance del pulgar), centrada en desktop. */
function openMoveSheet(id) {
  const t = taskById(id);
  if (!canMoveTask(t)) { if (t) toast("Las tareas que se repiten no se mueven de día"); return; }
  const bg = byId("sheetbg"), sh = byId("sheet");
  const now = t.date ? "Ahora: " + dayName(t.date) + (t.date === todayISO() || t.date === addDays(todayISO(), 1) ? " · " + fmtD(t.date) : "") : t.due ? "Sin día · vence " + fmtD(t.due) : "Sin fecha";
  const opts = moveOptions().filter(([n, d]) => !(n === "Hoy" && t.date === d));
  sh.innerHTML = `<div class="sheetgrip" aria-hidden="true"></div>
    <div class="sheethead"><div class="sheettitle">Mover “${esc(t.title.slice(0, 60))}”</div><div class="tiny">${esc(now)}</div></div>
    <div class="sheetlist">
      ${opts.map(([n, d]) => `<button class="sheetopt${t.date === d ? " cur" : ""}" ${t.date === d ? 'aria-current="date" disabled' : ""} onclick="closeMoveSheet();moveTaskTo('${t.id}','${d}')">
        <span>${n}</span><span class="sheetdate">${t.date === d ? "✓ " : ""}${fmtD(d)}</span></button>`).join("")}
      <button class="sheetopt" id="mv_pick" onclick="moveSheetPick()"><span>Elegir fecha…</span><span class="sheetdate">›</span></button>
      <div class="sheetpick" id="mv_pickrow" hidden>
        <input type="date" id="mv_date" value="${t.date || addDays(todayISO(), 1)}" aria-label="Fecha">
        <button class="btn primary" onclick="const v=byId('mv_date').value;if(v){closeMoveSheet();moveTaskTo('${t.id}',v)}">Mover</button>
      </div>
    </div>
    <button class="sheetopt sheetcancel" onclick="closeMoveSheet()">Cancelar</button>`;
  bg.classList.add("open");
  setTimeout(() => { const b = sh.querySelector(".sheetopt:not(.cur)"); if (b && matchMedia("(hover:hover)").matches) b.focus(); }, 30);
}
function moveSheetPick() {
  const r = byId("mv_pickrow"); if (!r) return;
  r.hidden = false; byId("mv_pick").hidden = true;
  const i = byId("mv_date"); if (i) i.focus();
}
function closeMoveSheet() { const bg = byId("sheetbg"); if (bg) bg.classList.remove("open"); }
function moveTaskOrder(id, dir, date) {
  const mt = taskById(id); if (mt && mt.time) { toast("Las tareas con hora se ordenan solas por hora"); return; }
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
/* Cambia el día en que cuenta una tarea hecha: mueve el contador del día y el
   tiempo que se registró automáticamente al completarla. */
function moveDoneDate(t, nd) {
  const old = t.doneAt;
  if (!nd || old === nd) return;
  if (old && state.dayLog[old] && state.dayLog[old].tasksDone) state.dayLog[old].tasksDone--;
  bumpDayDone(nd);
  for (const s of state.sessions) if (s.taskId === t.id && s.auto && s.date === old) s.date = nd;
  t.doneAt = nd;
  change();
}
function bumpDayDone(d) { state.dayLog[d] = state.dayLog[d] || {}; state.dayLog[d].tasksDone = (state.dayLog[d].tasksDone || 0) + 1; }
/* Al completar una tarea se pregunta cuánto llevó realmente: ese tiempo (no el estimado)
   es el que suma a las estadísticas de la materia. Se descuenta lo ya registrado
   (a mano, o con el pomodoro en versiones viejas) para no contar doble, y todo se revierte al desmarcar. */
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
    if (credit > 0) addSession(credit, { taskId: t.id, date: t.recur ? (date || todayISO()) : (t.doneAt || todayISO()), auto: true, note: "Tarea completada (tiempo real)" });
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
  delete c.seriesId; // la copia es una tarea suelta, no otra ocurrencia de la serie
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
    tags: data.tags || [], subtasks: [], notes: "", recur: data.recur || null, recurDone: {}, realMin: 0, time: data.time || null,
    createdAt: todayISO(), doneAt: null, archived: false
  };
  if (data.seriesId) t.seriesId = data.seriesId;
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
function addStudyBlock() {
  const from = byId("sb_from").value, to = byId("sb_to").value;
  const f = hmToMin(from), t = hmToMin(to);
  if (f == null || t == null) { toast("Cargá hora de inicio y de fin"); return; }
  if (t <= f) { toast("La hora de fin debe ser posterior a la de inicio"); return; }
  const dp = state.dayPlan[todayISO()] = state.dayPlan[todayISO()] || { blocks: [] };
  dp.blocks.push({ id: uid(), from, to });
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
  if (sum > total) { el.textContent = "te pasás por " + fmtMin(sum - total); el.style.color = "var(--warn)"; }
  else { el.textContent = "quedan " + fmtMin(total - sum); el.style.color = ""; }
}
function createDistTasks() {
  const today = todayISO();
  let created = 0;
  document.querySelectorAll(".dist-inp").forEach(inp => {
    const n = parseInt(inp.value) || 0;
    if (n > 0) {
      quickAddTask({ title: "Sesión de estudio", subjectId: inp.dataset.sid, date: today, estMin: n, type: "estudio" });
      created++;
    }
  });
  if (!created) { toast("Asigná minutos al menos a una materia"); return; }
  render(); toast(created + " tarea" + (created > 1 ? "s" : "") + " creada" + (created > 1 ? "s" : "") + " para hoy");
}
function studyTodayCard() {
  const today = todayISO();
  pruneDayPlan();
  const dp = state.dayPlan[today] = state.dayPlan[today] || { blocks: [] };
  const rows = dp.blocks.map(b => {
    const min = blockMinutes(b);
    return `<div class="task" style="cursor:default">
      <span class="pill acc" style="min-width:104px;text-align:center">${esc(b.from)} – ${esc(b.to)}</span>
      <div class="tinfo"><div class="tt">${fmtMin(min)}</div></div>
      <button class="btn sm ghost" title="Quitar bloque" onclick="delStudyBlock('${b.id}')">×</button></div>`;
  }).join("");
  const totMin = dp.blocks.reduce((a, b) => a + blockMinutes(b), 0);
  let dist = "";
  if (totMin > 0) {
    dist = `<div class="hr"></div>
    <p class="tiny" style="margin-bottom:6px">Repartí los <b>${fmtMin(totMin)}</b> entre tus materias (en minutos) y creá las tareas de hoy — <span id="distLeft">quedan ${fmtMin(totMin)}</span></p>` +
    activeSubjects().map(s => `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">
      <span class="tag" style="background:${s.color}1c;color:${s.color};min-width:52px;text-align:center">${esc(s.short)}</span>
      <span style="flex:1;font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.name)}</span>
      <input type="number" class="dist-inp" data-sid="${s.id}" value="0" min="0" step="15" max="${totMin}" oninput="updateDistLeft(${totMin})" aria-label="Minutos para ${escA(s.name)}" style="width:76px;background:var(--card2);border:1px solid var(--line);border-radius:7px;padding:5px 7px"></div>`).join("") +
    `<div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn sm primary" onclick="createDistTasks()">Crear tareas para hoy</button></div>`;
  }
  return `<div class="card"><h3>Estudio de hoy<div class="grow"></div>
    <span class="tiny">${totMin ? fmtMin(totMin) + " disponibles" : ""}</span></h3>
    ${rows || '<p class="tiny" style="margin-bottom:6px">Cargá tus horarios de estudio de hoy. Podés agregar varios bloques (por ejemplo 14:00–17:00 y 20:00–22:00) .</p>'}
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
      <input type="time" id="sb_from" value="14:00" aria-label="Hora de inicio" style="background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:6px">
      <span class="tiny">a</span>
      <input type="time" id="sb_to" value="17:00" aria-label="Hora de fin" style="background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:6px">
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
/* Tareas de un parcial: las de su plan y las vinculadas a mano (B3). */
function evalPlanTasks(evId) { return state.tasks.filter(t => (t.planId === evId || t.evalId === evId) && !t.archived); }
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

/* ===================== TIEMPO ESTUDIADO (manual) =====================
   El pomodoro se sacó en Aula 2.11 (A4). Las sesiones ya registradas se conservan
   (state.sessions, con su campo pomos) y siguen sumando en estadísticas; los
   campos viejos (settings.pomo, state.timer, t.pomos) quedan en los datos pero
   no se muestran. El tiempo se carga a mano con "Registrar tiempo". */
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
  closeModal(); render(); toast(fmtMin(min) + " registrados");
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
/* =====================================================================
   SELECCIÓN MÚLTIPLE — Ctrl/Cmd+clic suma, Shift+clic rango,
   y acciones en lote sobre todo lo seleccionado.
   ===================================================================== */
function selSet() { return (ui.sel = ui.sel || new Set()); }
function isSel(id) { return selSet().has(id); }
function selTasks() { return [...selSet()].map(taskById).filter(Boolean); }
function markSelRows() {
  document.querySelectorAll(".task[data-id]").forEach(el => {
    if (el.classList) el.classList.toggle("sel", isSel(el.getAttribute("data-id")));
  });
}
function selRefresh() { renderSelBar(); markSelRows(); }
function toggleSel(id) { const s = selSet(); if (s.has(id)) s.delete(id); else s.add(id); ui.selAnchor = id; selRefresh(); }
function selRange(id) {
  const s = selSet(), list = ui.selList || [];
  const a = list.indexOf(ui.selAnchor), b = list.indexOf(id);
  if (a < 0 || b < 0) { toggleSel(id); return; }
  const i = Math.min(a, b), j = Math.max(a, b);
  for (let k = i; k <= j; k++) s.add(list[k]);
  ui.selAnchor = id; selRefresh();
}
function clearSel() { ui.sel = new Set(); ui.selMode = false; render(); }
function selectAllVisible() { const s = selSet(); (ui.selList || []).forEach(id => s.add(id)); ui.selMode = true; selRefresh(); }
function toggleSelMode() { ui.selMode = !ui.selMode; if (!ui.selMode) ui.sel = new Set(); render(); toast(ui.selMode ? "Modo selección: tocá las tareas que quieras" : "Modo selección desactivado"); }
/* Clic sobre una fila: normal abre el editor; con Ctrl/Cmd o Shift selecciona */
function taskClick(ev, id) {
  if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); ev.stopPropagation(); toggleSel(id); return; }
  if (ev.shiftKey) { ev.preventDefault(); ev.stopPropagation(); selRange(id); return; }
  if (ui.selMode || selSet().size) { ev.preventDefault(); ev.stopPropagation(); toggleSel(id); return; }
  openTaskEditor(id);
}
function renderSelBar() {
  const el = byId("selbar"); if (!el) return;
  const n = selSet().size;
  try { document.body.classList.toggle("selbar-on", !!n); } catch (e) {}
  if (!n) { el.className = ""; el.innerHTML = ""; return; }
  const ts = selTasks();
  const min = ts.reduce((a, t) => a + (t.estMin || 0), 0);
  const nDone = ts.filter(t => t.status === "done").length;
  el.className = "show";
  el.innerHTML = `<span class="selcount"><b>${n}</b> seleccionada${n > 1 ? "s" : ""}${min ? ` · ${fmtMin(min)}` : ""}</span>
    <button class="btn sm" onclick="bulkComplete()" title="Marcar como completadas con su tiempo estimado">${nDone === n ? "Desmarcar" : "Completar"}</button>
    <button class="btn sm" onclick="bulkShiftDays(1)" title="Correr un día">+1 día</button>
    <button class="btn sm" onclick="bulkToday()">A hoy</button>
    <button class="btn sm" onclick="openBulkModal('date')">Fecha…</button>
    <button class="btn sm" onclick="openBulkModal('subject')">Materia…</button>
    <button class="btn sm" onclick="openBulkModal('time')">Tiempo…</button>
    <button class="btn sm" onclick="openBulkModal('prio')">Prioridad…</button>
    <button class="btn sm" onclick="bulkArchive()">Archivar</button>
    <button class="btn sm danger" onclick="bulkDelete()">Eliminar</button>
    <button class="btn sm ghost" onclick="selectAllVisible()" title="Seleccionar todo lo visible">Todo</button>
    <button class="btn sm ghost" onclick="clearSel()" title="Limpiar selección">✕</button>`;
}
/* Acredita el tiempo estimado sin abrir el diálogo (para operaciones en lote) */
function creditEstimate(t) {
  const credit = Math.max(0, (t.estMin || 0) - (t.realMin || 0));
  if (credit > 0) addSession(credit, { taskId: t.id, auto: true, note: "Completada en lote (tiempo estimado)" });
}
function bulkComplete() {
  const ts = selTasks().filter(t => !t.recur);
  if (!ts.length) { toast("Las tareas recurrentes se marcan una por una"); return; }
  const allDone = ts.every(t => t.status === "done");
  ts.forEach(t => {
    if (allDone) { t.status = "pend"; t.doneAt = null; uncreditTaskDone(t); }
    else if (t.status !== "done") { t.status = "done"; t.doneAt = todayISO(); bumpDayDone(todayISO()); creditEstimate(t); }
  });
  change(); render();
  toast(allDone ? ts.length + " tareas desmarcadas" : ts.length + " tareas completadas con su tiempo estimado");
}
function bulkShiftDays(n) {
  const ts = selTasks().filter(t => !t.recur);
  ts.forEach(t => {
    if (t.date) t.date = addDays(t.date, n);
    else if (t.due) t.due = addDays(t.due, n);
    t.ord = null;
  });
  change(); render(); toast(ts.length + " tareas movidas " + (n > 0 ? "+" : "") + n + " día" + (Math.abs(n) > 1 ? "s" : ""));
}
function bulkToday() {
  const ts = selTasks().filter(t => !t.recur);
  ts.forEach(t => { t.date = todayISO(); t.ord = null; if (t.status === "post") t.status = "pend"; });
  change(); render(); toast(ts.length + " tareas movidas a hoy");
}
function bulkArchive() {
  const ts = selTasks();
  const toArch = ts.some(t => !t.archived);
  ts.forEach(t => t.archived = toArch);
  clearSel(); change(); render(); toast(ts.length + (toArch ? " tareas archivadas" : " tareas restauradas"));
}
function bulkDelete() {
  const ts = selTasks();
  if (!ts.length) return;
  doubleDelete(ts.length + " tareas seleccionadas", () => {
    const snap = ts.map(t => ({ t, i: state.tasks.indexOf(t) })).filter(x => x.i >= 0).sort((a, b) => b.i - a.i);
    snap.forEach(x => state.tasks.splice(x.i, 1));
    ui.sel = new Set(); ui.selMode = false;
    change(); closeModal(); render();
    toast(snap.length + " tareas eliminadas", () => {
      [...snap].reverse().forEach(x => state.tasks.splice(Math.min(x.i, state.tasks.length), 0, x.t));
      change(); render();
    });
  });
}
function openBulkModal(kind) {
  const n = selSet().size;
  if (kind === "date") {
    openModal(`<h3>Cambiar fecha — ${n} tarea${n > 1 ? "s" : ""}</h3>
      <div class="mrow">
        <div><label for="bk_mode">Campo</label><select id="bk_mode"><option value="d">Fecha programada</option><option value="due">Fecha límite</option></select></div>
        <div><label for="bk_date">Fecha</label><input id="bk_date" type="date" value="${todayISO()}"></div>
      </div>
      <p class="tiny" style="margin-top:8px">Todas las seleccionadas pasan a esa fecha.</p>
      <div class="mfoot"><button class="btn" onclick="closeModal()">Cancelar</button>
        <button class="btn primary" onclick="bulkSetDate()">Aplicar</button></div>`);
  } else if (kind === "subject") {
    openModal(`<h3>Cambiar materia o proyecto — ${n} tarea${n > 1 ? "s" : ""}</h3>
      <label for="bk_link">Asignar a</label><select id="bk_link">${linkOptions("")}</select>
      <div class="mfoot"><button class="btn" onclick="closeModal()">Cancelar</button>
        <button class="btn primary" onclick="bulkSetSubject()">Aplicar</button></div>`);
  } else if (kind === "time") {
    openModal(`<h3>Cambiar tiempo estimado — ${n} tarea${n > 1 ? "s" : ""}</h3>
      <div class="mrow">
        <div><label for="bk_op">Operación</label><select id="bk_op">
          <option value="set">Fijar en</option><option value="add">Sumar</option>
          <option value="sub">Restar</option><option value="mul">Multiplicar por</option></select></div>
        <div><label for="bk_val">Valor</label><input id="bk_val" type="number" value="60" step="5" min="0"></div>
      </div>
      <p class="tiny" style="margin-top:8px">En minutos (para multiplicar, usá por ejemplo 1.5 para sumarles un 50%).</p>
      <div class="mfoot"><button class="btn" onclick="closeModal()">Cancelar</button>
        <button class="btn primary" onclick="bulkSetTime()">Aplicar</button></div>`);
  } else if (kind === "prio") {
    openModal(`<h3>Cambiar prioridad — ${n} tarea${n > 1 ? "s" : ""}</h3>
      <label for="bk_prio">Prioridad</label><select id="bk_prio">${PRIO.map((p, i) => `<option value="${i}" ${i === 1 ? "selected" : ""}>${p}</option>`).join("")}</select>
      <div class="mfoot"><button class="btn" onclick="closeModal()">Cancelar</button>
        <button class="btn primary" onclick="bulkSetPrio()">Aplicar</button></div>`);
  }
}
function bulkSetDate() {
  const mode = byId("bk_mode").value, d = byId("bk_date").value;
  if (!d) { toast("Elegí una fecha"); return; }
  const ts = selTasks().filter(t => !t.recur);
  ts.forEach(t => { if (mode === "d") { t.date = d; t.ord = null; } else t.due = d; });
  change(); closeModal(); render(); toast(ts.length + " tareas pasadas al " + fmtD(d));
}
function bulkSetSubject() {
  const v = byId("bk_link").value;
  const ts = selTasks();
  ts.forEach(t => {
    t.subjectId = v.startsWith("s:") ? v.slice(2) : null;
    t.projectId = v.startsWith("p:") ? v.slice(2) : null;
  });
  change(); closeModal(); render(); toast(ts.length + " tareas reasignadas");
}
function bulkSetTime() {
  const op = byId("bk_op").value, val = parseFloat(byId("bk_val").value) || 0;
  const ts = selTasks();
  ts.forEach(t => {
    const cur = t.estMin || 0;
    t.estMin = Math.max(0, Math.round(op === "set" ? val : op === "add" ? cur + val : op === "sub" ? cur - val : cur * val));
  });
  change(); closeModal(); render(); toast("Tiempo actualizado en " + ts.length + " tareas");
}
function bulkSetPrio() {
  const p = parseInt(byId("bk_prio").value);
  selTasks().forEach(t => t.prio = p);
  change(); closeModal(); render(); toast("Prioridad actualizada");
}

/* =====================================================================
   VISTA PREVIA DEL DÍA — resumen emergente desde el calendario
   ===================================================================== */
function openDayPreview(date) {
  const ts = tasksOn(date);
  const evs = state.evals.filter(e => e.date === date);
  const habs = state.habits.filter(h => habitDueOn(h, date));
  const sess = state.sessions.filter(s => s.date === date);
  const realTot = sess.reduce((a, s) => a + s.min, 0);
  const estTot = ts.reduce((a, t) => a + (t.estMin || 0), 0);
  const pendMin = ts.filter(t => !isDoneOn(t, date)).reduce((a, t) => a + (t.estMin || 0), 0);
  const doneN = ts.filter(t => isDoneOn(t, date)).length;

  /* agrupar por materia / proyecto */
  const groups = new Map();
  const keyOf = t => t.subjectId ? "s:" + t.subjectId : t.projectId ? "p:" + t.projectId : "none";
  for (const t of ts) {
    const k = keyOf(t);
    if (!groups.has(k)) groups.set(k, { k, tasks: [], est: 0, real: 0 });
    const g = groups.get(k); g.tasks.push(t); g.est += t.estMin || 0;
  }
  for (const s of sess) {
    const k = s.subjectId ? "s:" + s.subjectId : s.projectId ? "p:" + s.projectId : "none";
    if (!groups.has(k)) groups.set(k, { k, tasks: [], est: 0, real: 0 });
    groups.get(k).real += s.min;
  }
  const rows = [...groups.values()].map(g => {
    const sub = g.k.startsWith("s:") ? subjById(g.k.slice(2)) : null;
    const prj = g.k.startsWith("p:") ? projById(g.k.slice(2)) : null;
    return {
      name: sub ? sub.name : prj ? prj.name : "Sin materia",
      short: sub ? sub.short : prj ? prj.name.slice(0, 6) : "—",
      color: sub ? sub.color : "#64748b",
      n: g.tasks.length, est: g.est, real: g.real,
      done: g.tasks.filter(t => isDoneOn(t, date)).length
    };
  }).sort((a, b) => (b.est + b.real) - (a.est + a.real));

  const isToday = date === todayISO();
  let h = `<h3>${esc(capitalize(fmtDFull(date)))}${isToday ? ' <span class="pill acc">hoy</span>' : ""}</h3>`;
  h += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">
    <div class="card" style="margin:0;padding:11px 12px"><div class="statnum" style="font-size:1.25rem">${fmtMin(estTot)}</div><div class="statlab">planificado</div></div>
    <div class="card" style="margin:0;padding:11px 12px"><div class="statnum" style="font-size:1.25rem">${fmtMin(pendMin)}</div><div class="statlab">pendiente · ${ts.length - doneN} de ${ts.length} tareas</div></div>
    <div class="card" style="margin:0;padding:11px 12px"><div class="statnum" style="font-size:1.25rem;color:var(--ok)">${fmtMin(realTot)}</div><div class="statlab">ya estudiado</div></div>
  </div>`;

  if (evs.length) h += `<div style="margin-bottom:10px">${evs.map(e => `<div class="task" style="background:var(--bad-soft);border-radius:8px" onclick="closeModal();go('eval','${e.id}')">
    <div class="tinfo"><div class="tt"><b>${esc(e.name)}</b> · ${EVAL_KINDS[e.kind] || e.kind}${e.time ? " · " + esc(e.time) + " hs" : ""}</div></div>
    <span class="pill bad">evaluación</span></div>`).join("")}</div>`;

  if (rows.length) {
    h += `<div style="overflow-x:auto;margin-bottom:12px"><table class="stt">
      <thead><tr><th>Materia</th><th style="text-align:right">Tareas</th><th style="text-align:right">Planificado</th><th style="text-align:right">Estudiado</th></tr></thead><tbody>`;
    for (const r of rows) {
      h += `<tr><td><span class="tag" style="background:${r.color}1c;color:${r.color}">${esc(r.short)}</span> ${esc(r.name)}</td>
        <td style="text-align:right">${r.n ? r.done + "/" + r.n : "—"}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums"><b>${r.est ? fmtMin(r.est) : "—"}</b></td>
        <td style="text-align:right;color:var(--ok);font-variant-numeric:tabular-nums">${r.real ? fmtMin(r.real) : "—"}</td></tr>`;
    }
    h += `<tr style="border-top:2px solid var(--line)"><td><b>Total del día</b></td><td style="text-align:right"><b>${doneN}/${ts.length}</b></td>
      <td style="text-align:right"><b>${fmtMin(estTot)}</b></td><td style="text-align:right;color:var(--ok)"><b>${fmtMin(realTot)}</b></td></tr>`;
    h += `</tbody></table></div>`;
  }

  h += ts.length
    ? `<div style="max-height:40vh;overflow-y:auto">${ts.map(t => taskRow(t, { date, showEval: false, noSel: true })).join("")}</div>`
    : `<div class="empty">No hay tareas ese día.</div>`;

  if (habs.length) h += `<p class="tiny" style="margin-top:10px">Hábitos: ${habs.map(x => esc(x.name) + (x.checks && x.checks[date] ? " ✓" : "")).join(" · ")}</p>`;

  h += `<div class="mfoot">
    <button class="btn" onclick="closeModal();openQuickTask('${date}')">Nueva tarea ese día</button>
    <button class="btn" onclick="closeModal();ui.weekBase='${weekStartOf(date, state.settings.weekStart)}';go('week')">Ver la semana</button>
    <div class="grow"></div>
    <button class="btn primary" onclick="closeModal()">Cerrar</button></div>`;
  openModal(h, true);
}

/* =====================================================================
   SERIES — tareas repetidas día a día hasta una fecha
   ===================================================================== */
function buildSeries() {
  const map = new Map();
  for (const t of state.tasks) {
    if (t.archived || t.status === "canc") continue;
    if (t.recur) {
      map.set("r:" + t.id, { key: "r:" + t.id, kind: "recur", title: t.title, subjectId: t.subjectId, projectId: t.projectId, tasks: [t] });
      continue;
    }
    if (!t.date || !t.seriesId) continue; // solo series explícitas (A3)
    const k = "s:" + t.seriesId;
    if (!map.has(k)) map.set(k, { key: k, kind: "group", title: t.title, subjectId: t.subjectId, projectId: t.projectId, tasks: [] });
    map.get(k).tasks.push(t);
  }
  const today = todayISO(), out = [];
  for (const s of map.values()) {
    if (s.kind === "group" && s.tasks.length < 2) continue;
    s.tasks.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    s.from = s.tasks[0].date;
    s.to = s.tasks[s.tasks.length - 1].date;
    s.pend = s.tasks.filter(t => t.status !== "done");
    s.doneN = s.tasks.length - s.pend.length;
    s.pendMin = s.pend.reduce((a, t) => a + (t.estMin || 0), 0);
    s.totMin = s.tasks.reduce((a, t) => a + (t.estMin || 0), 0);
    s.mins = [...new Set(s.tasks.map(t => t.estMin || 0))].sort((a, b) => a - b);
    s.next = s.pend.find(t => t.date >= today) || null;
    s.active = s.kind === "recur"
      ? (!s.tasks[0].recur || !s.tasks[0].recur.end || s.tasks[0].recur.end >= today)
      : (s.to >= today);
    out.push(s);
  }
  return out.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || String(a.to || "").localeCompare(String(b.to || "")));
}
function seriesByKey(k) { return buildSeries().find(s => s.key === k) || null; }
function seriesLabel(s) {
  const o = s.subjectId ? subjById(s.subjectId) : null, p = s.projectId ? projById(s.projectId) : null;
  return o ? { name: o.short, color: o.color, full: o.name } : p ? { name: p.name.slice(0, 8), color: "#64748b", full: p.name } : null;
}
/* C3 · La vista Series es una lista simple (estilo Ajustes del iPhone): cada
   fila dice qué es, cada cuánto y cómo va; tocarla abre el editor de la serie. */
function viewSeries() {
  const all = buildSeries();
  const act = all.filter(s => s.active), old = all.filter(s => !s.active);
  const row = s => {
    const lb = seriesLabel(s), recur = s.kind === "recur";
    const how = recur ? recurLabel(s.tasks[0].recur) + ", sin fin" : seriesPattern(s.tasks.map(t => t.date)).label;
    const prog = recur ? "" : ` · ${s.doneN}/${s.tasks.length} hechas`;
    const next = recur ? "" : s.next ? ` · próxima ${fmtD(s.next.date)}` : s.active ? "" : ` · terminó ${fmtD(s.to)}`;
    return `<button type="button" class="serrow" onclick="openSeriesModal('${escA(s.key)}')">
      <span class="serdot" style="background:${lb ? lb.color : "var(--tx3)"}"></span>
      <span class="sermain"><span class="sertitle">${esc(s.title)}</span>
        <span class="tiny">${lb ? esc(lb.name) + " · " : ""}${esc(how)}${prog}${next}</span></span>
      ${recur ? "" : `<span class="serpct" aria-hidden="true"><i style="width:${Math.round(s.doneN / s.tasks.length * 100)}%"></i></span>`}
      <span class="serchev" aria-hidden="true">›</span></button>`;
  };
  let h = `<div class="vhead"><h2>Series</h2><span class="sub">tareas que se repiten</span>
    <div class="grow"></div><button class="btn primary" onclick="openQuickTask()">Nueva serie</button></div>`;
  h += act.length ? `<div class="card serlist">${act.map(row).join("")}</div>`
    : `<div class="card"><div class="empty">No tenés series activas.<br>Al crear una tarea, elegí “Repetir” y la serie aparece acá.</div></div>`;
  if (old.length) h += `<details class="card sermore"><summary>Terminadas (${old.length})</summary><div class="serlist">${old.map(row).join("")}</div></details>`;
  return h;
}
function recurLabel(r) {
  r = r || {};
  if (r.kind === "daily") return "todos los días";
  if (r.kind === "weekly") return "cada semana";
  if (r.kind === "monthly") return "cada mes";
  if (r.kind === "interval") return "cada " + (r.n || 2) + " días";
  if (r.kind === "days" && r.days && r.days.length) {
    const o = [1, 2, 3, 4, 5, 6, 0].filter(d => r.days.includes(d)).map(d => DAYS[d]);
    return o.length === 1 ? "los " + o[0] : "los " + o.slice(0, -1).join(", ") + " y " + o[o.length - 1];
  }
  return "se repite";
}
/* C3 · "3 de 5": posición de una tarea dentro de su serie. */
function seriesPos(t) {
  if (!t || !t.seriesId || t.recur) return null;
  if (!ui.serMap) {
    ui.serMap = new Map();
    for (const x of state.tasks) {
      if (!x.seriesId || x.recur || !x.date || x.archived || x.status === "canc") continue;
      if (!ui.serMap.has(x.seriesId)) ui.serMap.set(x.seriesId, []);
      ui.serMap.get(x.seriesId).push(x);
    }
    for (const v of ui.serMap.values()) v.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  const list = ui.serMap.get(t.seriesId) || [];
  const i = list.indexOf(t);
  return list.length >= 2 && i >= 0 ? { i: i + 1, n: list.length, key: "s:" + t.seriesId, list } : null;
}
/* C2a · Editor de serie: todas las ocurrencias en una lista, selección
   (todas / pendientes / ninguna / a mano) y acciones masivas con vista previa
   antes de aplicar y deshacer después. El modal queda abierto después de
   aplicar, así se puede encadenar ("+1 h 30 a todas" y después "+10 min a una"). */
const SR_ACTS = [
  ["add", "Sumar tiempo"], ["sub", "Restar tiempo"], ["set", "Fijar tiempo"],
  ["move", "Mover de día"], ["time", "Cambiar hora"], ["del", "Borrar"]
];
function openSeriesModal(key) {
  const s = seriesByKey(key); if (!s) { toast("La serie ya no existe"); return; }
  ui.srSel = new Set(s.pend.map(t => t.id)); // por defecto: las pendientes
  if (ui.seriesKey !== key || !ui.srAct) {
    ui.srAct = "add"; ui.srMin = 90; ui.srDays = 1; ui.srTime = "";
    ui.srAddMode = "count"; ui.srAddN = 1; ui.srUntil = ""; ui.srAddOne = ""; ui.srAddOpen = false;
  }
  ui.srOpen = null;
  ui.seriesKey = key;
  openModal(seriesModalHTML(s), true, true);
  srPreview();
}
function refreshSeriesModal() {
  const box = byId("modalbox");
  if (!byId("modalbg").classList.contains("open") || !box.querySelector("#sr_occ")) return;
  const s = seriesByKey(ui.seriesKey);
  if (!s) { closeModal(); return; }
  const keepScroll = byId("sr_occ").scrollTop;
  box.innerHTML = seriesModalHTML(s);
  byId("sr_occ").scrollTop = keepScroll;
  srPreview();
}
function seriesModalHTML(s) {
  const lb = seriesLabel(s), recur = s.kind === "recur", today = todayISO();
  let h = `<h3>${esc(s.title)}</h3>
    <p class="tiny">${lb ? esc(lb.full) + " · " : ""}${recur ? esc(recurLabel(s.tasks[0].recur)) + ", sin fin · " + fmtMin(s.tasks[0].estMin) + " cada vez" : `${s.tasks.length} tareas · ${s.doneN} hechas · ${fmtMin(s.totMin)} en total`}</p>`;
  if (!recur) {
    const ids = new Set(s.tasks.map(t => t.id));
    ui.srSel = new Set([...ui.srSel].filter(id => ids.has(id))); // las borradas ya no cuentan
    const row = t => {
      const done = t.status === "done", late = !done && t.date < today, open = ui.srOpen === t.id;
      let r = `<div class="occ${done ? " done" : ""}${open ? " open" : ""}" data-id="${escA(t.id)}">
        <label class="occl"><input type="checkbox" ${ui.srSel.has(t.id) ? "checked" : ""} onchange="srToggle('${escA(t.id)}',this.checked)">
        <span class="occd">${fmtD(t.date)}${t.time ? ` <span class="ttime">${esc(t.time)}</span>` : ""}</span>
        <span class="occst">${done ? "✓ hecha" : late ? "atrasada" : t.date === today ? "hoy" : ""}</span>
        <span class="occm">${fmtMin(t.estMin)}</span></label>
        <button type="button" class="occmore" aria-expanded="${open}" aria-label="Editar solo la del ${escA(fmtD(t.date))}" onclick="srEdit('${escA(t.id)}')">${open ? "Listo" : "Editar"}</button></div>`;
      if (open) r += `<div class="occedit">
        <div class="occstep"><span class="tiny">Solo esta</span>
          <button type="button" class="btn sm" onclick="srOne('${escA(t.id)}','add',-10)" aria-label="Restar 10 minutos">−10 m</button>
          <input id="sr_onemin" type="number" min="0" step="5" value="${t.estMin || 0}" aria-label="Minutos de esta" onchange="srOne('${escA(t.id)}','min',this.value)">
          <button type="button" class="btn sm" onclick="srOne('${escA(t.id)}','add',10)" aria-label="Sumar 10 minutos">+10 m</button></div>
        <div class="mrow">
          <div><label for="sr_onedate">Fecha</label><input id="sr_onedate" type="date" value="${escA(t.date)}" onchange="srOne('${escA(t.id)}','date',this.value)"></div>
          <div><label for="sr_onetime">Hora</label><input id="sr_onetime" type="time" value="${escA(t.time || "")}" onchange="srOne('${escA(t.id)}','time',this.value)"></div>
        </div>
        <div class="occacts"><button type="button" class="btn sm" onclick="closeModal();openTaskEditor('${escA(t.id)}')">Abrir la tarea</button>
          <div class="grow"></div><button type="button" class="btn sm danger" onclick="srOne('${escA(t.id)}','del')">Quitar de la serie</button></div>
      </div>`;
      return r;
    };
    h += `<div class="srbar"><span class="tiny">Elegir:</span>
        <button type="button" class="btn sm" onclick="srSelect('all')">Todas</button>
        <button type="button" class="btn sm" onclick="srSelect('pend')">Pendientes</button>
        <button type="button" class="btn sm" onclick="srSelect('none')">Ninguna</button>
        <div class="grow"></div><span class="tiny" id="sr_count"></span></div>
      <div class="occlist" id="sr_occ">${s.tasks.map(row).join("")}</div>
      <div class="srbulk">
        <div class="mrow">
          <div><label for="sr_act">Qué hacer con las elegidas</label><select id="sr_act" onchange="ui.srAct=this.value;srPreview()">
            ${SR_ACTS.map(([v, l]) => `<option value="${v}"${ui.srAct === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="srx" id="sr_minwrap"><label for="sr_min">Minutos</label><input id="sr_min" type="number" min="0" step="5" value="${ui.srMin}" oninput="ui.srMin=this.value;srPreview()"></div>
          <div class="srx" id="sr_dayswrap"><label for="sr_days">Días (− antes, + después)</label><input id="sr_days" type="number" step="1" value="${ui.srDays}" oninput="ui.srDays=this.value;srPreview()"></div>
          <div class="srx" id="sr_timewrap"><label for="sr_time">Hora (vacía = sin hora)</label><input id="sr_time" type="time" value="${escA(ui.srTime)}" oninput="ui.srTime=this.value;srPreview()"></div>
        </div>
        <div class="srchips srx" id="sr_minchips">${[10, 30, 60, 90, 120].map(m => `<button type="button" class="btn sm" onclick="srSetVal('sr_min',${m})">${fmtMin(m)}</button>`).join("")}</div>
        <div class="srchips srx" id="sr_dayschips">${[-7, -1, 1, 2, 3, 7].map(d => `<button type="button" class="btn sm" onclick="srSetVal('sr_days',${d})">${d > 0 ? "+" : "−"}${Math.abs(d)} d</button>`).join("")}</div>
        <div class="reppreview" id="sr_preview" aria-live="polite"></div>
        <button type="button" class="btn primary srapply" id="sr_apply" onclick="seriesBulkApply()">Aplicar</button>
      </div>`;
    const pat = seriesPattern(s.tasks.map(t => t.date));
    h += `<details class="sradd"${ui.srAddOpen ? " open" : ""} ontoggle="ui.srAddOpen=this.open"><summary>Agregar tareas a la serie</summary>
      <div class="mrow">
        <div><label for="sr_addmode">Cómo</label><select id="sr_addmode" onchange="ui.srAddMode=this.value;srAddPreview()">
          <option value="count"${ui.srAddMode === "count" ? " selected" : ""}>Más tareas, ${esc(pat.label)}</option>
          <option value="until"${ui.srAddMode === "until" ? " selected" : ""}>Hasta una fecha, ${esc(pat.label)}</option>
          <option value="one"${ui.srAddMode === "one" ? " selected" : ""}>Una fecha suelta</option></select></div>
        <div class="srx" id="sr_addnwrap"><label for="sr_addn">Cuántas</label><input id="sr_addn" type="number" min="1" max="${REP_MAX}" value="${ui.srAddN}" oninput="ui.srAddN=this.value;srAddPreview()"></div>
        <div class="srx" id="sr_untilwrap"><label for="sr_until">Hasta (inclusive)</label><input id="sr_until" type="date" value="${escA(ui.srUntil || addDays(s.to, 7))}" onchange="ui.srUntil=this.value;srAddPreview()"></div>
        <div class="srx" id="sr_onewrap"><label for="sr_addone">Fecha</label><input id="sr_addone" type="date" value="${escA(ui.srAddOne || addDays(s.to, 1))}" onchange="ui.srAddOne=this.value;srAddPreview()"></div>
      </div>
      <div class="reppreview" id="sr_addpv" aria-live="polite"></div>
      <button type="button" class="btn srapply" id="sr_addbtn" onclick="seriesAdd()">Agregar</button>
    </details>`;
    h += `<details class="srmore"><summary>Más opciones</summary>`;
  } else {
    // sin fin es una sola tarea: sus minutos, hora y regla se cambian en su editor
    h += `<div class="serbanner" style="margin-top:12px"><span>Minutos, hora y cada cuánto se repite</span>
      <button type="button" class="btn sm" onclick="closeModal();openTaskEditor('${escA(s.tasks[0].id)}')">Editar la tarea</button></div>
      <details class="srmore" open><summary>Nombre y materia</summary>`;
  }
  h += `<label for="sr_title">Renombrar</label><input id="sr_title" value="${escA(s.title)}">
    <label for="sr_link">Materia / proyecto</label><select id="sr_link">${linkOptions(s.subjectId ? "s:" + s.subjectId : s.projectId ? "p:" + s.projectId : "")}</select>
    <div class="mrow" style="margin-top:10px">
      <div><label for="sr_prio">Prioridad</label><select id="sr_prio">${PRIO.map((p, i) => `<option value="${i}"${(s.tasks[0].prio ?? 1) === i ? " selected" : ""}>${p}</option>`).join("")}</select></div>
      <div style="display:flex;align-items:flex-end"><button class="btn" style="width:100%" onclick="seriesApplyMeta()">Guardar</button></div>
    </div></details>`;
  h += `<div class="mfoot">
    <button class="btn danger" onclick="seriesDelete(true)">${recur ? "Eliminar" : "Eliminar toda la serie"}</button>
    <div class="grow"></div>
    <button class="btn" onclick="closeModal()">Listo</button></div>`;
  return h;
}
function srToggle(id, on) { if (on) ui.srSel.add(id); else ui.srSel.delete(id); srPreview(); }
function srSelect(which) {
  const s = seriesByKey(ui.seriesKey); if (!s) return;
  ui.srSel = new Set(which === "all" ? s.tasks.map(t => t.id) : which === "pend" ? s.pend.map(t => t.id) : []);
  document.querySelectorAll("#sr_occ .occ").forEach(l => { l.querySelector("input").checked = ui.srSel.has(l.dataset.id); });
  srPreview();
}
function srSetVal(id, v) { const el = byId(id); if (!el) return; el.value = v; el.dispatchEvent(new Event("input")); }
/* Calcula qué va a pasar con la selección actual, sin tocar nada. */
function srPlan() {
  const s = seriesByKey(ui.seriesKey); if (!s || s.kind === "recur") return null;
  const act = ui.srAct, targets = s.tasks.filter(t => ui.srSel.has(t.id));
  const n = targets.length, nn = n + " tarea" + (n === 1 ? "" : "s");
  if (!n) return { error: "Elegí al menos una tarea de la lista." };
  const min = Math.round(parseFloat(ui.srMin)), days = parseInt(ui.srDays, 10);
  if (["add", "sub", "set"].includes(act) && !(min >= 0)) return { error: "Poné cuántos minutos." };
  if (["add", "sub"].includes(act) && min === 0) return { error: "Poné cuántos minutos." };
  if (act === "move" && !days) return { error: "Poné cuántos días (por ejemplo 2 o −1)." };
  if (act === "time" && ui.srTime && hmToMin(ui.srTime) == null) return { error: "La hora no es válida." };
  const changes = targets.map(t => {
    const c = { t, from: "", to: "" };
    if (act === "add" || act === "sub" || act === "set") {
      const v = act === "set" ? min : Math.max(0, (t.estMin || 0) + (act === "add" ? min : -min));
      c.from = fmtMin(t.estMin); c.to = fmtMin(v); c.apply = () => { t.estMin = v; };
    } else if (act === "move") {
      const d = addDays(t.date, days);
      c.from = fmtD(t.date); c.to = fmtD(d); c.apply = () => { t.date = d; };
    } else if (act === "time") {
      const v = ui.srTime || null;
      c.from = t.time || "sin hora"; c.to = v || "sin hora"; c.apply = () => { t.time = v; };
    } else { c.from = fmtD(t.date); }
    return c;
  });
  const what = act === "add" ? `sumar ${fmtMin(min)} a ${nn}` : act === "sub" ? `restar ${fmtMin(min)} a ${nn}`
    : act === "set" ? `dejar ${nn} en ${fmtMin(min)}` : act === "move" ? `mover ${nn} ${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"} ${days > 0 ? "más tarde" : "antes"}`
    : act === "time" ? (ui.srTime ? `poner ${nn} a las ${ui.srTime}` : `sacarle la hora a ${nn}`) : `borrar ${nn}`;
  const btn = act === "add" ? `Sumar ${fmtMin(min)}` : act === "sub" ? `Restar ${fmtMin(min)}` : act === "set" ? `Fijar en ${fmtMin(min)}`
    : act === "move" ? "Mover" : act === "time" ? "Cambiar hora" : "Borrar";
  const past = act === "add" ? `Sumaste ${fmtMin(min)} a ${nn}` : act === "sub" ? `Restaste ${fmtMin(min)} a ${nn}`
    : act === "set" ? `${n === 1 ? "Quedó" : "Quedaron"} ${nn} en ${fmtMin(min)}` : act === "move" ? `${n === 1 ? "Movida" : "Movidas"} ${nn}`
    : act === "time" ? `Hora cambiada en ${nn}` : `${n === 1 ? "Borrada" : "Borradas"} ${nn}`;
  return { s, act, targets, changes, what, past, btn: btn + (act === "move" || act === "del" ? " " : " a ") + nn, n };
}
function srPreview() {
  const pv = byId("sr_preview"), btn = byId("sr_apply"); if (!pv) return;
  const act = ui.srAct, show = (id, on) => { const el = byId(id); if (el) el.style.display = on ? "" : "none"; };
  const isMin = ["add", "sub", "set"].includes(act);
  show("sr_minwrap", isMin); show("sr_minchips", isMin);
  show("sr_dayswrap", act === "move"); show("sr_dayschips", act === "move");
  show("sr_timewrap", act === "time");
  const cnt = byId("sr_count"); if (cnt) cnt.textContent = ui.srSel.size + (ui.srSel.size === 1 ? " elegida" : " elegidas");
  document.querySelectorAll("#sr_occ .occ").forEach(l => l.classList.toggle("on", ui.srSel.has(l.dataset.id)));
  srAddPreview();
  const p = srPlan(); if (!p) return;
  pv.classList.toggle("bad", !!p.error);
  btn.disabled = !!p.error;
  btn.classList.toggle("danger", !p.error && p.act === "del");
  btn.classList.toggle("primary", !!p.error || p.act !== "del");
  if (p.error) { pv.textContent = p.error; btn.textContent = "Aplicar"; return; }
  const list = p.changes.slice(0, 8).map(c => `<span class="repdate">${p.act === "move" || p.act === "del" ? "" : fmtD(c.t.date) + ": "}${esc(c.from)}${p.act === "del" ? "" : " → <b>" + esc(c.to) + "</b>"}</span>`).join("")
    + (p.changes.length > 8 ? `<span class="repdate more">y ${p.changes.length - 8} más</span>` : "");
  pv.innerHTML = `<b>Vas a ${esc(p.what)}</b>${p.act === "del" ? " (podés deshacer)" : ""}: <div class="repdates">${list}</div>`;
  btn.textContent = p.btn;
}
function seriesBulkApply() {
  const p = srPlan(); if (!p || p.error) { if (p) toast(p.error); return; }
  let undo;
  if (p.act === "del") {
    const snap = p.targets.map(t => ({ t, i: state.tasks.indexOf(t) })).filter(x => x.i >= 0).sort((a, b) => b.i - a.i);
    snap.forEach(x => state.tasks.splice(x.i, 1));
    undo = () => { [...snap].reverse().forEach(x => state.tasks.splice(Math.min(x.i, state.tasks.length), 0, x.t)); };
  } else {
    const snap = p.targets.map(t => ({ t, estMin: t.estMin, date: t.date, time: t.time }));
    p.changes.forEach(c => c.apply());
    undo = () => { snap.forEach(x => { x.t.estMin = x.estMin; x.t.date = x.date; x.t.time = x.time; }); };
  }
  change(); render(); refreshSeriesModal();
  toast(p.past, () => { undo(); change(); render(); refreshSeriesModal(); });
}
/* C2b · El patrón de una serie se deduce de sus fechas (las series no guardan
   la regla): mensual si todas caen el mismo día del mes; si todas están a la
   misma distancia, esa distancia; si son ciertos días de la semana, esos días;
   si no, la distancia más común. Así funciona también con series viejas o
   con alguna fecha movida a mano. */
function seriesPattern(dates) {
  const ds = [...dates].filter(Boolean).sort();
  const gaps = [];
  for (let i = 1; i < ds.length; i++) gaps.push(Math.round((dToDate(ds[i]) - dToDate(ds[i - 1])) / 864e5));
  const pos = gaps.filter(g => g > 0);
  if (!pos.length) return { kind: "gap", n: 1, label: "todos los días" };
  const dom = new Set(ds.map(d => d.slice(8)));
  if (dom.size === 1 && pos.every(g => g >= 28)) return { kind: "month", label: "cada mes" }; // el 31 se saltea los meses cortos (C1)
  const gapLabel = n => n === 1 ? "todos los días" : n === 7 ? "cada semana" : n === 14 ? "cada 2 semanas" : "cada " + n + " días";
  if (new Set(pos).size === 1) return { kind: "gap", n: pos[0], label: gapLabel(pos[0]) };
  const wd = [...new Set(ds.map(d => dToDate(d).getDay()))];
  // ciertos días de la semana: entre la primera y la última están TODOS esos días (si no, es otra cosa, por ejemplo una fecha movida a mano)
  const span = Math.round((dToDate(ds[ds.length - 1]) - dToDate(ds[0])) / 864e5), have = new Set(ds);
  let full = span >= 6;
  for (let d = ds[0]; full && d <= ds[ds.length - 1]; d = addDays(d, 1)) if (wd.includes(dToDate(d).getDay()) && !have.has(d)) full = false;
  if (wd.length >= 2 && wd.length <= 6 && full) {
    const order = [1, 2, 3, 4, 5, 6, 0].filter(d => wd.includes(d)).map(d => DAYS[d]);
    return { kind: "wd", days: wd, label: "los " + order.slice(0, -1).join(", ") + " y " + order[order.length - 1] };
  }
  const cnt = {}; pos.forEach(g => cnt[g] = (cnt[g] || 0) + 1);
  const n = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || a - b)[0];
  return { kind: "gap", n, label: gapLabel(n) };
}
function patternNext(pat, d) {
  if (pat.kind === "month") {
    const x = dToDate(d), day = x.getDate();
    for (let k = 1; k < 13; k++) { const y = new Date(x.getFullYear(), x.getMonth() + k, day); if (y.getDate() === day) return iso(y); }
  }
  if (pat.kind === "wd") { let y = addDays(d, 1); while (!pat.days.includes(dToDate(y).getDay())) y = addDays(y, 1); return y; }
  return addDays(d, pat.n || 1);
}
function srAddPlan() {
  const s = seriesByKey(ui.seriesKey); if (!s || s.kind === "recur") return null;
  const have = new Set(s.tasks.map(t => t.date)), mode = ui.srAddMode, pat = seriesPattern(s.tasks.map(t => t.date));
  let dates = [];
  if (mode === "one") {
    const d = ui.srAddOne || addDays(s.to, 1);
    if (!d) return { error: "Elegí una fecha." };
    if (have.has(d)) return { error: "Ya hay una tarea de la serie el " + fmtD(d) + "." };
    dates = [d];
  } else if (mode === "until") {
    const until = ui.srUntil || addDays(s.to, 7);
    if (!until || until <= s.to) return { error: "Elegí una fecha posterior a la última (" + fmtD(s.to) + ")." };
    for (let d = patternNext(pat, s.to); d <= until && dates.length <= REP_MAX; d = patternNext(pat, d)) dates.push(d);
    if (!dates.length) return { error: "Siguiendo el patrón (" + pat.label + ") no cae ninguna fecha hasta el " + fmtD(until) + "." };
  } else {
    const n = parseInt(ui.srAddN, 10);
    if (!(n >= 1)) return { error: "Poné cuántas." };
    if (n > REP_MAX) return { error: "Máximo " + REP_MAX + "." };
    for (let d = s.to, i = 0; i < n; i++) { d = patternNext(pat, d); dates.push(d); }
  }
  if (dates.length > REP_MAX) return { error: "Son demasiadas (máximo " + REP_MAX + ")." };
  return { s, dates, pat };
}
function srAddPreview() {
  const pv = byId("sr_addpv"), btn = byId("sr_addbtn"); if (!pv) return;
  const mode = ui.srAddMode, show = (id, on) => { const el = byId(id); if (el) el.style.display = on ? "" : "none"; };
  show("sr_addnwrap", mode === "count"); show("sr_untilwrap", mode === "until"); show("sr_onewrap", mode === "one");
  const p = srAddPlan(); if (!p) return;
  pv.classList.toggle("bad", !!p.error); btn.disabled = !!p.error;
  if (p.error) { pv.textContent = p.error; btn.textContent = "Agregar"; return; }
  const n = p.dates.length, nn = n + " tarea" + (n === 1 ? "" : "s");
  const list = p.dates.slice(0, 10).map(d => `<span class="repdate">${fmtD(d)}</span>`).join("") + (n > 10 ? `<span class="repdate more">y ${n - 10} más</span>` : "");
  pv.innerHTML = `<b>Vas a agregar ${nn}</b> de ${fmtMin(p.s.tasks[p.s.tasks.length - 1].estMin)}: <div class="repdates">${list}</div>`;
  btn.textContent = "Agregar " + nn;
}
function seriesAdd() {
  const p = srAddPlan(); if (!p || p.error) { if (p) toast(p.error); return; }
  const base = p.s.tasks[p.s.tasks.length - 1], ids = [];
  for (const d of p.dates) ids.push(quickAddTask({
    title: base.title, desc: base.desc, subjectId: base.subjectId, projectId: base.projectId,
    evalId: base.evalId, date: d, estMin: base.estMin, type: base.type, prio: base.prio, tags: [...(base.tags || [])], seriesId: base.seriesId, time: base.time || null
  }).id);
  ui.srAddOne = ""; ui.srUntil = "";
  render(); refreshSeriesModal();
  toast((ids.length === 1 ? "Agregada 1 tarea" : "Agregadas " + ids.length + " tareas") + " a la serie",
    () => { state.tasks = state.tasks.filter(t => !ids.includes(t.id)); change(); render(); refreshSeriesModal(); });
}
/* C2b · Editar una sola ocurrencia, sin tocar el resto. Cada cambio se aplica
   al instante y tiene deshacer. */
function srEdit(id) { ui.srOpen = ui.srOpen === id ? null : id; refreshSeriesModal(); }
function srOne(id, what, v) {
  const t = taskById(id); if (!t) return;
  const snap = { estMin: t.estMin, date: t.date, time: t.time }, i = state.tasks.indexOf(t);
  let msg;
  if (what === "del") {
    state.tasks.splice(i, 1); ui.srSel.delete(id); ui.srOpen = null;
    change(); render(); refreshSeriesModal();
    toast("Quitada la del " + fmtD(t.date), () => { state.tasks.splice(Math.min(i, state.tasks.length), 0, t); change(); render(); refreshSeriesModal(); });
    return;
  }
  if (what === "add" || what === "min") {
    const m = what === "add" ? Math.max(0, (t.estMin || 0) + v) : Math.max(0, Math.round(parseFloat(v)));
    if (!(m >= 0)) { refreshSeriesModal(); return; }
    t.estMin = m; msg = fmtD(t.date) + ": " + fmtMin(m);
  } else if (what === "date") {
    if (!v) { refreshSeriesModal(); return; }
    t.date = v; msg = "Movida al " + fmtD(v);
  } else if (what === "time") {
    t.time = v && hmToMin(v) != null ? v : null; msg = fmtD(t.date) + (t.time ? " a las " + t.time : ": sin hora");
  }
  change(); render(); refreshSeriesModal();
  toast(msg, () => { Object.assign(t, snap); change(); render(); refreshSeriesModal(); });
}
function seriesApplyMeta() {
  const s = seriesByKey(ui.seriesKey); if (!s) return;
  const title = byId("sr_title").value.trim();
  const link = byId("sr_link").value;
  const prio = parseInt(byId("sr_prio").value);
  if (!title) { toast("El título no puede quedar vacío"); return; }
  s.tasks.forEach(t => {
    t.title = title;
    t.subjectId = link.startsWith("s:") ? link.slice(2) : null;
    t.projectId = link.startsWith("p:") ? link.slice(2) : null;
    t.prio = prio;
  });
  change(); closeModal(); render(); toast("Serie actualizada (" + s.tasks.length + " tareas)");
}
function seriesDelete(all) {
  const s = seriesByKey(ui.seriesKey); if (!s) return;
  const victims = all ? s.tasks : s.pend;
  if (!victims.length) { toast("No hay tareas para eliminar"); return; }
  doubleDelete(victims.length + " tareas de “" + s.title.slice(0, 30) + "”", () => {
    const snap = victims.map(t => ({ t, i: state.tasks.indexOf(t) })).filter(x => x.i >= 0).sort((a, b) => b.i - a.i);
    snap.forEach(x => state.tasks.splice(x.i, 1));
    change(); closeModal(); render();
    toast(snap.length + " tareas eliminadas", () => { [...snap].reverse().forEach(x => state.tasks.splice(Math.min(x.i, state.tasks.length), 0, x.t)); change(); render(); });
  });
}

/* ========================= ROUTER / SIDEBAR ========================= */
const VIEWS = [
  ["home", "Inicio"], ["today", "Hoy"], ["calendar", "Calendario"], ["week", "Semana"],
  ["subjects", "Materias"], ["evals", "Parciales y finales"], ["projects", "Proyectos"], ["series", "Series"],
  ["plans", "Planes de estudio"], ["notes", "Notas"], ["habits", "Hábitos"],
  ["stats", "Progreso"], ["history", "Historial"], ["backups", "Copias de seguridad"], ["config", "Configuración"]
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
/* Menú lateral (A4b): tres grupos según para qué entrás a la app, y Configuración
   aparte. Historial y Copias de seguridad viven dentro de Configuración (se usan
   poco). Las vistas que no están en el menú marcan a su "padre". */
const NAV = [
  ["Planificar", ["home", "today", "week", "calendar", "list"]],
  ["Facultad", ["subjects", "evals", "projects"]],
  ["Estudio", ["series", "plans", "notes", "habits", "stats"]]
];
const NAV_PARENT = { subject: "subjects", eval: "evals", project: "projects", history: "config", backups: "config" };
function renderSidebar() {
  const sb = byId("sidebar");
  const cur = NAV_PARENT[route.view] || route.view;
  const label = v => v === "list" ? "Lista completa" : (VIEWS.find(x => x[0] === v) || [v, v])[1];
  const item = v => `<a href="#/${v}" class="${cur === v ? "on" : ""}">${label(v)}</a>`;
  sb.innerHTML = NAV.map(([sec, vs]) => `<div class="sec">${sec}</div>` + vs.map(item).join("")).join("") +
    '<div class="hr" style="margin:10px 6px"></div>' + item("config") +
    '<div style="padding:14px 10px" class="tiny">Aula v' + APP_VERSION + "</div>";
}
const backToConfig = `<button class="backlink" onclick="go('config')">‹ Configuración</button>`;
function renderTop() {
  const today = todayISO(), d = dToDate(today);
  const late = today !== iso(new Date()); // pasada la medianoche, antes de que termine tu día
  const el = byId("topDate"); if (el) el.textContent = capitalize(DAYSL[d.getDay()]) + " " + d.getDate() + " de " + MESL[d.getMonth()] + (late ? " · tu día sigue hasta las " + state.settings.dayEnd : "");
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
  ui.selList = [];           // orden visual de las filas, para el Shift+clic
  ui.serMap = null;          // posiciones "3 de 5" de las series (C3), se arma una vez por render
  renderSidebar(); renderTop();
  const v = byId("view");
  const map = {
    home: viewHome, today: viewToday, calendar: viewCalendar, week: viewWeek, list: viewList,
    subjects: viewSubjects, subject: viewSubjectDetail, evals: viewEvals, eval: viewEvalDetail,
    projects: viewProjects, project: viewProjectDetail, plans: viewPlans, notes: viewNotes, series: viewSeries,
    habits: viewHabits, stats: viewStats, history: viewHistory,
    backups: viewBackups, config: viewConfig
  };
  v.innerHTML = (map[route.view] || viewHome)();
  if (route.view === "backups") fillBackupsList();
  renderSelBar();
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
  const srt = !!opts.sortable && !t.time; // las que tienen hora no se reordenan a mano
  const dd = opts.sortable || opts.date ? ` data-date="${date}"` : !t.recur && t.date ? ` data-date="${t.date}"` : "";
  if (!opts.noSel) { ui.selList = ui.selList || []; ui.selList.push(t.id); }
  return `<div class="task ${done ? "done" : ""} ${isSel(t.id) ? "sel" : ""}" data-id="${t.id}"${dd} onclick="taskClick(event,'${t.id}')">
    ${srt ? `<span class="drag" title="Arrastrá para ordenar o pasar a otro día" aria-hidden="true" onclick="event.stopPropagation()">⣿</span>` : opts.sortable ? '<span class="drag" aria-hidden="true" style="visibility:hidden">⣿</span>' : ""}
    <div class="cb ${done ? "on" : ""}" role="checkbox" aria-checked="${done}" tabindex="0" title="${done ? "Desmarcar" : "Completar"}"
      onclick="event.stopPropagation();toggleTask('${t.id}','${date}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();toggleTask('${t.id}','${date}')}">${done ? "✓" : ""}</div>
    <div class="tinfo">
      <div class="tt">${t.time ? `<span class="ttime">${esc(fmtTime(t.time))}</span>` : ""}${esc(t.title)}${late ? ' <span class="pill bad">atrasada</span>' : ""}${t.status === "prog" ? ' <span class="pill acc">en progreso</span>' : ""}${t.status === "post" ? ' <span class="pill warn">pospuesta</span>' : ""}</div>
      <div class="tmeta">
        ${o ? `<span class="tag" style="background:${o.color}1c;color:${o.color};border:1px solid ${o.color}40">${esc(o.name)}</span>` : ""}
        ${t.estMin ? `<span class="mins">${fmtMin(t.estMin)}</span>` : ""}
        ${t.prio === 2 ? '<span class="prio2">! alta</span>' : t.prio === 0 ? '<span class="prio0">baja</span>' : ""}
        ${dateBit} ${sub}
        ${(sp => sp ? `<span class="tiny serpos" title="Parte de una serie: ${sp.i} de ${sp.n}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>${sp.i}/${sp.n}</span>` : "")(seriesPos(t))}
        ${t.comments && t.comments.length ? `<span class="tiny cmtcount" title="${t.comments.length} comentario${t.comments.length > 1 ? "s" : ""}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>${t.comments.length}</span>` : ""}
        ${ev && opts.showEval !== false ? `<span class="tiny">→ ${esc(ev.name.slice(0, 26))}</span>` : ""}
        ${(t.tags || []).map(x => `<span class="tiny">#${esc(x)}</span>`).join(" ")}
      </div>
    </div>
    <div class="tactions" onclick="event.stopPropagation()">
      ${srt ? `<button title="Subir en el orden del día" onclick="moveTaskOrder('${t.id}',-1,'${date}')">↑</button>
      <button title="Bajar en el orden del día" onclick="moveTaskOrder('${t.id}',1,'${date}')">↓</button>` : ""}
      ${canToday ? `<button title="Asignar a hoy" onclick="assignToday('${t.id}')">Hoy</button>` : ""}
      ${!t.recur ? `<button title="Mover a otro día" onclick="openMoveSheet('${t.id}')">Mover…</button>` : ""}
      <button title="Editar" onclick="openTaskEditor('${t.id}')">Editar</button>
      <button title="Eliminar definitivamente" style="color:var(--bad)" onclick="deleteTask('${t.id}')">×</button>
    </div>
  </div>`;
}

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
    <button class="btn" onclick="openManualSession()">Registrar tiempo</button>
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

  h += `<div class="card dropzone" data-dropdate="${today}"><h3>Para hoy<div class="grow"></div><span class="tiny">${dayTasks.length ? fmtMin(dayTasks.reduce((a, t) => a + (t.estMin || 0), 0)) + " en total" : ""}</span></h3>`;
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
  if (first) items.push(`Siguiente sugerida: <b>${esc(first.title)}</b>${first.estMin ? " (" + fmtMin(first.estMin) + ")" : ""}. <button class="btn sm" onclick="event.stopPropagation();openTaskEditor('${first.id}')">Abrir</button>`);
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
    <button class="btn ${ui.selMode ? "primary" : ""}" onclick="toggleSelMode()" title="Elegir varias tareas (o usá Ctrl+clic y Shift+clic)">Seleccionar</button>
    <button class="btn primary" onclick="openQuickTask('${today}')">Nueva tarea para hoy</button></div>`;
  if (od.length) h += `<div class="card"><h3>Atrasadas</h3>${od.map(t => taskRow(t, { showDate: true })).join("")}</div>`;
  const hint = touchUI() ? "mantené apretada una tarea para moverla" : "arrastrá ⣿ para ordenar o pasar a mañana";
  h += `<div class="card dropzone" data-dropdate="${today}"><h3>Programadas para hoy</h3><p class="tiny zonehint">${hint}</p>${dayTasks.length ? dayTasks.map(t => taskRow(t, { sortable: true })).join("") : '<div class="empty">Sin tareas programadas.</div>'}</div>`;
  if (flex.length) h += `<div class="card"><h3>Flexibles (vencen pronto)</h3>${flex.map(t => taskRow(t, { showDate: true })).join("")}</div>`;
  const tom = addDays(today, 1);
  const tomTasks = tasksOn(tom);
  h += `<div class="card dropzone" data-dropdate="${tom}"><h3>Mañana<span class="sub">${fmtD(tom)}</span><div class="grow"></div>${tomTasks.length ? `<span class="tiny">${fmtMin(tomTasks.reduce((a, t) => a + (t.estMin || 0), 0))}</span>` : ""}</h3>${tomTasks.length ? tomTasks.map(t => taskRow(t, { date: tom, sortable: true })).join("") : `<div class="empty">Nada para mañana todavía. ${touchUI() ? "Mantené apretada una tarea y arrastrala hasta acá." : "Arrastrá una tarea hasta acá."}</div>`}</div>`;
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
      ${evs.map(e => `<div class="wtask" style="background:var(--bad-soft);color:var(--bad);font-weight:700" onclick="go('eval','${e.id}')">${e.time ? `<span class="ttime">${esc(fmtTime(e.time))}</span>` : ""}${esc(e.name.slice(0, 30))}</div>`).join("")}
      ${ts.map(t => { const o = ownerOf(t); return `<div class="wtask ${isDoneOn(t, d) ? "done" : ""}" onclick="openTaskEditor('${t.id}')"><span class="dotc" style="background:${o ? o.color : "var(--tx3)"}"></span>${t.time ? `<span class="ttime">${esc(fmtTime(t.time))}</span>` : ""}${esc(t.title.slice(0, 34))}</div>`; }).join("")}
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
  // D1 · día elegido (en el celu se ve su lista abajo); por defecto hoy, o el 1 si mirás otro mes
  if (!ui.calDay || ui.calDay.slice(0, 7) !== ui.calMonth) ui.calDay = today.slice(0, 7) === ui.calMonth ? today : ui.calMonth + "-01";
  const sel = ui.calDay;
  let h = `<div class="vhead calhead"><h2>Calendario</h2><span class="sub">${capitalize(MESL[M - 1])} ${Y}</span><div class="grow"></div>
    <button class="btn sm calnav" aria-label="Mes anterior" onclick="calShift(-1)">‹</button>
    <button class="btn sm calnav" onclick="ui.calMonth='${today.slice(0, 7)}';ui.calDay='${today}';render()">Hoy</button>
    <button class="btn sm calnav" aria-label="Mes siguiente" onclick="calShift(1)">›</button></div>`;
  h += `<div class="cal" ontouchstart="calSwipe(event,0)" ontouchend="calSwipe(event,1)">`;
  for (let i = 0; i < 7; i++) h += `<div class="dow">${DAYS[(ws + i) % 7]}</div>`;
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const dISO = iso(d);
    const inMonth = d.getMonth() === M - 1;
    const ts = tasksOn(dISO);
    const evs = state.evals.filter(e => e.date === dISO);
    const habs = state.habits.filter(hb => habitDueOn(hb, dISO) && hb.checks && hb.checks[dISO]);
    // D1b · en desktop entran 3 renglones por celda: parciales primero (hasta 2), después tareas; el resto, "+N más"
    const items = [];
    const evShow = evs.slice(0, 2), tShow = ts.slice(0, Math.max(0, 3 - evShow.length));
    for (const e of evShow) items.push(`<div class="ev exam" onclick="event.stopPropagation();go('eval','${e.id}')" title="${escA(e.name)}">${e.time ? `<b>${esc(fmtTime(e.time))}</b> ` : ""}${esc(e.name)}</div>`);
    for (const t of tShow) {
      const o = ownerOf(t);
      items.push(`<div class="ev" style="background:${o ? o.color + "1c" : "var(--card2)"};color:${o ? o.color : "var(--tx2)"};${isDoneOn(t, dISO) ? "text-decoration:line-through;opacity:.6" : ""}" onclick="event.stopPropagation();openTaskEditor('${t.id}')" title="${escA(t.title)}">${t.time ? `<b>${esc(fmtTime(t.time))}</b> ` : ""}${esc(t.title)}</div>`);
    }
    const moreN = evs.length + ts.length - evShow.length - tShow.length;
    // "+N más" y los hábitos comparten un renglón para que todas las celdas midan lo mismo
    if (moreN > 0 || habs.length) items.push(`<div class="cfoot">${moreN > 0 ? `<span class="more" title="Ver todo el ${escA(fmtD(dISO))}">+${moreN} más</span>` : ""}${habs.length ? `<span class="more" style="color:var(--ok)">${habs.length} hábito${habs.length > 1 ? "s" : ""} ✓</span>` : ""}</div>`);
    const dayMin = ts.reduce((a, t) => a + (t.estMin || 0), 0);
    // D1 · en el celu: puntos de colores (parcial en rojo primero, después las tareas por materia)
    const dots = evs.map(() => `<i style="background:var(--bad)"></i>`).concat(ts.map(t => { const o = ownerOf(t); return `<i style="background:${o ? o.color : "var(--tx3)"}${isDoneOn(t, dISO) ? ";opacity:.35" : ""}"></i>`; })).slice(0, 4).join("");
    h += `<div class="day ${inMonth ? "" : "out"} ${dISO === today ? "today" : ""} ${dISO === sel ? "selday" : ""} ${evs.length ? "hasev" : ""}" data-date="${dISO}" onclick="calTap('${dISO}')" title="Ver el resumen del ${escA(fmtD(dISO))}">
      <div class="dnum"><span class="dn">${d.getDate()}</span>${dayMin ? `<span class="dmin">${fmtMin(dayMin)}</span>` : ""}<button class="calplus" aria-label="Nueva tarea el ${escA(fmtD(dISO))}" title="Nueva tarea el ${escA(fmtD(dISO))}" onclick="event.stopPropagation();openQuickTask('${dISO}')">+</button></div>${items.join("")}<div class="cdots">${dots}</div></div>`;
  }
  h += "</div><p class='tiny calhint' style='margin-top:8px'>Clic en un día para ver su resumen · clic en una tarea o parcial para abrirlo · pasá por encima de un día y tocá + para crear una tarea ahí.</p>";
  h += calDayList(sel);
  return h;
}

/* D1 · En el celu (como Calendario de iOS) tocar un día lo elige y muestra su
   lista abajo; en desktop abre el resumen del día como antes. */
const calIsPhone = () => window.matchMedia("(max-width:720px)").matches;
function calTap(d) {
  if (!calIsPhone()) { openDayPreview(d); return; }
  ui.calDay = d; ui.calMonth = d.slice(0, 7); render();
}
function calShift(n) {
  const [Y, M] = ui.calMonth.split("-").map(Number);
  ui.calMonth = iso(new Date(Y, M - 1 + n, 1)).slice(0, 7); ui.calDay = null; render();
}
function calSwipe(e, end) {
  const p = e.changedTouches && e.changedTouches[0]; if (!p) return;
  if (!end) { ui.calTouch = { x: p.clientX, y: p.clientY }; return; }
  const s = ui.calTouch; ui.calTouch = null; if (!s) return;
  const dx = p.clientX - s.x, dy = p.clientY - s.y;
  if (Math.abs(dx) > 60 && Math.abs(dy) < Math.abs(dx) * 0.6) calShift(dx < 0 ? 1 : -1);
}
function calDayList(d) {
  const ts = tasksOn(d), evs = state.evals.filter(e => e.date === d);
  const evRow = e => `<div class="task calev" onclick="go('eval','${e.id}')"><span class="calevdot"></span><div class="tinfo"><div class="tt">${e.time ? `<span class="ttime">${esc(fmtTime(e.time))}</span>` : ""}${esc(e.name)}</div><div class="tmeta"><span class="tiny">parcial / final</span></div></div></div>`;
  const tot = ts.reduce((a, t) => a + (t.estMin || 0), 0);
  return `<div class="card calday" id="calday">
    <h3>${capitalize(fmtD(d))}${d === todayISO() ? ' <span class="sub">hoy</span>' : ""}<div class="grow"></div>${tot ? `<span class="tiny">${fmtMin(tot)}</span>` : ""}</h3>
    ${evs.map(evRow).join("")}${ts.map(t => taskRow(t, { date: d, noSel: true })).join("")}
    ${!evs.length && !ts.length ? '<div class="empty" style="padding:14px 0">Nada para este día.</div>' : ""}
    <button class="btn calnew" onclick="openQuickTask('${d}')">+ Tarea para el ${esc(fmtD(d))}</button></div>`;
}

/* ========================== VISTA: LISTA ========================== */
/* Día en que se completó. Datos viejos pueden no tener doneAt: se usa su fecha. */
function doneDay(t) { return t.doneAt || t.date || t.due || t.createdAt || ""; }
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
  // B5 · las hechas hace mucho se ocultan solas (no se borran: siguen en Historial y estadísticas)
  const keep = state.settings.doneKeepDays | 0;
  let oldDone = 0;
  if (state.settings.showDone && keep > 0 && !f.status) {
    const cut = addDays(todayISO(), -keep);
    const isOld = t => t.status === "done" && doneDay(t) < cut;
    oldDone = list.filter(isOld).length;
    if (!ui.showOldDone) list = list.filter(t => !isOld(t));
  }
  list.sort((a, b) => ((a.date || a.due || "9999") + a.title).localeCompare((b.date || b.due || "9999") + b.title));
  const totMin = list.filter(t => t.status !== "done").reduce((a, t) => a + (t.estMin || 0), 0);
  let h = `<div class="vhead"><h2>Lista completa</h2><span class="sub">${list.length} tareas · ${fmtMin(totMin)} pendientes</span>
    <div class="grow"></div>
    <button class="btn ${ui.selMode ? "primary" : ""}" onclick="toggleSelMode()" title="Elegir varias tareas (o usá Ctrl+clic y Shift+clic)">Seleccionar</button>
    <button class="btn" onclick="selectAllVisible()">Todas</button>
    <button class="btn primary" onclick="openQuickTask()">Nueva tarea</button></div>`;
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
  if (oldDone) h += `<p class="oldDone tiny">${ui.showOldDone ? `Mostrando ${oldDone} hecha${oldDone > 1 ? "s" : ""} hace más de ${keep} días.` : `${oldDone} tarea${oldDone > 1 ? "s" : ""} hecha${oldDone > 1 ? "s" : ""} hace más de ${keep} días no se muestra${oldDone > 1 ? "n" : ""}.`}
    <button class="btn sm ghost" onclick="ui.showOldDone=!ui.showOldDone;render()">${ui.showOldDone ? "Ocultar hechas antiguas" : "Mostrar hechas antiguas"}</button></p>`;
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
    <div class="card" style="margin:0"><div class="statnum">${fmtMin(real)}</div><div class="statlab">horas estudiadas · ${fmtMin(weekMin)} esta semana</div></div>
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
    <div class="vacts"><button class="btn sm" onclick="openNoteEditor(null,'e:${e.id}')">Nota</button>
    <button class="btn sm" onclick="openEvalEditor('${e.id}')">Editar</button>
    <button class="btn sm danger" onclick="deleteEval('${e.id}')">Eliminar</button></div></div>`;
  // X3 · un número grande arriba (días que faltan + preparación) y el resto en una fila compacta
  const pc = prep === null ? "var(--tx3)" : prep < 40 ? "var(--bad)" : prep < 70 ? "var(--warn)" : "var(--ok)";
  const when = esc(fmtD(e.date)) + (e.time ? " · " + esc(fmtTime(e.time)) : "");
  h += `<div class="card evhero">
    <div class="evleft">${n < 0 ? `<div class="evdays" style="color:var(--tx3)">—</div><div class="evdl">ya pasó · ${when}</div>`
      : n === 0 ? `<div class="evdays" style="color:var(--bad)">Hoy</div><div class="evdl">${when}</div>`
      : `<div class="evdays" style="color:${n <= 2 ? "var(--bad)" : "var(--tx)"}">${n}</div><div class="evdl">${n === 1 ? "día" : "días"} · ${when}</div>`}</div>
    <div class="evright"><div class="evdl">preparación</div><div class="evprep" style="color:${pc}">${prep === null ? "—" : prep + "%"}</div>
      ${prep !== null ? `<div class="pbar"><i style="width:${prep}%;background:${pc}"></i></div>` : `<div class="evdl">cargá temas o un plan</div>`}</div>
  </div>
  <div class="card evstats">
    <div class="evstat"><span class="evsn">${fmtMin(real)}</span><span class="evsl">estudiado</span></div>
    <div class="evstat"><span class="evsn">${topicsDone}/${e.topics.length}</span><span class="evsl">temas</span></div>
    <div class="evstat"><span class="evsn">${planDone.length}/${plan.length}</span><span class="evsl">tareas${planLate.length ? ` · <b style="color:var(--bad)">${planLate.length} atras.</b>` : ""}</span></div>
    <div class="evstat"><span class="evsn">${simul}</span><span class="evsl">simulacros</span></div>
  </div>
  ${pendMin ? `<p class="tiny" style="margin:-4px 2px 12px">Te quedan ${fmtMin(pendMin)} estimados de tareas pendientes.</p>` : ""}`;
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
  h += `<div class="mrow tpadd" style="margin-top:8px">
      <div class="tpname" style="flex:2"><input id="tp_new" placeholder="Nuevo tema…" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:8px"></div>
      <div><select id="tp_diff" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:8px"><option value="1">Fácil</option><option value="2" selected>Media</option><option value="3">Difícil</option></select></div>
      <div><input id="tp_min" type="number" value="90" min="10" step="10" title="Minutos estimados" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:8px"></div>
      <button class="btn" onclick="addTopic('${e.id}')">Agregar</button></div></div>`;
  h += `<div class="card"><h3 class="evplanh"><span class="evplant">Tareas y plan de estudio</span><div class="grow"></div>
    <button class="btn sm" onclick="openQuickTaskForEval('${e.id}')">+ Tarea</button>
    ${plan.length ? `<button class="btn sm" title="Replanificar las tareas pendientes" onclick="replanPending('${e.id}')">Replanificar</button>` : ""}
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
/* ============================ D2 · PROGRESO ============================
   Pocos gráficos, cada uno responde una pregunta real de un estudiante:
   ¿cuánto estudié esta semana? ¿voy al día? ¿llego a los parciales?
   ¿a qué materia le dedico tiempo? ¿soy constante? Lo viejo queda en
   "Estadísticas detalladas" (#/stats/detalle). */
const EV_CLOSED = ["rendido", "aprob", "desaprob"];
function progressData() {
  const today = todayISO(), ws = state.settings.weekStart;
  const byDate = {};
  for (const s of state.sessions) byDate[s.date] = (byDate[s.date] || 0) + (s.min || 0);
  const w0 = weekStartOf(today, ws), lw0 = addDays(w0, -7);
  const idx = Math.round((dToDate(today) - dToDate(w0)) / 864e5);
  const days = [];
  for (let i = 0; i < 7; i++) { const d = addDays(w0, i); days.push({ d, min: byDate[d] || 0, future: d > today, today: d === today }); }
  let lastSame = 0, lastFull = 0;
  for (let i = 0; i < 7; i++) { const m = byDate[addDays(lw0, i)] || 0; lastFull += m; if (i <= idx) lastSame += m; }
  const week = { days, min: days.filter(x => !x.future).reduce((a, x) => a + x.min, 0), lastSame, lastFull };
  // ¿voy al día? atrasadas + tareas de esta semana (hasta hoy) hechas
  const od = overdueTasks();
  let planned = 0, done = 0;
  for (let i = 0; i <= idx; i++) { const d = addDays(w0, i); for (const t of tasksOn(d)) { planned++; if (isDoneOn(t, d)) done++; } }
  // parciales por delante
  const exams = state.evals.filter(e => e.date >= today && !EV_CLOSED.includes(e.status))
    .sort((a, b) => a.date < b.date ? -1 : 1).slice(0, 4)
    .map(e => ({ e, days: daysTo(e.date), prep: evalPrep(e), min: evalRealMin(e.id) }));
  // por materia: últimos 14 días, con su próximo parcial
  const from14 = addDays(today, -13);
  const subjects = activeSubjects().map(s => {
    const min = state.sessions.filter(x => x.subjectId === s.id && x.date >= from14 && x.date <= today).reduce((a, x) => a + (x.min || 0), 0);
    const ne = state.evals.filter(e => e.subjectId === s.id && e.date >= today && !EV_CLOSED.includes(e.status)).sort((a, b) => a.date < b.date ? -1 : 1)[0];
    return { s, min, next: ne || null, nextDays: ne ? daysTo(ne.date) : null };
  }).filter(x => x.min > 0 || (x.next && x.nextDays <= 30))
    .sort((a, b) => (a.nextDays ?? 999) - (b.nextDays ?? 999) || b.min - a.min);
  // constancia
  let streak = 0; { let d = today; if (!byDate[d]) d = addDays(d, -1); while (byDate[d]) { streak++; d = addDays(d, -1); } }
  const last28 = []; for (let i = 27; i >= 0; i--) last28.push(!!byDate[addDays(today, -i)]);
  return { week, overdue: od.length, overdueMin: od.reduce((a, t) => a + (t.estMin || 0), 0), planned, done, exams, subjects, streak, last28 };
}
function viewStats() {
  if (route.id === "detalle") return viewStatsDetail();
  const p = progressData();
  const pctCol = v => v == null ? "var(--tx3)" : v < 40 ? "var(--bad)" : v < 70 ? "var(--warn)" : "var(--ok)";
  let h = `<div class="vhead"><h2>Progreso</h2><span class="sub">${esc(capitalize(fmtD(todayISO())))}</span></div><div class="pg">`;
  // 1 · esta semana
  const W = p.week, diff = W.min - W.lastSame, maxD = Math.max(60, ...W.days.map(x => x.min));
  const sub = !W.min ? "Todavía no registraste tiempo esta semana."
    : !W.lastSame ? "La semana pasada a esta altura no tenías nada registrado."
    : diff === 0 ? "Igual que a esta altura de la semana pasada."
    : `<b style="color:${diff > 0 ? "var(--ok)" : "var(--warn)"}">${fmtMin(Math.abs(diff))} ${diff > 0 ? "más" : "menos"}</b> que a esta altura de la semana pasada.`;
  h += `<section class="card pg-card pg-week"><div class="pg-q">¿Cuánto estudié esta semana?</div>
    <div class="pg-big">${fmtMin(W.min)}</div><div class="pg-sub">${sub}</div>
    <div class="pg-bars">${W.days.map((x, i) => `<div class="pg-bcol${x.today ? " today" : ""}${x.future ? " fut" : ""}" title="${escA(fmtD(x.d))}: ${fmtMin(x.min)}">
      <div class="pg-btrack"><i style="height:${x.min ? Math.max(4, Math.round(x.min / maxD * 100)) : 0}%;animation-delay:${i * 30}ms"></i></div>
      <span>${"DLMXJVS"[dToDate(x.d).getDay()]}</span></div>`).join("")}</div></section>`;
  // 2 · ¿voy al día?
  h += `<section class="card pg-card pg-late"><div class="pg-q">¿Voy al día?</div>
    ${p.overdue ? `<div class="pg-big" style="color:var(--bad)">${p.overdue}</div><div class="pg-sub">tarea${p.overdue > 1 ? "s" : ""} atrasada${p.overdue > 1 ? "s" : ""}${p.overdueMin ? ` · ${fmtMin(p.overdueMin)} de trabajo` : ""}</div>
      <button class="btn sm" onclick="go('today')">Ver atrasadas</button>`
    : `<div class="pg-big" style="color:var(--ok)">Al día</div><div class="pg-sub">No tenés tareas atrasadas.</div>`}
    ${p.planned ? `<div class="pg-mini"><div class="pg-row"><span>Tareas hechas esta semana</span><b>${p.done} de ${p.planned}</b></div>
      <div class="pbar"><i style="width:${Math.round(p.done / p.planned * 100)}%;background:var(--ok)"></i></div></div>` : ""}</section>`;
  // 3 · parciales
  h += `<section class="card pg-card pg-exams"><div class="pg-q">¿Llego a los parciales?</div>
    ${p.exams.length ? p.exams.map(x => { const o = ownerOf(x.e); return `<div class="pg-exam" onclick="go('eval','${x.e.id}')">
      <div class="pg-days" style="color:${x.days <= 7 ? "var(--bad)" : "var(--tx)"}"><b>${x.days === 0 ? "Hoy" : x.days}</b>${x.days ? ` <span>${x.days === 1 ? "día" : "días"}</span>` : ""}</div>
      <div class="pg-einfo"><div class="pg-ename">${o ? `<i class="pg-sdot" style="background:${o.color}"></i>` : ""}${esc(x.e.name)}</div>
        <div class="pg-row tiny"><span>${x.prep == null ? "sin temas ni plan para medir" : `preparado ${x.prep}%`}</span><span>${x.min ? fmtMin(x.min) + " estudiado" : ""}</span></div>
        ${x.prep != null ? `<div class="pbar"><i style="width:${x.prep}%;background:${pctCol(x.prep)}"></i></div>` : ""}</div></div>`; }).join("")
    : `<div class="pg-sub">No tenés parciales por delante.</div>`}</section>`;
  // 4 · por materia
  const maxS = Math.max(1, ...p.subjects.map(x => x.min));
  h += `<section class="card pg-card pg-subs"><div class="pg-q">¿A qué le dedico tiempo? <span class="tiny">últimos 14 días</span></div>
    ${p.subjects.length ? p.subjects.map(x => `<div class="pg-srow" onclick="go('subject','${x.s.id}')">
      <div class="pg-row"><span class="pg-sname"><i class="pg-sdot" style="background:${x.s.color}"></i>${esc(x.s.name)}</span><b>${x.min ? fmtMin(x.min) : "—"}</b></div>
      <div class="pg-strack"><i style="width:${Math.round(x.min / maxS * 100)}%;background:${x.s.color}"></i></div>
      ${x.next ? `<div class="tiny" style="color:${x.nextDays <= 14 && x.min < 120 ? "var(--warn)" : "var(--tx3)"}">${esc(x.next.name)} en ${x.nextDays} día${x.nextDays === 1 ? "" : "s"}${x.nextDays <= 14 && x.min < 120 ? " · le estás dando poco" : ""}</div>` : ""}</div>`).join("")
    : `<div class="pg-sub">Cuando registres tiempo de estudio, acá vas a ver cuánto le das a cada materia.</div>`}</section>`;
  // 5 · constancia
  h += `<section class="card pg-card pg-streak"><div class="pg-q">¿Soy constante?</div>
    <div class="pg-big">${p.streak} día${p.streak === 1 ? "" : "s"}</div><div class="pg-sub">${p.streak ? "seguidos estudiando" : "Hoy es buen día para arrancar una racha."}</div>
    <div class="pg-dots" aria-label="Últimos 28 días">${p.last28.map((on, i) => `<i class="pg-dot${on ? " on" : ""}${i === 27 ? " now" : ""}"></i>`).join("")}</div>
    <div class="pg-row tiny"><span>hace 4 semanas</span><span>hoy</span></div></section>`;
  h += `</div><p style="margin-top:14px"><a class="tiny" href="#/stats/detalle">Estadísticas detalladas, informe y CSV ›</a></p>`;
  return h;
}
function viewStatsDetail() {
  const R = getStatsRange();
  const st = computeStats(R);
  const C = chartColors();
  const dTot = st.total - st.prevTotal;
  const tab = (k, l) => `<button class="btn sm ${(ui.statsRange || "month") === k ? "primary" : ""}" onclick="setStatsRange('${k}')">${l}</button>`;

  let h = `<div class="vhead"><button class="btn sm ghost" onclick="go('stats')" aria-label="Volver a Progreso">‹</button><h2>Estadísticas detalladas</h2><span class="sub">${esc(R.label)}</span><div class="grow"></div>
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
    ${kpi(st.activeDays + "<span style='font-size:1rem;color:var(--tx3)'>/" + st.elapsed.length + "</span>", "días con actividad (" + st.coverage + "% de constancia)")}
    ${kpi(st.best.d ? hClock(st.best.m) : "—", st.best.d ? "mejor día · " + fmtD(st.best.d) : "mejor día")}
    ${kpi(st.doneR.length, "tareas completadas" + (st.prevDone ? ` · ${st.doneR.length >= st.prevDone ? "▲" : "▼"} ${Math.abs(st.doneR.length - st.prevDone)} vs anterior` : ""))}
  </div>`;

  /* --- Evolución --- */
  h += `<div class="card"><h3>Evolución ${st.gran === "day" ? "diaria" : st.gran === "week" ? "semanal" : "mensual"}<div class="grow"></div>
    <span class="tiny">${st.series.length} ${st.gran === "day" ? "días" : st.gran === "week" ? "semanas" : "meses"} · pico ${hClock(Math.max(0, ...st.series.map(p => p.v)))}</span></h3>
    ${chartTimeline(st, C, 880, 250)}</div>`;

  /* --- Ritmo: día de semana + franja horaria --- */
  const dowItems = st.dow.map((x, i) => ({ label: DAYS[i], full: DAYSL[i], v: x.n ? Math.round(x.min / x.n) : 0, hi: i === dToDate(todayISO()).getDay() }));
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
    h += `<div class="card" style="margin:0"><h3>¿A qué hora estudiás?</h3><div class="empty">Se completa con el tiempo que registres de acá en adelante.</div></div>`;
  }
  h += `</div>`;

  /* --- Distribución por materia --- */
  const distItems = [
    ...st.subs.filter(x => x.min > 0).map(x => ({ label: x.s.name, short: x.s.short, v: x.min, color: x.s.color })),
    ...st.projs.map(x => ({ label: x.p.name, short: x.p.name.slice(0, 6), v: x.min, color: C.tx3 }))
  ];
  if (distItems.length) {
    h += `<div class="card"><h3>Horas por materia</h3>
      ${chartHBars(distItems.slice(0, 9).map(x => ({ label: x.short, color: x.color, v: x.v, full: x.label + " · " + fmtMin(x.v) })), C, 860, Math.max(80, distItems.slice(0, 9).length * 28 + 14))}</div>`;
  }

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

  /* --- Notas y evaluaciones --- */
  if (st.graded.length) {
    const apr = st.graded.filter(x => x.g >= 4).length;
    h += `<div class="card"><h3>Rendimiento en evaluaciones<div class="grow"></div>
      <span class="tiny">promedio ${st.gradeAvg} · ${apr}/${st.graded.length} aprobadas</span></h3>${chartGrades(st.graded.slice(-14), C, 860, 190)}</div>`;
  }

  /* --- Mapa de calor --- */
  h += `<div class="card"><h3>Mapa de actividad<div class="grow"></div><span class="tiny">último año · cada cuadrito es un día</span></h3>
    <div style="overflow-x:auto">${chartHeat(C, 800, 130, todayISO(), 53)}</div></div>`;

  /* --- Conclusiones automáticas --- */
  const ins = buildInsights(st, C);
  if (ins.length) h += `<div class="card" style="border-left:3px solid var(--acc)"><h3>Lo que dicen tus números</h3>${ins.map(x => `<p class="muted" style="margin:6px 0;line-height:1.55">${x}</p>`).join("")}</div>`;
  return h;
}

function buildInsights(st, C) {
  const out = [];
  if (!st.total) return ["Todavía no hay tiempo registrado en este período. Registrá tiempo o completá tareas cargando cuánto te llevaron."];
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
  g += txt(W - M - 26, 118, st.activeDays + " días activos · " + st.sess.length + " sesiones", 10.5, "#ffffff", "end");

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
    { label: "Temporizador", v: st.comp.pomo, color: C.acc },
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
  ["Mejor racha", st.bestStreak], ["Sesiones", st.sess.length],
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
  let h = `${backToConfig}<div class="vhead"><h2>Historial</h2></div>`;
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
      <div class="tinfo"><div class="tt">${fmtMin(s.min)}${s.manual ? " · manual" : ""}${s.auto ? " · por tarea completada" : ""}</div>
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
  return `${backToConfig}<div class="vhead"><h2>Copias de seguridad</h2><div class="grow"></div>
    <button class="btn" onclick="manualBackup()">Crear copia ahora</button>
    <button class="btn primary" onclick="exportJSON()">Exportar JSON</button></div>
  <div class="card"><h3>Importar datos</h3>
    <p class="muted" style="margin-bottom:10px">Elegí un archivo JSON exportado desde Aula (o desde la versión anterior). Antes de aplicar se valida el contenido y podés elegir fusionar o reemplazar.</p>
    <input type="file" id="impfile" accept=".json,application/json" onchange="importJSON(event)" style="font-size:.8rem" aria-label="Importar archivo JSON"></div>
  <div class="card"><h3>Copias locales automáticas</h3>
    <p class="tiny" style="margin-bottom:8px">Se crea una por día al abrir la aplicación (se conservan las últimas 10, más 10 manuales) y otra antes de cada actualización que cambia la forma de tus datos. Se guardan en este navegador.</p>
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
        state = normalizeState(s); migrateState(state); change(); render(); toast("Copia restaurada");
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
        onOk: () => { try { localStorage.setItem(OLD_LS_KEY, JSON.stringify(s)); } catch (e) {} const tmp = normalizeState(baseState()); tmp.subjects = state.subjects.length ? JSON.parse(JSON.stringify(state.subjects)) : initialSubjects(); if (migrateV1(tmp)) { migrateState(tmp); mergeStates(state, tmp); change(); render(); toast("Datos de la versión anterior importados"); } else toast("No se pudo migrar el archivo"); }
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
    byId("impMerge").onclick = () => { const src = normalizeState(s); migrateState(src); mergeStates(state, src); closeConfirm(); change(); render(); toast("Datos fusionados"); };
    byId("impReplace").onclick = () => {
      closeConfirm();
      askConfirm({
        title: "Reemplazar todo", body: "Se descartará el estado actual y se usará el del archivo. Esta acción no se puede deshacer (se guarda una copia previa).", okLabel: "Reemplazar", danger: true,
        onOk: async () => { try { if (db) await idbPut("backups", "pre-import-" + Date.now(), { ts: Date.now(), label: "Antes de importar", data: JSON.stringify(state) }); } catch (e) {} state = normalizeState(s); migrateState(state); change(); render(); toast("Datos reemplazados"); }
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
  </div>
  <div class="card" style="margin:0"><h3>Notificaciones</h3>
    <label style="display:flex;gap:8px;align-items:center;font-size:.8rem;cursor:pointer"><input type="checkbox" style="width:auto" ${chk(st.notif)} onchange="toggleNotif(this.checked)">Notificaciones locales (vencimientos y parciales)</label>
    <p class="tiny" style="margin-top:8px">El permiso del navegador se pide recién al activar esta opción.</p>
    <div class="hr"></div>
    <label class="tiny" style="font-weight:700">Días considerados “próximos”</label>
    <input type="number" min="1" max="30" value="${st.upcomingDays}" onchange="state.settings.upcomingDays=parseInt(this.value)||7;change();render()" style="width:90px;background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:7px;margin-top:4px" aria-label="Días próximos">
  </div>
  <div class="card" style="margin:0"><h3>Preferencias</h3>
    <label class="tiny" style="font-weight:700;display:block">Primer día de la semana</label>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn sm ${st.weekStart === 1 ? "primary" : ""}" onclick="state.settings.weekStart=1;change();render()">Lunes</button>
      <button class="btn sm ${st.weekStart === 0 ? "primary" : ""}" onclick="state.settings.weekStart=0;change();render()">Domingo</button></div>
    <label class="tiny" style="font-weight:700;display:block;margin-top:12px" for="cfg_dayend">Mi día termina a las</label>
    <select id="cfg_dayend" style="margin-top:6px;width:100%;max-width:220px;min-height:40px;background:var(--card2);color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:7px" onchange="state.settings.dayEnd=this.value;change();render()">
      ${["00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00"].map(h => `<option value="${h}" ${st.dayEnd === h ? "selected" : ""}>${h === "00:00" ? "Medianoche" : h}</option>`).join("")}</select>
    <p class="tiny" style="margin-top:6px">Lo que marques antes de esa hora cuenta para el día anterior. Ideal si estudiás hasta tarde.</p>
    <div class="hr"></div>
    <label style="display:flex;gap:8px;align-items:center;font-size:.8rem;cursor:pointer"><input type="checkbox" style="width:auto" ${chk(st.showDone)} onchange="state.settings.showDone=this.checked;change();render()">Mostrar tareas completadas en la lista</label>
    <label class="tiny" style="font-weight:700;display:block;margin-top:12px" for="cfg_donekeep">Sacar de la lista las hechas hace más de</label>
    <select id="cfg_donekeep" style="margin-top:6px;width:100%;max-width:220px;min-height:40px;background:var(--card2);color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:7px" onchange="state.settings.doneKeepDays=parseInt(this.value)||0;change();render()">
      ${[3, 5, 7, 10, 14, 30, 0].map(n => `<option value="${n}" ${(st.doneKeepDays | 0) === n ? "selected" : ""}>${n ? n + " días" : "Nunca"}</option>`).join("")}</select>
    <p class="tiny" style="margin-top:6px">No se borran: siguen en Historial y en Estadísticas.</p>
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
      <button class="btn sm" onclick="go('history')">Historial</button>
      <button class="btn sm" onclick="exportCSV()">Exportar estadísticas CSV</button>
      <button class="btn sm danger" onclick="resetApp()">Reiniciar aplicación</button></div>
    <div class="hr"></div>
    <p class="tiny">Versión ${APP_VERSION} (datos v${schemaOf(state)}) · ${state.meta.migratedV1 ? "Datos migrados de la versión anterior el " + (state.meta.migratedAt || "").slice(0, 10) : "Instalación nueva"} · Guardado principal: ${db ? "IndexedDB" : "localStorage"}</p>
    <button class="btn sm ghost" style="margin-top:6px" onclick="showShortcuts()">Ver atajos de teclado</button>
    <span id="installSlot"></span>
  </div>
  </div>`;
}
function addTag() { const i = byId("newTag"); const v = (i.value || "").trim().toLowerCase().replace(/^#/, ""); if (!v) return; if (!state.settings.tags.includes(v)) state.settings.tags.push(v); i.value = ""; change(); render(); }
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
      state = baseState(); state.subjects = initialSubjects(); state.meta.migratedV1 = true; migrateState(state);
      change(); render(); toast("Aplicación reiniciada");
    }
  });
}
/* ============================ MODALES ============================ */
function openModal(html, wide, noFocus) {
  const bg = byId("modalbg"), box = byId("modalbox");
  box.className = "modal" + (wide ? " wide" : "");
  box.innerHTML = html;
  bg.classList.add("open");
  // noFocus: cuando lo primero es una lista para elegir, enfocar un botón confunde ("¿está elegido Todas?")
  const f = noFocus ? null : box.querySelector("input,select,textarea") || box.querySelector("button"); // primero un campo: un botón de arriba (p. ej. "Ver la serie") no se lleva el foco
  // si mientras tanto ya tocaste otro campo del modal, no robarle el foco (lo que escribías iba a parar al título)
  if (f) setTimeout(() => { if (!box.contains(document.activeElement)) f.focus(); }, 30);
}
function closeModal() { byId("modalbg").classList.remove("open"); }
/* B3 · En los selectores no aparecen parciales cerrados (rendido / aprobado /
   desaprobado) ni proyectos terminados o archivados, salvo el que ya está
   elegido: una tarea vinculada a algo cerrado sigue mostrando su vínculo. */
const EVAL_CLOSED = ["rendido", "aprob", "desaprob"];
const PROJ_CLOSED = ["done", "arch"];
function evalMatchesLink(e, link) {
  if (!link) return true;
  if (link.startsWith("s:")) return e.subjectId === link.slice(2);
  if (link.startsWith("p:")) return e.projectId === link.slice(2);
  return true;
}
/* Opciones de "Parcial / final" para una materia o proyecto (link "s:…"/"p:…"/""). */
function evalOptions(link, keepId) {
  const list = state.evals.filter(e => e.id === keepId || (!EVAL_CLOSED.includes(e.status) && evalMatchesLink(e, link)))
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  return `<option value="">— Ninguno —</option>` + list.map(e => `<option value="${e.id}" ${e.id === keepId ? "selected" : ""}>${esc(e.name)}${e.date ? " · " + fmtD(e.date) : ""}${EVAL_CLOSED.includes(e.status) ? " (" + EVAL_STATUS[e.status].toLowerCase() + ")" : ""}</option>`).join("");
}
/* Al cambiar la materia: se recalculan los parciales; si el elegido no es de esa materia, se limpia. */
function refreshEvalSelect(linkId, evalId) {
  const l = byId(linkId).value, es = byId(evalId); if (!es) return;
  const cur = evalById(es.value);
  es.innerHTML = evalOptions(l, cur && evalMatchesLink(cur, l) ? cur.id : null);
}
/* Al elegir un parcial sin materia elegida, se completa la materia del parcial. */
function evalPicked(linkId, evalId) {
  const e = evalById(byId(evalId).value), ls = byId(linkId);
  if (!e || !ls || ls.value) return;
  const want = e.subjectId ? "s:" + e.subjectId : e.projectId ? "p:" + e.projectId : "";
  if (want && [...ls.options].some(o => o.value === want)) ls.value = want;
}
function linkOptions(sel, includeTasks) {
  let h = `<option value="">— Sin vínculo —</option><optgroup label="Materias">`;
  h += activeSubjects().map(s => `<option value="s:${s.id}" ${sel === "s:" + s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("");
  h += `</optgroup><optgroup label="Proyectos">`;
  h += state.projects.filter(p => !PROJ_CLOSED.includes(p.status) || sel === "p:" + p.id).map(p => `<option value="p:${p.id}" ${sel === "p:" + p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  h += `</optgroup>`;
  if (includeTasks) {
    h += `<optgroup label="Evaluaciones">` + state.evals.filter(e => !EVAL_CLOSED.includes(e.status) || sel === "e:" + e.id).map(e => `<option value="e:${e.id}" ${sel === "e:" + e.id ? "selected" : ""}>${esc(e.name)}</option>`).join("") + `</optgroup>`;
    h += `<optgroup label="Tareas">` + state.tasks.filter(t => !t.archived && t.status !== "done").slice(0, 40).map(t => `<option value="t:${t.id}" ${sel === "t:" + t.id ? "selected" : ""}>${esc(t.title.slice(0, 44))}</option>`).join("") + `</optgroup>`;
  }
  return h;
}

function openQuickTaskForEval(evId) {
  const e = evalById(evId); if (!e) return;
  openQuickTask(null, e.subjectId, e.projectId);
  const es = byId("qt_eval"); if (es) { es.innerHTML = evalOptions(byId("qt_link").value, evId); es.value = evId; }
}
/* ---------- Agregado rápido ---------- */
function openQuick() {
  openModal(`<h3>Agregado rápido</h3>
    <div class="grid3" style="gap:8px">
      ${[["task", "Tarea"], ["eval", "Parcial / final"], ["project", "Proyecto"], ["subject", "Materia"], ["note", "Nota"], ["habit", "Hábito"]].map(([k, v]) =>
        `<button class="btn" style="padding:14px" onclick="quickRoute('${k}')">${v}</button>`).join("")}
    </div>
    <p class="tiny" style="margin-top:12px">Atajos: <kbd>N</kbd> tarea · <kbd>/</kbd> buscar · <kbd>Ctrl</kbd>+<kbd>K</kbd> acciones</p>`);
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
      <div><label for="qt_link">Materia / proyecto</label><select id="qt_link" onchange="refreshEvalSelect('qt_link','qt_eval')">${linkOptions(sel)}</select></div>
      <div><label for="qt_eval">Parcial / final (opcional)</label><select id="qt_eval" onchange="evalPicked('qt_link','qt_eval')">${evalOptions(sel, null)}</select></div>
    </div>
    <div class="mrow">
      <div><label for="qt_min">Tiempo estimado (min)</label><input id="qt_min" type="number" value="60" min="0" step="5"></div>
    </div>
    <div class="mrow">
      <div><label for="qt_mode">Programación</label><select id="qt_mode" onchange="byId('qt_timewrap').style.display=this.value==='none'?'none':'block';byId('qt_repwrap').style.display=this.value==='d'?'block':'none';repPreview()">
        <option value="d">Día fijo</option>
        <option value="due">Fecha límite (flexible)</option>
        <option value="none">Sin fecha</option></select></div>
      <div><label for="qt_date">Fecha${""}</label><input id="qt_date" type="date" value="${date || todayISO()}" onchange="repPreview()"></div>
      <div id="qt_timewrap"><label for="qt_time">Hora (opcional)</label><input id="qt_time" type="time"></div>
    </div>
    ${repeatControls(date || todayISO())}
    <div class="mfoot"><span class="tiny grow">Después podés abrirla para completar detalles avanzados.</span>
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="qt_save" onclick="saveQuickTask()">Crear tarea</button></div>`);
  repPreview();
}
/* ---------- C1 · Repetir ----------
   Un solo concepto para el usuario. Internamente:
   - Con fin (fecha o cantidad): se crean tareas individuales con el mismo seriesId.
     Así cada una se edita, se mueve o se completa por separado.
   - Sin fin: UNA tarea con t.recur (el modelo que ya existía), porque no se pueden
     crear infinitas. Las fechas de las dos salen del mismo cálculo (occursOn). */
const REP_MAX = 120;
function repeatControls(start) {
  const wd = [[1, "L"], [2, "M"], [3, "X"], [4, "J"], [5, "V"], [6, "S"], [0, "D"]];
  return `<div id="qt_repwrap">
    <div class="mrow">
      <div><label for="qt_rep">Repetir</label><select id="qt_rep" onchange="repPreview()">
        <option value="none">No se repite</option><option value="daily">Todos los días</option><option value="interval">Cada N días</option>
        <option value="days">Ciertos días de la semana</option><option value="weekly">Cada semana</option><option value="monthly">Cada mes</option></select></div>
      <div class="repx" id="qt_repnwrap"><label for="qt_repn">Cada cuántos días</label><input id="qt_repn" type="number" min="2" max="60" value="2" oninput="repPreview()"></div>
    </div>
    <div class="repx" id="qt_repdayswrap"><label>Días</label><div class="wdpick" id="qt_repdays">${wd.map(([n, l]) => `<button type="button" data-wd="${n}" aria-pressed="false" onclick="this.setAttribute('aria-pressed',this.getAttribute('aria-pressed')==='true'?'false':'true');repPreview()">${l}</button>`).join("")}</div></div>
    <div class="mrow repx" id="qt_rependwrap">
      <div><label for="qt_repend">Termina</label><select id="qt_repend" onchange="repPreview()">
        <option value="until">En una fecha</option><option value="count">Después de N veces</option><option value="never">Sin fin</option></select></div>
      <div class="repx" id="qt_repuntilwrap"><label for="qt_repuntil">Hasta (inclusive)</label><input id="qt_repuntil" type="date" value="${addDays(start, 6)}" onchange="repPreview()"></div>
      <div class="repx" id="qt_repcountwrap"><label for="qt_repcount">Cantidad de veces</label><input id="qt_repcount" type="number" min="1" max="${REP_MAX}" value="5" oninput="repPreview()"></div>
    </div>
    <div id="qt_preview" class="reppreview" role="status" aria-live="polite" hidden></div>
  </div>`;
}
/* Fechas de una repetición. rule = {kind, n, days}; end = {type: until|count|never, date, n}.
   Con "never" devuelve las primeras `peek` (para la vista previa). */
function repeatDates(start, rule, end, peek) {
  const fake = { recur: { kind: rule.kind, n: rule.n, days: rule.days || [], start } };
  const max = end.type === "count" ? Math.min(end.n | 0, REP_MAX) : end.type === "never" ? (peek || 5) : REP_MAX + 1;
  const out = [];
  for (let d = start, i = 0; out.length < max && i < 3700; d = addDays(d, 1), i++) {
    if (end.type === "until" && d > end.date) break;
    if (occursOn(fake, d)) out.push(d);
  }
  return out;
}
/* Lee el formulario. Devuelve {rule, end, dates} o {error}. */
function readRepeat() {
  const kind = byId("qt_rep") ? byId("qt_rep").value : "none";
  if (kind === "none" || byId("qt_mode").value !== "d") return null;
  const start = byId("qt_date").value || todayISO();
  const rule = { kind };
  if (kind === "interval") { rule.n = parseInt(byId("qt_repn").value) || 0; if (rule.n < 2) return { error: "Poné cada cuántos días (2 o más)." }; }
  if (kind === "days") {
    rule.days = [...document.querySelectorAll('#qt_repdays [aria-pressed="true"]')].map(b => +b.dataset.wd);
    if (!rule.days.length) return { error: "Elegí al menos un día de la semana." };
  }
  const et = byId("qt_repend").value, end = { type: et };
  if (et === "until") { end.date = byId("qt_repuntil").value; if (!end.date || end.date < start) return { error: "La fecha final tiene que ser igual o posterior al inicio (" + fmtD(start) + ")." }; }
  if (et === "count") { end.n = parseInt(byId("qt_repcount").value) || 0; if (end.n < 1) return { error: "Poné cuántas veces." }; if (end.n > REP_MAX) return { error: "Máximo " + REP_MAX + " veces. Si es para siempre, elegí “Sin fin”." }; }
  const dates = repeatDates(start, rule, end, 5);
  if (et !== "never" && dates.length > REP_MAX) return { error: "Serían más de " + REP_MAX + " tareas. Acortá el período o elegí “Sin fin”." };
  if (!dates.length) return { error: "Con esta configuración no cae ningún día." };
  return { start, rule, end, dates };
}
function repPreview() {
  const kind = byId("qt_rep") ? byId("qt_rep").value : "none";
  const show = (id, on) => { const el = byId(id); if (el) el.style.display = on ? "" : "none"; };
  show("qt_repnwrap", kind === "interval");
  show("qt_repdayswrap", kind === "days");
  show("qt_rependwrap", kind !== "none");
  const et = byId("qt_repend") ? byId("qt_repend").value : "until";
  show("qt_repuntilwrap", et === "until"); show("qt_repcountwrap", et === "count");
  const pv = byId("qt_preview"), btn = byId("qt_save");
  if (!pv) return;
  const r = readRepeat();
  pv.hidden = !r; pv.classList.toggle("bad", !!(r && r.error));
  if (btn) btn.textContent = r && !r.error && r.end.type !== "never" ? "Crear " + r.dates.length + " tareas" : "Crear tarea";
  if (!r) return;
  if (r.error) { pv.innerHTML = esc(r.error); return; }
  const list = r.dates.slice(0, 14).map(d => `<span class="repdate">${fmtD(d)}</span>`).join("") + (r.dates.length > 14 ? `<span class="repdate more">y ${r.dates.length - 14} más</span>` : "");
  pv.innerHTML = r.end.type === "never"
    ? `<b>Sin fin:</b> una sola tarea que se repite. Próximas: <div class="repdates">${list}<span class="repdate more">…</span></div>`
    : `<b>Se van a crear ${r.dates.length} tarea${r.dates.length > 1 ? "s" : ""}</b>${r.dates.length > 1 ? " (una serie)" : ""}: <div class="repdates">${list}</div>`;
}
function saveQuickTask() {
  const title = byId("qt_title").value.trim();
  if (!title) { toast("Falta el título"); return; }
  const link = byId("qt_link").value, mode = byId("qt_mode").value, date = byId("qt_date").value || todayISO();
  const base = {
    title, estMin: parseInt(byId("qt_min").value) || 0,
    time: mode !== "none" && hmToMin(byId("qt_time").value) != null ? byId("qt_time").value : null,
    subjectId: link.startsWith("s:") ? link.slice(2) : null,
    projectId: link.startsWith("p:") ? link.slice(2) : null,
    evalId: byId("qt_eval").value || null // planId queda reservado al generador de planes: "Regenerar plan" solo borra esas
  };
  const r = readRepeat();
  if (r && r.error) { toast(r.error); repPreview(); return; }
  if (r && r.end.type === "never") {
    const t = quickAddTask(Object.assign({ date: null, recur: Object.assign({ start: r.start }, r.rule, { days: r.rule.days || [] }) }, base));
    closeModal(); render();
    toast("Tarea que se repite creada", () => { state.tasks = state.tasks.filter(x => x.id !== t.id); change(); render(); });
    return;
  }
  if (r) {
    const ids = [], seriesId = r.dates.length > 1 ? "sr-" + uid() : null;
    for (const d of r.dates) ids.push(quickAddTask(Object.assign({ date: d, seriesId }, base)).id);
    closeModal(); render();
    toast(ids.length + " tareas creadas: " + fmtD(r.dates[0]) + " a " + fmtD(r.dates[r.dates.length - 1]), () => { state.tasks = state.tasks.filter(x => !ids.includes(x.id)); change(); render(); });
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
  ui.serMap = null; const sp = seriesPos(t);
  openModal(`<h3>Editar tarea</h3>
    ${sp ? `<div class="serbanner"><span>Parte de una serie · <b>${sp.i} de ${sp.n}</b></span>
      <button type="button" class="btn sm" onclick="closeModal();openSeriesModal('${escA(sp.key)}')">Ver la serie</button></div>` : ""}
    <label for="te_title">Título</label><input id="te_title" value="${escA(t.title)}">
    <label for="te_desc">Descripción</label><textarea id="te_desc" rows="2">${esc(t.desc || "")}</textarea>
    <div class="mrow">
      <div><label for="te_link">Materia / proyecto</label><select id="te_link" onchange="refreshEvalSelect('te_link','te_eval')">${linkOptions(sel)}</select></div>
      <div><label for="te_eval">Parcial / final</label><select id="te_eval" onchange="evalPicked('te_link','te_eval')">${evalOptions(sel, t.evalId)}</select></div>
    </div>
    <div class="mrow">
      <div><label for="te_date">Fecha programada</label><input id="te_date" type="date" value="${t.date || ""}"></div>
      <div><label for="te_time">Hora</label><input id="te_time" type="time" value="${t.time || ""}"></div>
    </div>
    <div class="mrow">
      <div><label for="te_due">Fecha límite</label><input id="te_due" type="date" value="${t.due || ""}"></div>
      <div><label for="te_min">Estimado (min)</label><input id="te_min" type="number" value="${t.estMin || 0}" min="0" step="5"></div>
    </div>
    <div class="mrow">
      <div><label for="te_prio">Prioridad</label><select id="te_prio">${PRIO.map((p, i) => `<option value="${i}" ${t.prio === i ? "selected" : ""}>${p}</option>`).join("")}</select></div>
      <div><label for="te_status">Estado</label><select id="te_status" onchange="byId('te_donewrap').style.display=this.value==='done'?'block':'none'">${Object.entries(TASK_STATUS).map(([k, v]) => `<option value="${k}" ${t.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div><label for="te_type">Tipo</label><select id="te_type">${Object.entries(TASK_TYPES).map(([k, v]) => `<option value="${k}" ${t.type === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
    </div>
    <div id="te_donewrap" style="display:${t.status === "done" ? "block" : "none"}">
      <label for="te_doneat">Completada el</label>
      <input id="te_doneat" type="date" value="${t.doneAt || todayISO()}" max="${todayISO()}" style="max-width:220px">
    </div>
    <div class="mrow">
      <div><label for="te_tags">Etiquetas (separadas por coma)</label><input id="te_tags" value="${escA((t.tags || []).join(", "))}"></div>
      <div${sp ? ' style="display:none"' : ""}><label for="te_rec">Recurrencia</label><select id="te_rec" onchange="byId('te_recdays').style.display=(this.value==='days')?'block':'none';byId('te_recn').style.display=(this.value==='interval')?'block':'none'">
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
    <label for="te_newcmt">Comentarios</label>
    <div id="te_comments" data-tid="${t.id}"></div>
    <div class="cmt-new"><textarea id="te_newcmt" rows="1" placeholder="Escribí un comentario…" onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();addTaskComment('${t.id}')}"></textarea>
      <button class="btn" onclick="addTaskComment('${t.id}')">Comentar</button></div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:12px">
      <p class="tiny" style="flex:1;margin:0">Tiempo real: <b>${fmtMin(t.realMin || 0)}</b> · creada ${fmtD(t.createdAt)}${t.doneAt ? " · completada " + fmtD(t.doneAt) : ""}</p>
      <button class="btn sm" onclick="openManualSession('${t.id}')">Registrar tiempo</button></div>
    <div class="mfoot">
      <button class="btn danger" onclick="deleteTask('${t.id}')">Eliminar</button>
      <button class="btn" onclick="archiveTask('${t.id}');closeModal()">${t.archived ? "Restaurar" : "Archivar"}</button>
      <button class="btn" onclick="duplicateTask('${t.id}');closeModal()">Duplicar</button>
      <div class="grow"></div>
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="saveTaskEditor('${t.id}')">Guardar</button></div>`, true);
  renderTaskEditorSubtasks(t);
  ui.editingComment = null; renderTaskComments(t);
  ui.teInit = { id, v: editorSharedValues() };
}
/* ---------- Comentarios en tareas (B2) ----------
   t.comments = [{ id, text, ts, editedTs? }]. Se guardan al instante (como las
   subtareas); borrar tiene deshacer. */
function fmtStamp(ts) {
  const d = new Date(ts);
  return fmtD(iso(d)) + " · " + fmtTime(pad(d.getHours()) + ":" + pad(d.getMinutes()));
}
function renderTaskComments(t) {
  const el = byId("te_comments"); if (!el || el.dataset.tid !== t.id) return;
  const list = [...(t.comments || [])].sort((a, b) => a.ts - b.ts);
  el.innerHTML = list.map(c => ui.editingComment === c.id
    ? `<div class="cmt" data-cid="${c.id}"><textarea id="te_cmt_edit" rows="2" aria-label="Editar comentario">${esc(c.text)}</textarea>
        <div class="cmt-act"><button class="btn sm ghost" onclick="ui.editingComment=null;renderTaskComments(taskById('${t.id}'))">Cancelar</button>
        <button class="btn sm primary" onclick="saveTaskComment('${t.id}','${c.id}')">Guardar</button></div></div>`
    : `<div class="cmt" data-cid="${c.id}"><div class="cmt-meta">${fmtStamp(c.ts)}${c.editedTs ? " · editado" : ""}</div>
        <div class="cmt-text">${esc(c.text).replace(/\n/g, "<br>")}</div>
        <div class="cmt-act"><button class="btn sm ghost" onclick="editTaskComment('${t.id}','${c.id}')">Editar</button>
        <button class="btn sm ghost" style="color:var(--bad)" onclick="deleteTaskComment('${t.id}','${c.id}')">Borrar</button></div></div>`).join("");
}
function addTaskComment(taskId) {
  const t = taskById(taskId), i = byId("te_newcmt");
  if (!t || !i || !i.value.trim()) return;
  t.comments = t.comments || [];
  t.comments.push({ id: uid(), text: i.value.trim(), ts: Date.now() });
  i.value = ""; change(); renderTaskComments(t); render();
}
function editTaskComment(taskId, cid) {
  ui.editingComment = cid; renderTaskComments(taskById(taskId));
  const a = byId("te_cmt_edit"); if (a) { a.focus(); a.setSelectionRange(a.value.length, a.value.length); }
}
function saveTaskComment(taskId, cid) {
  const t = taskById(taskId); if (!t) return;
  const c = (t.comments || []).find(x => x.id === cid), a = byId("te_cmt_edit");
  if (!c || !a) return;
  const txt = a.value.trim();
  if (!txt) { toast("El comentario no puede quedar vacío (para sacarlo, usá Borrar)"); return; }
  if (txt !== c.text) { c.text = txt; c.editedTs = Date.now(); change(); }
  ui.editingComment = null; renderTaskComments(t);
}
function deleteTaskComment(taskId, cid) {
  const t = taskById(taskId); if (!t || !t.comments) return;
  const idx = t.comments.findIndex(x => x.id === cid); if (idx < 0) return;
  const [c] = t.comments.splice(idx, 1);
  change(); renderTaskComments(t); render();
  toast("Comentario borrado", () => { const tt = taskById(taskId); if (!tt) return; tt.comments = tt.comments || []; tt.comments.splice(Math.min(idx, tt.comments.length), 0, c); change(); renderTaskComments(tt); render(); });
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
/* C3 · Si la tarea es parte de una serie y cambiaste algo que comparten
   (título, materia, minutos, hora…), pregunta a cuáles aplicarlo, como el
   Calendario del iPhone. Fecha, estado, notas y comentarios son siempre de esta. */
const SERIES_SHARED = [
  ["title", "título"], ["desc", "descripción"], ["subjectId", "materia"], ["projectId", "proyecto"], ["evalId", "parcial"],
  ["estMin", "minutos"], ["time", "hora"], ["prio", "prioridad"], ["type", "tipo"], ["tags", "etiquetas"]
];
function editorSharedValues() {
  const link = byId("te_link").value, tm = byId("te_time").value;
  return {
    title: byId("te_title").value.trim(), desc: byId("te_desc").value,
    subjectId: link.startsWith("s:") ? link.slice(2) : null, projectId: link.startsWith("p:") ? link.slice(2) : null,
    evalId: byId("te_eval").value || null, estMin: parseInt(byId("te_min").value) || 0,
    time: hmToMin(tm) != null ? tm : null, prio: parseInt(byId("te_prio").value), type: byId("te_type").value,
    tags: byId("te_tags").value.split(",").map(x => x.trim().replace(/^#/, "")).filter(Boolean)
  };
}
function saveTaskEditor(id, scope) {
  const t = taskById(id); if (!t) return;
  const title = byId("te_title").value.trim();
  if (!title) { toast("El título no puede quedar vacío"); return; }
  ui.serMap = null;
  const sp = seriesPos(t);
  const nv = editorSharedValues(), norm = v => JSON.stringify(v == null || v === "" ? null : v);
  // "lo que cambiaste" = lo que dice el editor ahora vs lo que decía al abrirse
  const init = ui.teInit && ui.teInit.id === id ? ui.teInit.v : nv;
  const diff = SERIES_SHARED.filter(([k]) => norm(nv[k]) !== norm(init[k]));
  if (sp && diff.length && !scope) {
    const rest = sp.list.filter(x => x !== t), next = sp.list.slice(sp.i - 1);
    const names = [...new Set(diff.map(d => d[1]))];
    const box = byId("confirmbox");
    box.innerHTML = `<h3>Esta tarea es parte de una serie</h3>
      <p class="muted">Cambiaste ${esc(names.length > 1 ? names.slice(0, -1).join(", ") + " y " + names[names.length - 1] : names[0])}. ¿A cuáles se lo aplico?</p>
      <div class="scopebtns">
        <button class="btn" onclick="closeConfirm();saveTaskEditor('${escA(id)}','this')">Solo a esta</button>
        ${next.length > 1 && next.length < sp.n ? `<button class="btn" onclick="closeConfirm();saveTaskEditor('${escA(id)}','next')">A esta y las siguientes (${next.length})</button>` : ""}
        <button class="btn primary" onclick="closeConfirm();saveTaskEditor('${escA(id)}','all')">A todas las de la serie (${sp.n})</button>
        <button class="btn ghost" onclick="closeConfirm()">Cancelar</button></div>`;
    byId("confirmbg").classList.add("open");
    return;
  }
  // Las otras de la serie reciben solo los campos que cambiaste (con deshacer)
  let others = [];
  if (sp && diff.length && (scope === "next" || scope === "all")) {
    others = (scope === "all" ? sp.list : sp.list.slice(sp.i - 1)).filter(x => x !== t);
  }
  const snaps = others.map(x => ({ x, v: Object.assign({ planId: x.planId }, Object.fromEntries(diff.map(([k]) => [k, Array.isArray(x[k]) ? [...x[k]] : x[k]]))) }));
  others.forEach(x => diff.forEach(([k]) => {
    x[k] = Array.isArray(nv[k]) ? [...nv[k]] : k === "desc" ? nv.desc : nv[k];
    if (k === "evalId" && x.planId && x.planId !== nv.evalId) x.planId = null;
  }));
  t.title = title; t.desc = byId("te_desc").value;
  const link = byId("te_link").value;
  t.subjectId = link.startsWith("s:") ? link.slice(2) : null;
  t.projectId = link.startsWith("p:") ? link.slice(2) : null;
  const ev = byId("te_eval").value || null;
  if (ev !== (t.evalId || null)) {
    t.evalId = ev;
    // planId lo pone solo el generador de planes ("Regenerar plan" borra esas tareas).
    // Vincular a mano NO la mete en el plan; si la cambiás de parcial, sale del plan viejo.
    if (t.planId && t.planId !== ev) t.planId = null;
  }
  const prevDate = t.date;
  t.date = byId("te_date").value || null;
  const tm = byId("te_time").value;
  if (hmToMin(tm) != null) t.time = tm; else if (t.time) t.time = null;
  if (t.date !== prevDate) t.ord = null;
  t.due = byId("te_due").value || null;
  t.estMin = parseInt(byId("te_min").value) || 0;
  t.prio = parseInt(byId("te_prio").value);
  const prevStatus = t.status;
  t.status = byId("te_status").value;
  const doneIn = (byId("te_doneat") || {}).value || todayISO();
  const doneDay = doneIn > todayISO() ? todayISO() : doneIn;
  if (t.status === "done" && prevStatus !== "done") { t.doneAt = doneDay; bumpDayDone(doneDay); askDoneTime(t.id); }
  else if (t.status === "done" && t.doneAt !== doneDay) moveDoneDate(t, doneDay);
  if (t.status !== "done") { t.doneAt = null; if (prevStatus === "done") uncreditTaskDone(t); }
  t.type = byId("te_type").value;
  t.tags = byId("te_tags").value.split(",").map(x => x.trim().replace(/^#/, "")).filter(Boolean);
  t.notes = byId("te_notes").value;
  const rk = byId("te_rec").value;
  if (rk) {
    t.recur = { kind: rk, days: [...document.querySelectorAll(".te_day:checked")].map(x => parseInt(x.value)), n: parseInt((byId("te_n") || {}).value) || 2, start: t.date || todayISO() };
    t.recurDone = t.recurDone || {};
  } else t.recur = null;
  change(); closeModal(); render();
  if (others.length) toast("Guardado en " + (others.length + 1) + " tareas de la serie",
    () => { snaps.forEach(sn => Object.assign(sn.x, sn.v)); change(); render(); });
  else toast("Tarea guardada");
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
function openManualSession(taskId) {
  openModal(`<h3>Registrar tiempo</h3>
    <p class="tiny">Cuánto estudiaste. Suma a la tarea y a tus estadísticas.</p>
    <div class="mrow">
      <div><label for="ms_min">Minutos</label><input id="ms_min" type="number" min="5" step="5" value="60"></div>
      <div><label for="ms_date">Fecha</label><input id="ms_date" type="date" value="${todayISO()}"></div>
    </div>
    <label for="ms_link">Vinculada a</label><select id="ms_link">${linkOptions(taskId ? "t:" + taskId : "", true)}</select>
    <label for="ms_note">Nota (opcional)</label><input id="ms_note" placeholder="Qué estudiaste">
    <div class="mfoot"><button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" onclick="logManualSession()">Registrar</button></div>`);
}

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
      ["Registrar tiempo estudiado", () => openManualSession()],
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
      <kbd>Ctrl</kbd> + <kbd>K</kbd> Acciones rápidas<br>
      <kbd>Ctrl</kbd> + <kbd>S</kbd> Forzar guardado<br>
      <kbd>Ctrl</kbd> + clic Sumar una tarea a la selección<br>
      <kbd>Shift</kbd> + clic Seleccionar todo el rango<br>
      <kbd>Ctrl</kbd> + <kbd>A</kbd> Seleccionar todo lo visible<br>
      <kbd>Supr</kbd> Eliminar lo seleccionado<br>
      <kbd>Esc</kbd> Cerrar modal, menú o limpiar selección<br>
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
    if (byId("sheetbg").classList.contains("open")) { closeMoveSheet(); return; }
    if (byId("confirmbg").classList.contains("open")) { closeConfirm(); return; }
    if (byId("searchbg").classList.contains("open")) { closeSearch(); return; }
    if (byId("modalbg").classList.contains("open")) { closeModal(); return; }
    if (selSet().size || ui.selMode) { clearSel(); return; }
    if (window.innerWidth < 980 && document.body.classList.contains("sb-open")) { toggleSidebar(false); return; }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && !isTyping()) { e.preventDefault(); selectAllVisible(); return; }
  if ((e.key === "Delete" || e.key === "Backspace") && !isTyping() && selSet().size) { e.preventDefault(); bulkDelete(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); persist(); toast("Guardado"); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch("cmd"); return; }
  if (isTyping()) return;
  if (e.key === "n" || e.key === "N") { e.preventDefault(); openQuickTask(); }
  else if (e.key === "/") { e.preventDefault(); openSearch(); }
  else if (e.key === "?") { e.preventDefault(); showShortcuts(); }
}
function trapFocus(e) {
  if (e.key !== "Tab") return;
  const tops = ["sheetbg", "confirmbg", "searchbg", "modalbg"];
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
  let sbPref = null; try { sbPref = localStorage.getItem("aula-sb"); } catch (e) {}
  if (window.innerWidth >= 980 && sbPref !== "0") document.body.classList.add("sb-open");
  byId("btnMenu").onclick = () => toggleSidebar();
  byId("btnTheme").onclick = cycleTheme;
  if (window.matchMedia) { try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch (e) {} }
  window.addEventListener("hashchange", () => { render(); if (window.innerWidth < 980) toggleSidebar(false); });
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("keydown", trapFocus);
  document.addEventListener("pointerdown", dragPointerDown);
  // con la tarea levantada o arrastrándose, el dedo no scrollea la página ni abre el menú del sistema
  document.addEventListener("touchmove", e => { if (drag && (drag.state === "lifted" || drag.state === "dragging")) e.preventDefault(); }, { passive: false });
  document.addEventListener("contextmenu", e => { if (drag && drag.state !== "armed") e.preventDefault(); });
  byId("sheetbg").addEventListener("click", e => { if (e.target.id === "sheetbg") closeMoveSheet(); });
  for (const id of ["modalbg", "searchbg"]) byId(id).addEventListener("mousedown", e => { if (e.target.id === id) (id === "searchbg" ? closeSearch : closeModal)(); });
  byId("confirmbg").addEventListener("mousedown", e => { if (e.target.id === "confirmbg") closeConfirm(); });
  await dailyBackup();
  persist();
  render();
  setInterval(persist, 15000);
  setInterval(checkReminders, 5 * 60 * 1000);
  checkReminders();
  ui.dismissedAsk = new Set();
  setTimeout(checkPastEvals, 600);
  setInterval(checkPastEvals, 5 * 60 * 1000);
  window.addEventListener("beforeunload", flushNow);
  window.addEventListener("pagehide", flushNow); // en iOS/Android beforeunload no siempre llega
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { flushNow(); persist(); } });
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
