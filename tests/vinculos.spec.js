// B3 · Tareas → parciales → materias, sin parciales/proyectos cerrados en los selectores.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, fixture, seedState } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await setClock(page, "2026-11-04T11:00:00-03:00");
  await seedState(page, fixture("estado-v2.6.json"));
});
const opts = (page, sel) => page.locator(sel + " option").evaluateAll(os => os.map(o => o.value).filter(Boolean));

test("modal rápido: al elegir materia se ofrecen solo sus parciales abiertos", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => openQuickTask("2026-11-05"));
  // Sin materia: todos los abiertos (ni aprobados, ni desaprobados, ni rendidos)
  expect((await opts(page, "#qt_eval")).sort()).toEqual(["e-an2", "e-bd1", "e-pe2"]);
  await page.selectOption("#qt_link", "s:s-an");
  expect(await opts(page, "#qt_eval")).toEqual(["e-an2"]); // e-an1 está desaprobado
  await page.selectOption("#qt_eval", "e-an2");
  await page.fill("#qt_title", "Guía de recuperatorio");
  await page.press("#qt_title", "Enter");
  const t = await page.evaluate(() => state.tasks.find(x => x.title === "Guía de recuperatorio"));
  expect([t.subjectId, t.evalId, t.planId]).toEqual(["s-an", "e-an2", null]);
  expect(errors).toEqual([]);
});

test("cambiar la materia limpia un parcial que no es de esa materia; elegir parcial completa la materia", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => openQuickTask());
  await page.selectOption("#qt_eval", "e-pe2");
  await expect(page.locator("#qt_link")).toHaveValue("s:s-pe");
  await page.selectOption("#qt_link", "s:s-bd");
  await expect(page.locator("#qt_eval")).toHaveValue("");
  expect(await opts(page, "#qt_eval")).toEqual(["e-bd1"]);
  expect(errors).toEqual([]);
});

test("una tarea vinculada a un parcial ya aprobado conserva y muestra el vínculo", async ({ page }) => {
  const errors = await openApp(page);
  const id = await page.evaluate(() => quickAddTask({ title: "Repaso EC", subjectId: "s-ec", evalId: "e-ec1", date: todayISO() }).id);
  await page.evaluate(id => openTaskEditor(id), id);
  await expect(page.locator("#te_eval")).toHaveValue("e-ec1");
  await expect(page.locator("#te_eval option:checked")).toContainText("aprobado");
  await page.locator("#modalbox").getByRole("button", { name: "Guardar" }).click();
  expect(await page.evaluate(id => taskById(id).evalId, id)).toBe("e-ec1");
  // Otra tarea de Economía no lo ofrece
  const id2 = await page.evaluate(() => quickAddTask({ title: "Otra EC", subjectId: "s-ec", date: todayISO() }).id);
  await page.evaluate(id => openTaskEditor(id), id2);
  expect(await opts(page, "#te_eval")).toEqual([]);
  expect(errors).toEqual([]);
});

test("proyectos terminados o archivados no se ofrecen, salvo el ya vinculado", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => openQuickTask());
  const links = await opts(page, "#qt_link");
  expect(links).toContain("p:p-tp");
  expect(links).not.toContain("p:p-done");
  expect(links).not.toContain("p:p-arch");
  const id = await page.evaluate(() => quickAddTask({ title: "Ajustes MQTT", projectId: "p-done" }).id);
  await page.evaluate(id => openTaskEditor(id), id);
  await expect(page.locator("#te_link")).toHaveValue("p:p-done");
  expect(errors).toEqual([]);
});

test("el detalle del parcial muestra las tareas vinculadas a mano y su progreso", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    quickAddTask({ title: "Vinculada a mano 1", subjectId: "s-bd", evalId: "e-bd1", date: "2026-11-10" });
    const t = quickAddTask({ title: "Vinculada a mano 2", subjectId: "s-bd", evalId: "e-bd1", date: "2026-11-11" });
    t.status = "done"; t.doneAt = "2026-11-04";
    go("eval", "e-bd1");
  });
  await expect(page.locator("#view")).toContainText("Vinculada a mano 1");
  await expect(page.locator("#view")).toContainText("Vinculada a mano 2");
  await expect(page.locator("#view .evstat", { hasText: "tareas" }).locator(".evsn")).toHaveText("1/2"); // X3: la cifra vive en la fila compacta
  // "+ Tarea" desde el parcial deja el parcial elegido
  await page.locator("#view").getByRole("button", { name: "+ Tarea" }).click();
  await expect(page.locator("#qt_eval")).toHaveValue("e-bd1");
  await expect(page.locator("#qt_link")).toHaveValue("s:s-bd");
  expect(errors).toEqual([]);
});

test("regenerar el plan no borra las tareas vinculadas a mano", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => openQuickTask());
  await page.selectOption("#qt_eval", "e-pe2");
  await page.fill("#qt_title", "Mía, no del plan");
  await page.press("#qt_title", "Enter");
  // "Ejercicios guía 5" (t-2) sí es del plan generado: esa se reemplaza
  const r = await page.evaluate(() => { generatePlan("e-pe2", { replaceExisting: true, intensity: "m" }); return { mine: state.tasks.some(t => t.title === "Mía, no del plan"), gen: state.tasks.some(t => t.id === "t-2") }; });
  expect(r).toEqual({ mine: true, gen: false });
  expect(errors).toEqual([]);
});
