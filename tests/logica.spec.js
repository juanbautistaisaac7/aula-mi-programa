// L1 · Errores de lógica y de experiencia. L1a: varios parciales el mismo día.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, fixture, seedState } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

const EV = (id, name, subjectId, date) => ({ id, name, subjectId, projectId: null, date, kind: "parcial", status: "prep", topics: [], notes: "" });

async function withEvals(page, evals) {
  const s = fixture("estado-v2.6.json");
  s.evals = s.evals.filter(e => ["aprob", "desaprob", "rendido"].includes(e.status)).concat(evals);
  await seedState(page, s);
  return openApp(page);
}

test("dos parciales el mismo día: arriba se ven los dos, no solo el primero", async ({ page }, info) => {
  const errors = await withEvals(page, [EV("x1", "Primer parcial Economía", "s-ec", "2026-11-06"), EV("x2", "Parcial AN", "s-an", "2026-11-06"), EV("x3", "Parcial BD", "s-bd", "2026-11-20")]);
  expect(await page.evaluate(() => evalGroupLabel(evalsSameDay(upcomingEvals(60))))).toBe("Economía y ANP");
  if (info.project.name === "desktop") {
    await expect(page.locator("#nextEv")).toHaveText("Economía y ANP · en 2 días");
    await expect(page.locator("#nextEv")).toHaveAttribute("title", /Primer parcial Economía · Parcial AN/);
  }
  // Inicio: la sugerencia los nombra juntos (en 2 días ≤ 3)
  await page.evaluate(() => go("home"));
  await expect(page.locator("#view")).toContainText("Economía y ANP son en 2 días");
  expect(errors).toEqual([]);
});

test("nombres que entran, tres y cuatro el mismo día, y dos de la misma materia", async ({ page }) => {
  await withEvals(page, []);
  const r = await page.evaluate(() => {
    const E = (name, subjectId) => ({ id: name, name, subjectId, date: "2026-11-06", status: "prep" });
    return [
      evalGroupLabel([E("P1", "s-ec"), E("P2", "s-bd")]),
      evalGroupLabel([E("P1", "s-ec"), E("P2", "s-bd"), E("P3", "s-pe")]),
      evalGroupLabel([E("P1", "s-ec"), E("P2", "s-bd"), E("P3", "s-pe"), E("P4", "s-ds")]),
      evalGroupLabel([E("Teoría", "s-pe"), E("Práctica", "s-pe")]),
      evalGroupLabel([E("Solo uno", "s-pe")]),
      whenTxt(0, true), whenTxt(1), whenTxt(5)
    ];
  });
  expect(r).toEqual(["Economía y Bases de Datos", "Economía, Bases de Datos y PE", "4 parciales", "Teoría y Práctica", "Solo uno", "HOY", "mañana", "en 5 días"]);
});

test("detalle de materia: si tiene dos el mismo día muestra las dos; 1 tarea atrasada en singular", async ({ page }) => {
  const errors = await withEvals(page, [EV("x1", "Parcial teoría", "s-pe", "2026-11-05"), EV("x2", "Parcial práctica", "s-pe", "2026-11-05")]);
  await page.evaluate(() => go("subject", "s-pe"));
  await expect(page.locator("#view")).toContainText("Próximas evaluaciones");
  await expect(page.locator("#view")).toContainText("Parcial teoría");
  await expect(page.locator("#view")).toContainText("Parcial práctica");
  await expect(page.locator("#view")).not.toContainText("en 1 días");
  const one = await page.evaluate(() => suggestNow([], [{ id: "a" }], [], []));
  expect(one).toContain("1 tarea atrasada");
  expect(errors).toEqual([]);
});
