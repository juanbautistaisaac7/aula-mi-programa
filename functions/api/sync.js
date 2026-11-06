// S1 · Sincronización compu-celu (Cloudflare Pages Functions + KV).
// GET  /api/sync           → { version, data } del código de sincronización ({ version: 0, data: null } si todavía no hay nada)
//      con "X-Aula-Have: <versión>" y sin nada nuevo → { version, same: true } (S2: la app pregunta cada ~10 s; así
//      no baja el documento entero cada vez, y la función no lo parsea: lee la versión del principio del texto)
// PUT  /api/sync  { baseVersion, data } → { version } · 409 { version, data } si otro dispositivo escribió antes
// El código va en "Authorization: Bearer <código>". En KV se guarda bajo el SHA-256
// del código: sin el código no hay forma de saber qué clave leer.
// Requiere un KV namespace vinculado con el nombre AULA_KV (ver docs/RESUMEN-NOCHE.md).
// Nota: KV no es transaccional. Con dos dispositivos de una sola persona, el chequeo de
// versión alcanza; si dos escrituras se pisan, la app vuelve a fusionar en la próxima pasada.

export const MAX_BYTES = 5 * 1024 * 1024;
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function keyFrom(request) {
  const m = /^Bearer\s+([A-Za-z0-9_-]{22,128})$/.exec(request.headers.get("authorization") || "");
  return m ? "doc:" + await sha256hex("aula-sync:" + m[1]) : null;
}

// El documento se guarda como {"version":N,...}: la versión se lee sin parsear todo (barato en CPU).
function versionOf(raw) {
  const m = /^\{"version":(\d+)[,}]/.exec(raw);
  if (m) return Number(m[1]);
  try { return JSON.parse(raw).version || 0; } catch (e) { return -1; }
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env && env.AULA_KV;
  if (!kv) return json({ error: "no-kv", message: "Falta vincular el KV AULA_KV en Cloudflare" }, 503);
  const key = await keyFrom(request);
  if (!key) return json({ error: "bad-key" }, 401);

  if (request.method === "GET") {
    const raw = await kv.get(key);
    if (!raw) return json({ version: 0, data: null }); // todavía no hay nada (200, así el navegador no lo anota como error)
    const have = request.headers.get("x-aula-have");
    if (have != null && /^\d{1,12}$/.test(have) && versionOf(raw) === Number(have)) return json({ version: Number(have), same: true });
    return new Response(raw, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  if (request.method === "PUT") {
    const text = await request.text();
    if (text.length > MAX_BYTES) return json({ error: "too-big", max: MAX_BYTES }, 413);
    let body;
    try { body = JSON.parse(text); } catch (e) { return json({ error: "bad-json" }, 400); }
    if (!body || typeof body.data !== "object" || body.data === null || !Number.isInteger(body.baseVersion)) return json({ error: "bad-body" }, 400);
    const raw = await kv.get(key);
    const cur = raw ? JSON.parse(raw) : { version: 0 };
    if ((cur.version || 0) !== body.baseVersion) return json(raw ? Object.assign({ error: "conflict" }, cur) : { error: "conflict", version: 0 }, 409);
    const version = (cur.version || 0) + 1;
    await kv.put(key, JSON.stringify({ version, data: body.data, at: Date.now() }));
    return json({ version });
  }
  return json({ error: "method" }, 405);
}
