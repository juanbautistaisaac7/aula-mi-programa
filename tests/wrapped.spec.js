// G2 · "Tu año en Aula": resumen del año en historias a pantalla completa.
const { test, expect } = require("@playwright/test");
const { openApp, setClock, fixture, seedState } = require("./helpers");

test.beforeEach(async ({ page }) => { await setClock(page, "2026-11-04T11:00:00-03:00"); });

test("los números del resumen con el fixture (calculados a mano)", async ({ page }) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  const d = await page.evaluate(() => wrappedData(activeYearId()));
  expect(d.total).toBe(285);                 // 50 + 25 + 90 + 120
  expect(d.activeDays).toBe(4);
  expect(d.topSubject.pct).toBe(32);         // AN: 90 de 285
  expect(d.topSubject.min).toBe(90);
  expect(d.bestMonth).toEqual({ ym: "2026-07", min: 120 });
  expect(d.bestDay).toEqual({ d: "2026-07-20", min: 120 });
  expect(d.tasksDone).toBe(7);               // 3 simples + 3 + 1 de las que se repiten (la archivada no cuenta)
  expect(d.streak).toBe(3);                  // 26-28 oct (y 2-4 nov)
  expect(d.passed).toBe(1);
  expect(d.rendered).toBe(4);
  expect(d.best).toEqual({ name: "Primer parcial Economía", grade: 9 });
  expect(d.slot).toBeNull();                 // menos de 5 sesiones medidas: no se adivina
  expect(d.ongoing).toBe(true);
  const slides = await page.evaluate(() => wrappedSlides(wrappedData(activeYearId())).map(s => [s.k, s.big, s.unit || "", s.sub || ""]));
  expect(slides.map(s => s[0])).toEqual(["Hasta ahora", "Estudiaste", "Tu materia del año", "Tu mes más intenso", "Completaste", "Tu racha más larga", "Aprobaste", "3.º año · 2026"]);
  expect(slides[1]).toEqual(["Estudiaste", "4,8", "horas", "en 4 días distintos. Como ver 2 películas seguidas."]);
  expect(slides[3][1]).toBe("Julio");
  expect(slides[3][3]).toContain("lunes 20 de julio");
  expect(slides[6][3]).toBe("Tu mejor nota: 9 en «Primer parcial Economía».");
  expect(errors).toEqual([]);
});

test("se recorre entera tocando, con teclado vuelve y cierra, y no cambia ningún dato", async ({ page }, info) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  const before = await page.evaluate(() => JSON.stringify(fullState()));
  await page.evaluate(() => go("stats"));
  await page.getByRole("button", { name: "Tu año en Aula" }).click();
  const dlg = page.getByRole("dialog", { name: /Tu año en Aula/ });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator(".wcount")).toHaveText("1 / 8");
  for (let i = 2; i <= 8; i++) {
    if (info.project.name === "mobile") await dlg.locator(".wnext").tap(); else await dlg.locator(".wnext").click();
    await expect(dlg.locator(".wcount")).toHaveText(i + " / 8");
  }
  await expect(dlg).toContainText("Y el año sigue");
  await page.keyboard.press("ArrowLeft");
  await expect(dlg.locator(".wcount")).toHaveText("7 / 8");
  await page.keyboard.press("ArrowRight");
  await dlg.getByRole("button", { name: "Ver de nuevo" }).click();
  await expect(dlg.locator(".wcount")).toHaveText("1 / 8");
  await page.keyboard.press("n"); // atajo de "nueva tarea": no tiene que abrir nada detrás
  await expect(page.locator("#modalbg")).not.toHaveClass(/open/);
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  // tocar "siguiente" en la última pantalla también cierra
  await page.evaluate(() => { openWrapped(); for (let i = 0; i < 7; i++) wrappedGo(1); wrappedGo(1); });
  await expect(page.locator("#wrapped")).not.toHaveClass(/open/);
  expect(await page.evaluate(() => JSON.stringify(fullState()))).toBe(before);
  expect(errors).toEqual([]);
});

test("sin datos no se rompe: portada y un cierre honesto", async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => openWrapped());
  const dlg = page.getByRole("dialog");
  await expect(dlg.locator(".wcount")).toHaveText("1 / 2");
  await expect(dlg).not.toContainText("Tocá para empezar");
  await dlg.locator(".wnext").click();
  await expect(dlg).toContainText("Todavía no hay nada que contar");
  await expect(dlg).not.toContainText(/NaN|undefined|null/);
  expect(errors).toEqual([]);
});

test("a qué hora estudiás: con 5 sesiones medidas de noche dice «Sos de estudiar de noche»; las cargadas a mano no cuentan", async ({ page }) => {
  const errors = await openApp(page);
  const r = await page.evaluate(() => {
    const at = (d, h) => new Date(d + "T" + String(h).padStart(2, "0") + ":30:00").getTime();
    for (let i = 1; i <= 5; i++) state.sessions.push({ id: "n" + i, date: "2026-10-0" + i, min: 60, ts: at("2026-10-0" + i, 22), manual: false });
    state.sessions.push({ id: "m1", date: "2026-10-09", min: 600, ts: at("2026-10-09", 9), manual: true });
    const d = wrappedData(activeYearId());
    return { slot: d.slot, slide: wrappedSlides(d).find(s => s.k === "A qué hora rendís") };
  });
  expect(r.slot).toEqual({ n: "noche", min: 300 });
  expect(r.slide.big).toBe("Sos de estudiar de noche");
  expect(r.slide.sub).toBe("5 h de tu tiempo medido fue de noche.");
  expect(r.slide.sub).not.toMatch(/\d\.\d/); // decimales con coma, nunca "4.8 h"
  expect(errors).toEqual([]);
});

