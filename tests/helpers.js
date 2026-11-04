// Helpers compartidos por los tests.
const { expect } = require("@playwright/test");

/** Abre la app con la base vacía y junta errores de consola / página. */
async function openApp(page) {
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto("/");
  await page.waitForFunction(() => typeof state !== "undefined" && state && Array.isArray(state.tasks));
  return errors;
}

/** Fija la fecha/hora del navegador (antes de cargar la página). */
async function setClock(page, isoDateTime) {
  await page.clock.install({ time: new Date(isoDateTime) });
}

/** Crea una tarea simple usando el modal real de "Nueva tarea". */
async function createQuickTask(page, title, opts = {}) {
  await page.evaluate(d => openQuickTask(d), opts.date || null);
  await page.fill("#qt_title", title);
  if (opts.mode) await page.selectOption("#qt_mode", opts.mode);
  if (opts.min != null) await page.fill("#qt_min", String(opts.min));
  await page.press("#qt_title", "Enter");
  await expect(page.locator("#modalbg")).not.toHaveClass(/open/);
}

/** Recarga y espera a que el estado vuelva desde IndexedDB. */
async function reload(page) {
  await page.reload();
  await page.waitForFunction(() => typeof state !== "undefined" && state && Array.isArray(state.tasks));
}

/** Lee un fixture de tests/fixtures (devuelve una copia nueva cada vez). */
function fixture(name) {
  const fs = require("fs"), path = require("path");
  return JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8"));
}

/**
 * Deja `stateObj` guardado en IndexedDB (aula-db / kv / "state") ANTES de que
 * la app arranque, tal como estaría en el celu de Bauti. Después hay que llamar
 * a openApp(page). Usa una página del mismo origen que no carga app.js.
 */
async function seedState(page, stateObj) {
  await page.goto("/manifest.webmanifest");
  await page.evaluate(async json => {
    await new Promise((res, rej) => {
      const rq = indexedDB.open("aula-db", 1);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
        if (!d.objectStoreNames.contains("backups")) d.createObjectStore("backups");
      };
      rq.onerror = () => rej(rq.error);
      rq.onsuccess = () => {
        const d = rq.result, tx = d.transaction("kv", "readwrite");
        tx.objectStore("kv").put(json, "state");
        tx.oncomplete = () => { d.close(); res(); };
        tx.onerror = () => rej(tx.error);
      };
    });
  }, JSON.stringify(stateObj));
}

/** Devuelve las copias de seguridad guardadas en IndexedDB: [{key, ...valor}]. */
async function readBackups(page) {
  return page.evaluate(async () => {
    const keys = await idbKeys("backups");
    const out = [];
    for (const k of keys) out.push(Object.assign({ key: k }, await idbGet("backups", k)));
    return out;
  });
}

/** Lo que quedó guardado en IndexedDB (no lo que hay en memoria). */
async function storedState(page) {
  return page.evaluate(async () => { await persist(); return JSON.parse(await idbGet("kv", "state")); });
}

/**
 * Verifica que todo lo de `before` sigue en `after`: cada colección conserva
 * todos sus elementos (por id) y cada campo original con el mismo valor.
 * Las migraciones pueden AGREGAR campos, nunca quitar ni cambiar los viejos
 * (salvo los listados en `allowChanged`, por ejemplo "meta.schema").
 */
function expectNothingLost(before, after, allowChanged = []) {
  const problems = [];
  const walk = (a, b, path) => {
    if (allowChanged.includes(path)) return;
    if (Array.isArray(a)) {
      if (!Array.isArray(b)) { problems.push(path + ": dejó de ser una lista"); return; }
      const byIdMode = a.every(x => x && typeof x === "object" && "id" in x);
      if (byIdMode) {
        for (const x of a) {
          const y = b.find(z => z && z.id === x.id);
          if (!y) problems.push(path + ": se perdió id=" + x.id); else walk(x, y, path + "[" + x.id + "]");
        }
      } else if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(path + ": cambió " + JSON.stringify(a) + " → " + JSON.stringify(b));
      return;
    }
    if (a && typeof a === "object") {
      if (!b || typeof b !== "object") { problems.push(path + ": dejó de ser un objeto"); return; }
      for (const k of Object.keys(a)) {
        if (!(k in b)) problems.push(path + "." + k + ": campo borrado");
        else walk(a[k], b[k], path ? path + "." + k : k);
      }
      return;
    }
    if (a !== b) problems.push(path + ": " + JSON.stringify(a) + " → " + JSON.stringify(b));
  };
  walk(before, after, "");
  expect(problems, "datos perdidos o cambiados por la migración").toEqual([]);
}

module.exports = { openApp, setClock, createQuickTask, reload, fixture, seedState, readBackups, storedState, expectNothingLost };
