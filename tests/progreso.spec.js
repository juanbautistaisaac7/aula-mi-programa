// D2a · Progreso: pocos gráficos que responden preguntas reales, con números correctos para el fixture.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, seedState, fixture } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

test("los números de Progreso son correctos con el fixture", async ({ page }) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  const p = await page.evaluate(() => progressData());
  // semana lun 2 – dom 8 nov: 25 m (lun) + 50 m (mar) = 75 m; semana pasada hasta el mié: 90 m (mié 28)
  expect(p.week.min).toBe(75);
  expect(p.week.lastSame).toBe(90);
  expect(p.week.days.map(d => d.min)).toEqual([25, 50, 0, 0, 0, 0, 0]);
  expect(p.week.days.map(d => d.future)).toEqual([false, false, false, true, true, true, true]);
  // racha: hoy todavía no, ayer y antes de ayer sí
  expect(p.streak).toBe(2);
  expect(p.last28.filter(Boolean).length).toBe(3); // 28 oct, 2 nov y 3 nov
  // parciales que vienen (sin los rendidos), en orden
  expect(p.exams.map(x => [x.e.name, x.days])).toEqual([["Segundo parcial PE", 8], ["Recuperatorio AN", 14], ["Parcial BD", 21]]);
  // por materia, últimos 14 días
  const m = Object.fromEntries(p.subjects.map(x => [x.s.short, x.min]));
  expect(m.PE).toBe(50); expect(m.BD).toBe(25); expect(m.ANP).toBe(90);
  expect(p.overdue).toBe(await page.evaluate(() => overdueTasks().length));

  await page.evaluate(() => go("stats"));
  const v = page.locator("#view");
  await expect(v.locator(".pg-week .pg-big")).toHaveText("1 h 15 m");
  await expect(v.locator(".pg-week .pg-sub")).toContainText("15 m menos que a esta altura de la semana pasada");
  await expect(v.locator(".pg-exams .pg-exam").first()).toContainText("Segundo parcial PE");
  await expect(v.locator(".pg-exams .pg-exam").first()).toContainText("8 días");
  await expect(v.locator(".pg-streak .pg-big")).toHaveText("2 días");
  await expect(v.locator(".pg-dot.on")).toHaveCount(3);
  // lo viejo sigue a mano, abajo
  await v.getByRole("link", { name: /Estadísticas detalladas/ }).click();
  await expect(page).toHaveURL(/#\/stats\/detalle/);
  await expect(v.locator("h2")).toHaveText("Estadísticas detalladas");
  expect(errors).toEqual([]);
});

test("Progreso sin datos muestra un estado vacío lindo, sin errores", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => go("stats"));
  const v = page.locator("#view");
  await expect(v.locator("h2")).toHaveText("Progreso");
  await expect(v.locator(".pg-week .pg-big")).toHaveText("0 m");
  await expect(v.locator(".pg-week")).toContainText("Todavía no registraste tiempo esta semana");
  await expect(v.locator(".pg-exams")).toContainText("No tenés parciales por delante");
  await expect(v.locator(".pg-late .pg-big")).toHaveText("Al día");
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("Progreso con atrasadas: las cuenta y lleva a resolverlas", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    quickAddTask({ title: "Vieja 1", date: "2026-11-01", estMin: 30 });
    quickAddTask({ title: "Vieja 2", date: "2026-11-02", estMin: 45 });
    change(); go("stats");
  });
  const late = page.locator(".pg-late");
  await expect(late.locator(".pg-big")).toHaveText("2");
  await expect(late).toContainText("1 h 15 m");
  await late.getByRole("button", { name: "Ver atrasadas" }).click();
  await expect(page).toHaveURL(/#\/today/);
  expect(errors).toEqual([]);
});

// D2b · Estadísticas detalladas: solo lo que responde algo; fuera lo repetido y lo del temporizador viejo.
test("Estadísticas detalladas queda corta: 4 números, evolución y horas por materia", async ({ page }) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  await page.evaluate(() => go("stats", "detalle"));
  const v = page.locator("#view");
  await expect(v.locator(".statgrid .card")).toHaveCount(4);
  await expect(v).toContainText("Evolución");
  await expect(v).toContainText("Horas por materia");
  for (const fuera of ["¿De dónde vienen las horas?", "temporizador", "Distribución del tiempo", "Detalle por materia", "Qué tipo de trabajo", "Cumplimiento de hábitos", "mediana diaria"])
    await expect(v).not.toContainText(fuera);
  await v.getByRole("button", { name: "Volver a Progreso" }).click();
  await expect(v.locator("h2")).toHaveText("Progreso");
  expect(errors).toEqual([]);
});