test("el resumen de un año anterior se ve desde «Tus años» sin cambiar el año que estás mirando", async ({ page }) => {
  const s = fixture("estado-v2.6.json");
  s.years = [{ id: "y0", name: "2.º año · 2025", start: "2025-03-01", end: "2026-02-28" }, { id: "y1", name: "3.º año · 2026", start: "2026-03-01", end: "2027-02-28" }];
  s.sessions.push({ id: "z1", date: "2026-04-01", min: 999, subjectId: null, yearId: "y1", ts: 1, manual: true });
  await seedState(page, s);
  const errors = await openApp(page);
  expect(await page.evaluate(() => activeYearId())).toBe("y1");
  const d = await page.evaluate(() => ({ y0: wrappedData("y0").total, y1: wrappedData("y1").total }));
  expect(d).toEqual({ y0: 285, y1: 999 });
  await page.evaluate(() => openYearPicker());
  await page.getByRole("button", { name: "Resumen de 2.º año · 2025" }).click();
  const dlg = page.getByRole("dialog", { name: "Tu año en Aula · 2.º año · 2025" });
  await expect(dlg).toContainText("Resumen del año"); // ya terminó: no dice "hasta ahora"
  await expect(dlg).not.toContainText("todavía no terminó");
  expect(await page.evaluate(() => activeYearId())).toBe("y1");
  expect(errors).toEqual([]);
});

test("G2b · compartir una pantalla: en el iPhone usa la hoja de compartir con un PNG de 1080×1920", async ({ page }) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  await page.evaluate(() => {
    window.__shared = null;
    navigator.canShare = d => !!(d && d.files && d.files.length);
    navigator.share = async d => { const f = d.files[0]; const bmp = await createImageBitmap(f); window.__shared = { name: f.name, type: f.type, w: bmp.width, h: bmp.height, size: f.size, title: d.title }; };
    openWrapped(); wrappedGo(1);
  });
  await page.getByRole("button", { name: "Compartir esta pantalla como imagen" }).click();
  await page.waitForFunction(() => window.__shared);
  const sh = await page.evaluate(() => window.__shared);
  expect(sh).toMatchObject({ name: "aula-3-ano-2026-2.png", type: "image/png", w: 1080, h: 1920, title: "Mi año en Aula" });
  expect(sh.size).toBeGreaterThan(20000); // tiene contenido (degradé + textos), no es una imagen vacía
  // cancelar la hoja de compartir no descarga nada ni muestra error
  await page.evaluate(() => { navigator.share = async () => { const e = new Error("x"); e.name = "AbortError"; throw e; }; });
  let downloaded = false; page.on("download", () => { downloaded = true; });
  await page.getByRole("button", { name: "Compartir esta pantalla como imagen" }).click();
  await page.waitForTimeout(400);
  expect(downloaded).toBe(false);
  expect(errors).toEqual([]);
});

test("G2b · sin hoja de compartir (compu), la pantalla se descarga como PNG", async ({ page }) => {
  await seedState(page, fixture("estado-v2.6.json"));
  const errors = await openApp(page);
  await page.evaluate(() => { navigator.canShare = undefined; openWrapped(); for (let i = 0; i < 7; i++) wrappedGo(1); });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Compartir esta pantalla como imagen" }).click()]);
  expect(dl.suggestedFilename()).toBe("aula-3-ano-2026-8.png");
  const buf = require("fs").readFileSync(await dl.path());
  expect(buf.slice(1, 4).toString()).toBe("PNG");
  expect(buf.readUInt32BE(16)).toBe(1080); expect(buf.readUInt32BE(20)).toBe(1920);
  await expect(page.locator("#toast")).toContainText("Imagen guardada");
  // todas las pantallas se pueden dibujar (también la de una materia con su color y textos largos)
  const ok = await page.evaluate(() => wrappedSlides(wrappedData(activeYearId())).every(s => wrappedCanvas(s, "3.º año · 2026").width === 1080));
  expect(ok).toBe(true);
  expect(errors).toEqual([]);
});

test("un solo día de estudio en una sola materia: textos que tienen sentido", async ({ page }) => {
  const errors = await openApp(page);
  const subs = await page.evaluate(() => {
    state.sessions.push({ id: "q", date: todayISO(), min: 300, subjectId: state.subjects[0].id, ts: Date.now() });
    return wrappedSlides(wrappedData(activeYearId())).map(s => s.sub || "");
  });
  expect(subs[1]).toBe("en un solo día. Como ver 2 películas seguidas.");
  expect(subs[2]).toBe("5 h · todo tu tiempo de estudio fue para esta materia");
  expect(subs[3]).toBe("5 h, todas el miércoles 4 de noviembre.");
  expect(errors).toEqual([]);
});
