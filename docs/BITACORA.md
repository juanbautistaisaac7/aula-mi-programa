# Bitácora del agente nocturno — Aula

Registro de todo lo que hicieron los agentes: hora, qué intentaron, qué salió bien, qué salió mal, decisiones y por qué. Las entradas nuevas van arriba.

Cómo leerla: cada "corrida" es una sesión nueva de Claude que arrancó sola, sin memoria de las anteriores. Lo único que comparten es este archivo, `BACKLOG.md`, `CLAUDE.md` y el historial de git.

---

## Corrida 04:08–(en curso) (hora ARG) — A1

### A1 · Red de seguridad para los datos

**Plan:** antes de tocar el modelo (A2, A3, B1, C1… todos cambian la forma de `state`) necesitaba poder *probar* que los datos de Bauti sobreviven. Tres piezas: un estado "viejo" realista, un helper para meterlo en IndexedDB antes de que arranque la app, y un sistema de migraciones con número de versión.

**Decisiones:**
- **`state.meta.schema` en vez de reusar `state.v`.** `v` ya existe y `normalizeState` lo fuerza siempre a 2, así que no sirve para saber si un estado viejo ya pasó por una migración. Los datos sin `meta.schema` cuentan como esquema 1 (= Aula 2.6). Este ítem agrega el paso 1→2, que no cambia nada: solo deja la cañería lista. Los ítems siguientes agregan pasos a `MIGRATIONS` en `app.js`.
- **`baseState()` no trae `schema`.** Si lo trajera, `normalizeState` (que mezcla `meta` con el de `baseState`) haría que un estado viejo pareciera ya migrado. El estado nuevo pasa por `migrateState()` igual que todos.
- **La copia previa es el JSON original tal cual estaba guardado**, no el estado ya normalizado: si algo sale mal, se vuelve exactamente a lo que había. Clave `premig-v1-<timestamp>`, con `version` (de la app) y `schema` (de los datos). Se ve en "Copias de seguridad" como "Antes de actualizar a Aula 2.7.0" y se restaura con el botón de siempre. Estas copias no se rotan (son pocas: una por actualización que cambia el modelo).
- **También se migra** al restaurar una copia, al importar un JSON (fusionar o reemplazar) y al reiniciar. Si no, una copia vieja restaurada quedaría con forma vieja y rompería los ítems siguientes.
- **Si no hay IndexedDB** la copia previa va a localStorage (`aula-premig-v1`) y la migración sigue igual: frenar la app por no poder hacer la copia sería peor.
- **El fixture** (`tests/fixtures/estado-v2.6.json`) lo armé con un script leyendo `quickAddTask`, `migrateV1`, `addSession`, hábitos y notas, para respetar la forma real: materias (una archivada), parciales en todos los estados, proyectos en curso/terminado/archivado, tareas simples, con fecha límite, sin fecha, en progreso, canceladas, archivadas, un período de 5 días, **dos "Repasar" sueltas con el mismo título y materia** (el caso del bug A3), recurrentes de los 5 tipos con `recurDone`, sesiones con pomodoros, hábitos, notas, `dayLog`, `dayPlan`. Las fechas giran alrededor del 4/11/2026 y los tests fijan el reloj en esa fecha.
- **`expectNothingLost(antes, después)`** en `tests/helpers.js`: recorre todo el estado viejo y exige que cada elemento (por `id`) y cada campo sigan ahí con el mismo valor. Las migraciones pueden *agregar* campos, nunca quitar ni cambiar. Lo probé a propósito con una migración que borra `pomos` y una tarea: el test falla, como debe.
- Agregué `tests/tools/capturar.js` para que las próximas corridas saquen las 4 capturas (desktop/mobile × claro/oscuro) con el fixture cargado en un solo comando.

**Salió bien:** todo verde al primer intento; la app carga el estado viejo, se navegan todas las vistas y los detalles (materia, parcial, proyecto) sin errores de consola, y lo guardado en IndexedDB después de abrir sigue conteniendo todo.

**Salió mal / intentos fallidos:** en una corrida completa falló **una vez** el test de humo "crear una tarea… persiste" y no lo pude reproducir (40 repeticiones en verde). Creo que es una carrera real: el guardado tiene 500 ms de demora y si recargás antes, el guardado de emergencia de `beforeunload` puede no llegar a escribir en IndexedDB. Lo anoté como ítem **X1** porque en el celu sería "creé algo, cerré la app y no estaba".

**Tests:** +5 tests (×2 dispositivos = 10). `npm test`: 16 pasaron / 0 fallaron (y 64/64 con `--repeat-each 4`).

**Capturas:** [backups mobile oscuro](capturas/A1-backups-mobile-dark.png) · [backups desktop claro](capturas/A1-backups-desktop-light.png) · [mobile claro](capturas/A1-backups-mobile-light.png) · [desktop oscuro](capturas/A1-backups-desktop-dark.png)

**Para Bauti:** la primera vez que abras la 2.7 vas a ver en *Copias de seguridad* una copia "Antes de actualizar a Aula 2.7.0". Es tu estado tal cual estaba; si algo de lo nuevo no te gusta, restaurándola volvés a tus datos de antes. En *Configuración* abajo dice "Versión 2.7.0 (datos v2)".

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
