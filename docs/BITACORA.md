# Bitácora del agente nocturno — Aula

Registro de todo lo que hicieron los agentes: hora, qué intentaron, qué salió bien, qué salió mal, decisiones y por qué. Las entradas nuevas van arriba.

Cómo leerla: cada "corrida" es una sesión nueva de Claude que arrancó sola, sin memoria de las anteriores. Lo único que comparten es este archivo, `BACKLOG.md`, `CLAUDE.md` y el historial de git.

---

## Preparación 03:00–03:20 (hora ARG) — setup inicial

**Plan:** dejar el terreno listo para que los agentes trabajen solos toda la noche: tests automáticos, reglas (`CLAUDE.md`), lista de mejoras con criterios de terminado (`BACKLOG.md`) y esta bitácora.

**Decisiones:**
- **Tests con Playwright, probando la app como la usa una persona** (abre `index.html`, crea tareas, navega). `app.js` no está separado en módulos, así que los tests unitarios clásicos no encajan. Se usa el Chrome que ya está en el entorno, para no depender de descargas.
- **Dos proyectos de test: desktop y mobile (Pixel 7)**, porque Bauti usa la app desde el celu.
- **Rama `agente/mejoras`**: `main` queda intacta hasta que Bauti revise y mergee.
- **Una corrida por hora que trabaja unos 50 minutos** con contexto limpio, en vez de una sola sesión eterna. Una sesión gigante se llena de contexto y empieza a hacer cosas a medias, que es justo el problema que tenía Bauti en el chat. Un candado (`.agente/LOCK`) evita que dos corridas se pisen.
- **Ítems agregados:** A1 (red de seguridad para los datos: hay meses de datos reales en el celu y varios ítems cambian el modelo).

**Salió bien:** 3 tests de humo (la app carga sin errores, crear una tarea simple persiste y no es serie, todas las vistas renderizan), en verde en desktop y mobile. También aparecieron las causas probables de dos bugs que reportó Bauti:
- Las "series fantasma" vienen de `buildSeries()`, que agrupa como serie cualquier par de tareas con el mismo título.
- La tarea hecha a las 00:01 figura en el día nuevo porque se guarda `doneAt = todayISO()`.

Quedaron documentadas en A2 y A3.

**Salió mal / intentos fallidos:** el primer test de humo esperaba que el modal desapareciera del DOM, pero la app solo lo oculta con una clase. Se corrigió el helper.

**Tests:** 6/6 pasan (3 tests × desktop + mobile).

**Para Bauti:** nada por ahora; a la mañana mirá `docs/RESUMEN-NOCHE.md`.
