// S1 · La función de Cloudflare (functions/api/sync.js) con un KV falso en Node.
const { test, expect } = require("@playwright/test");
const path = require("path");
const { pathToFileURL } = require("url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "functions", "api", "sync.js")).href);
function fakeKV() { const m = new Map(); return { m, get: async k => m.has(k) ? m.get(k) : null, put: async (k, v) => { m.set(k, v); } }; }
const KEY = "abcdefghijklmnopqrstuvwxyz012345";
const req = (method, body, key = KEY) => new Request("https://aula.test/api/sync", {
  method, headers: key ? { authorization: "Bearer " + key, "content-type": "application/json" } : {}, body: body == null ? undefined : (typeof body === "string" ? body : JSON.stringify(body))
});

test.describe("función de sincronización", () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== "desktop", "corre una sola vez (no usa navegador)"); });

  test("GET vacío, PUT, GET; conflicto de versión", async () => {
    const { onRequest } = await load();
    const env = { AULA_KV: fakeKV() };
    let r = await onRequest({ request: req("GET"), env });
    expect(r.status).toBe(404);
    r = await onRequest({ request: req("PUT", { baseVersion: 0, data: { tasks: [{ id: "a" }] } }), env });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ version: 1 });
    r = await onRequest({ request: req("GET"), env });
    const doc = await r.json();
    expect(doc.version).toBe(1);
    expect(doc.data.tasks[0].id).toBe("a");
    // otro dispositivo con una versión vieja → 409 con lo que hay
    r = await onRequest({ request: req("PUT", { baseVersion: 0, data: { tasks: [] } }), env });
    expect(r.status).toBe(409);
    const c = await r.json();
    expect(c.version).toBe(1);
    expect(c.data.tasks).toHaveLength(1);
    r = await onRequest({ request: req("PUT", { baseVersion: 1, data: { tasks: [] } }), env });
    expect((await r.json()).version).toBe(2);
    // la clave del KV es un hash: el código no aparece en ningún lado
    const keys = [...env.AULA_KV.m.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^doc:[0-9a-f]{64}$/);
    expect(keys[0]).not.toContain(KEY);
  });

  test("código inválido, otro código no ve nada, sin KV, JSON roto y tamaño grande", async () => {
    const { onRequest, MAX_BYTES } = await load();
    const env = { AULA_KV: fakeKV() };
    expect((await onRequest({ request: req("GET", null, null), env })).status).toBe(401);
    expect((await onRequest({ request: req("GET", null, "corto"), env })).status).toBe(401);
    expect((await onRequest({ request: req("GET", null, "con espacios y cosas raras!!!!!!"), env })).status).toBe(401);
    await onRequest({ request: req("PUT", { baseVersion: 0, data: { x: 1 } }), env });
    expect((await onRequest({ request: req("GET", null, "otro-codigo-distinto-de-22-chars"), env })).status).toBe(404);
    const nokv = await onRequest({ request: req("GET"), env: {} });
    expect(nokv.status).toBe(503);
    expect((await nokv.json()).error).toBe("no-kv");
    expect((await onRequest({ request: req("PUT", "{roto"), env })).status).toBe(400);
    expect((await onRequest({ request: req("PUT", { data: {} }), env })).status).toBe(400);
    const big = JSON.stringify({ baseVersion: 1, data: { s: "x".repeat(MAX_BYTES) } });
    expect((await onRequest({ request: req("PUT", big), env })).status).toBe(413);
    expect((await onRequest({ request: req("DELETE"), env })).status).toBe(405);
  });
});
