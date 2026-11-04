// C3 · Series bien integradas: "3 de 5" desde cualquier tarea, preguntar
// "¿solo esta / esta y las siguientes / todas?" y una vista Series simple.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, fixture, seedState } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

async function serie(page) {
  return page.evaluate(() => {
    const ids = [];
    for (const d of ["2026-11-10", "2026-11-13", "2026-11-16", "2026-11-19", "2026-11-22"])
      ids.push(quickAddTask({ title: "Practicar", date: d, estMin: 60, seriesId: "sr-c3" }).id);
    render(); return ids;
  });
}
const mins = page => page.evaluate(() => state.tasks.filter(t => t.seriesId === "sr-c3").sort((a, b) => a.date.localeCompare(b.date)).map(t => t.estMin));

test("el editor de una tarea muestra 'Parte de una serie · 3 de 5' y abre la serie", async ({ page }) => {
  const errors = await openApp(page);
  const ids = await serie(page);
  await page.evaluate(id => openTaskEditor(id), ids[2]);
  await expect(page.locator(".serbanner")).toContainText("Parte de una serie · 3 de 5");
  // la "Recurrencia" vieja no se ofrece en una tarea de serie (convertiría una ocurrencia en otra repetición)
  await expect(page.locator("#te_rec")).toBeHidden();
  await page.getByRole("button", { name: "Ver la serie" }).click();
  await expect(page.locator("#sr_occ .occ")).toHaveCount(5);
  // una tarea suelta no muestra nada
  const solo = await page.evaluate(() => quickAddTask({ title: "Suelta", date: "2026-11-10" }).id);
  await page.evaluate(id => openTaskEditor(id), solo);
  await expect(page.locator(".serbanner")).toHaveCount(0);
  await expect(page.locator("#te_rec")).toBeVisible();
  expect(errors).toEqual([]);
});

test("la fila de la tarea muestra un indicador sutil 3/5", async ({ page }) => {
  const errors = await openApp(page);
  await serie(page);
  await page.evaluate(() => go("list"));
  await expect(page.locator(".task .serpos")).toHaveCount(5);
  await expect(page.locator(".task", { hasText: "Practicar" }).nth(2).locator(".serpos")).toHaveText("3/5");
  expect(errors).toEqual([]);
});

test("cambiar minutos de una: solo esta / esta y las siguientes / todas, con deshacer", async ({ page }) => {
  const errors = await openApp(page);
  const ids = await serie(page);
  const editar = async (i, min) => {
    await page.evaluate(id => openTaskEditor(id), ids[i]);
    await page.fill("#te_min", String(min));
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.locator("#confirmbox")).toContainText("Esta tarea es parte de una serie");
    await expect(page.locator("#confirmbox")).toContainText("Cambiaste minutos");
  };
  await editar(1, 70);
  await page.getByRole("button", { name: "Solo a esta" }).click();
  expect(await mins(page)).toEqual([60, 70, 60, 60, 60]);
  await editar(2, 90);
  await page.getByRole("button", { name: "A esta y las siguientes (3)" }).click();
  expect(await mins(page)).toEqual([60, 70, 90, 90, 90]);
  await page.locator("#toast button", { hasText: "Deshacer" }).click();
  expect(await mins(page)).toEqual([60, 70, 90, 60, 60]); // deshace las otras; esta queda como la guardaste
  await editar(0, 45);
  await page.getByRole("button", { name: "A todas las de la serie (5)" }).click();
  expect(await mins(page)).toEqual([45, 45, 45, 45, 45]);
  // Cancelar no guarda nada
  await editar(4, 10);
  await page.getByRole("button", { name: "Cancelar" }).last().click();
  expect(await mins(page)).toEqual([45, 45, 45, 45, 45]);
  expect(errors).toEqual([]);
});

test("cambiar solo la fecha o el estado no pregunta; el título a todas sí", async ({ page }) => {
  const errors = await openApp(page);
  const ids = await serie(page);
  await page.evaluate(id => openTaskEditor(id), ids[1]);
  await page.fill("#te_date", "2026-11-14");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator("#confirmbg")).not.toHaveClass(/open/);
  await expect(page.locator("#modalbg")).not.toHaveClass(/open/);
  expect(await page.evaluate(id => taskById(id).date, ids[1])).toBe("2026-11-14");
  await page.evaluate(id => openTaskEditor(id), ids[3]);
  await page.fill("#te_title", "Practicar parciales");
  await page.fill("#te_time", "18:00");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator("#confirmbox")).toContainText("Cambiaste título y hora");
  await page.getByRole("button", { name: "A todas las de la serie (5)" }).click();
  const r = await page.evaluate(() => state.tasks.filter(t => t.seriesId === "sr-c3").map(t => t.title + "@" + t.time + "@" + t.date).sort());
  expect(r).toEqual(["Practicar parciales@18:00@2026-11-10", "Practicar parciales@18:00@2026-11-14", "Practicar parciales@18:00@2026-11-16", "Practicar parciales@18:00@2026-11-19", "Practicar parciales@18:00@2026-11-22"]);
  expect(errors).toEqual([]);
});

test("la vista Series es una lista simple; tocar una fila abre su editor", async ({ page }) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  await page.evaluate(() => go("series"));
  await expect(page.locator("#view h2")).toHaveText("Series");
  const row = page.locator(".serrow", { hasText: "Repasar unidad 3" });
  await expect(row).toContainText("todos los días");
  await expect(row).toContainText("2/5 hechas");
  await row.click();
  await expect(page.locator("#sr_occ .occ")).toHaveCount(5);
  expect(errors).toEqual([]);
});

test("una serie sin fin dice su regla y lleva a editar la tarea", async ({ page }) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  await page.evaluate(() => go("series"));
  const row = page.locator(".serrow", { hasText: "Leer apunte del día" });
  await expect(row).toContainText("todos los días, sin fin");
  await row.click();
  await expect(page.locator("#modalbox")).toContainText("todos los días, sin fin");
  await page.getByRole("button", { name: "Editar la tarea" }).click();
  await expect(page.locator("#modalbox h3").first()).toHaveText("Editar tarea");
  await expect(page.locator("#te_title")).toHaveValue("Leer apunte del día");
  expect(errors).toEqual([]);
});
