// A4 · Sin pomodoro: no aparece en ninguna parte, pero el tiempo estudiado se conserva.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, fixture, seedState, expectNothingLost } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

test("ninguna vista, modal ni menú menciona el pomodoro", async ({ page }) => {
  const old = fixture("estado-v2.6.json");
  await seedState(page, old);
  const errors = await openApp(page);
  const views = await page.evaluate(() => VIEWS.map(v => v[0]).concat(["list"]));
  expect(views).not.toContain("pomodoro");
  const found = [];
  const check = async where => {
    const txt = await page.evaluate(() => document.body.innerText + " " + [...document.querySelectorAll("[title],[aria-label]")].map(e => (e.title || "") + " " + (e.getAttribute("aria-label") || "")).join(" "));
    if (/pomodoro|pomo\b/i.test(txt)) found.push(where);
  };
  for (const v of views.concat(["subject/s-pe", "eval/e-pe2", "project/p-tp"])) {
    await page.evaluate(v => { const [a, b] = v.split("/"); go(a, b); }, v);
    await page.waitForTimeout(40);
    await check(v);
  }
  await page.evaluate(() => openTaskEditor("t-3")); await check("editor de tarea"); await page.evaluate(() => closeModal());
  await page.evaluate(() => showShortcuts()); await check("atajos"); await page.evaluate(() => closeModal());
  await page.evaluate(() => openSearch("cmd")); await page.fill("#sinput", "pomo"); await check("acciones rápidas");
  expect(found).toEqual([]);
  expect(errors).toEqual([]);
});

test("el link viejo #/pomodoro no rompe nada y la tecla P no hace nada", async ({ page }) => {
  const errors = await openApp(page);
  await page.goto("/#/pomodoro");
  await page.waitForFunction(() => typeof state !== "undefined" && state && state.tasks);
  await expect(page.locator("#view h2").first()).toBeVisible();
  await page.keyboard.press("p");
  expect(await page.evaluate(() => location.hash)).toBe("#/pomodoro");
  expect(errors).toEqual([]);
});

test("las sesiones con pomodoros se conservan y siguen contando como tiempo estudiado", async ({ page }) => {
  const old = fixture("estado-v2.6.json");
  await seedState(page, old);
  const errors = await openApp(page);
  const r = await page.evaluate(() => ({ n: state.sessions.length, pomos: state.sessions.reduce((a, s) => a + (s.pomos || 0), 0), min: minsBetween("2026-11-02", "2026-11-03"), timer: !!state.timer, cfg: state.settings.pomo }));
  expect(r).toEqual({ n: 4, pomos: 7, min: 75, timer: true, cfg: { f: 30, s: 5, l: 15, c: 4 } });
  expectNothingLost(old, await page.evaluate(() => state), ["meta.lastSave", "meta.lastBackup"]);
  expect(errors).toEqual([]);
});

test("'Registrar tiempo' desde la tarea suma a la tarea y a la materia", async ({ page }) => {
  const errors = await openApp(page);
  const id = await page.evaluate(() => { const s = state.subjects[0]; return quickAddTask({ title: "Guía 3", subjectId: s.id, date: todayISO(), estMin: 60 }).id; });
  await page.evaluate(id => openTaskEditor(id), id);
  await page.locator("#modalbox").getByRole("button", { name: "Registrar tiempo" }).click();
  await expect(page.locator("#ms_link")).toHaveValue("t:" + id);
  await page.fill("#ms_min", "45");
  await page.locator("#modalbox").getByRole("button", { name: "Registrar", exact: true }).click();
  const r = await page.evaluate(id => { const t = taskById(id); return { real: t.realMin, ses: state.sessions.filter(s => s.taskId === id).map(s => [s.min, s.manual, s.subjectId === t.subjectId]) }; }, id);
  expect(r).toEqual({ real: 45, ses: [[45, true, true]] });
  expect(errors).toEqual([]);
});

test("'Estudio de hoy' reparte minutos (no pomodoros) y crea las tareas", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => go("home"));
  await page.fill("#sb_from", "14:00"); await page.fill("#sb_to", "16:00");
  await page.getByRole("button", { name: "Agregar bloque" }).click();
  await expect(page.locator("#view")).toContainText("2 h disponibles");
  const inp = page.locator(".dist-inp").first();
  await inp.fill("90");
  await inp.dispatchEvent("input");
  await expect(page.locator("#distLeft")).toHaveText("quedan 30 m");
  await page.getByRole("button", { name: "Crear tareas para hoy" }).click();
  const t = await page.evaluate(() => state.tasks.filter(t => t.title === "Sesión de estudio").map(t => [t.estMin, t.date === todayISO()]));
  expect(t).toEqual([[90, true]]);
  expect(errors).toEqual([]);
});
