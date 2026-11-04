// B2 · Comentarios en tareas: agregar, editar, borrar (con deshacer) e indicador en la fila.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, reload } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T18:30:00-03:00"); });

async function setup(page) {
  const errors = await openApp(page);
  const id = await page.evaluate(() => quickAddTask({ title: "TP de BD", date: todayISO() }).id);
  await page.evaluate(id => openTaskEditor(id), id);
  return { errors, id };
}
const comments = (page, id) => page.evaluate(id => (taskById(id).comments || []).map(c => c.text), id);

test("agregar comentarios: se ven con fecha y hora y persisten", async ({ page }) => {
  const { errors, id } = await setup(page);
  await page.fill("#te_newcmt", "Preguntar al profe por la normalización");
  await page.getByRole("button", { name: "Comentar" }).click();
  await page.fill("#te_newcmt", "Ya lo pregunté");
  await page.press("#te_newcmt", "Control+Enter");
  await expect(page.locator("#te_comments .cmt")).toHaveCount(2);
  await expect(page.locator("#te_comments .cmt").first()).toContainText("mié 4 nov · 18:30");
  await expect(page.locator("#te_newcmt")).toHaveValue("");
  // Un comentario vacío no se agrega
  await page.getByRole("button", { name: "Comentar" }).click();
  expect(await comments(page, id)).toEqual(["Preguntar al profe por la normalización", "Ya lo pregunté"]);
  await reload(page);
  expect(await comments(page, id)).toEqual(["Preguntar al profe por la normalización", "Ya lo pregunté"]);
  expect(errors).toEqual([]);
});

test("editar un comentario lo marca como editado", async ({ page }) => {
  const { errors, id } = await setup(page);
  await page.fill("#te_newcmt", "Primera versión");
  await page.getByRole("button", { name: "Comentar" }).click();
  await page.locator("#te_comments").getByRole("button", { name: "Editar" }).click();
  await page.fill("#te_cmt_edit", "Versión corregida");
  await page.locator("#te_comments").getByRole("button", { name: "Guardar" }).click();
  expect(await comments(page, id)).toEqual(["Versión corregida"]);
  await expect(page.locator("#te_comments .cmt-meta")).toContainText("editado");
  // Cancelar la edición no cambia nada
  await page.locator("#te_comments").getByRole("button", { name: "Editar" }).click();
  await page.fill("#te_cmt_edit", "otra cosa");
  await page.locator("#te_comments").getByRole("button", { name: "Cancelar" }).click();
  expect(await comments(page, id)).toEqual(["Versión corregida"]);
  expect(errors).toEqual([]);
});

test("borrar un comentario tiene deshacer", async ({ page }) => {
  const { errors, id } = await setup(page);
  for (const x of ["uno", "dos", "tres"]) { await page.fill("#te_newcmt", x); await page.getByRole("button", { name: "Comentar" }).click(); }
  await page.locator("#te_comments .cmt", { hasText: "dos" }).getByRole("button", { name: "Borrar" }).click();
  expect(await comments(page, id)).toEqual(["uno", "tres"]);
  await page.locator("#toast").getByRole("button", { name: "Deshacer" }).click();
  expect(await comments(page, id)).toEqual(["uno", "dos", "tres"]);
  await expect(page.locator("#te_comments .cmt")).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("la fila de la tarea muestra un indicador sutil con la cantidad", async ({ page }) => {
  const { errors } = await setup(page);
  await page.evaluate(() => go("today"));
  const row = page.locator("#view .task", { hasText: "TP de BD" });
  await expect(row.locator(".cmtcount")).toHaveCount(0);
  await page.fill("#te_newcmt", "hola"); await page.getByRole("button", { name: "Comentar" }).click();
  await page.fill("#te_newcmt", "chau"); await page.getByRole("button", { name: "Comentar" }).click();
  await page.evaluate(() => closeModal());
  await expect(row.locator(".cmtcount")).toHaveText("2");
  await expect(row.locator(".cmtcount")).toHaveAttribute("title", "2 comentarios");
  expect(errors).toEqual([]);
});

test("el texto del comentario se escapa (no se interpreta HTML)", async ({ page }) => {
  const { errors, id } = await setup(page);
  await page.fill("#te_newcmt", "<b>negrita</b>\nsegunda línea");
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.locator("#te_comments .cmt-text b")).toHaveCount(0);
  await expect(page.locator("#te_comments .cmt-text")).toContainText("<b>negrita</b>");
  await expect(page.locator("#te_comments .cmt-text br")).toHaveCount(1);
  expect(errors).toEqual([]);
});
