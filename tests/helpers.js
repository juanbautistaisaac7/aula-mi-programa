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

module.exports = { openApp, setClock, createQuickTask, reload };
