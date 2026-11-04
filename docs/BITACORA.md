# Bitácora del agente nocturno — Aula

Registro de todo lo que hicieron los agentes: hora, qué intentaron, qué salió bien, qué salió mal, decisiones y por qué. Las entradas nuevas van arriba.

Cómo leerla: cada "corrida" es una sesión nueva de Claude que arrancó sola, sin memoria de las anteriores. Lo único que comparten es este archivo, `BACKLOG.md`, `CLAUDE.md` y el historial de git.

---

## Corrida 04:08–(en curso) (hora ARG) — A1, X1, A2, A3, A4a, A4b

### A4b · Menú más corto y Configuración ordenada

**Plan:** el menú tenía 16 entradas en 4 grupos ("Planificar / Organizar / Estudiar / Sistema"). Ya sin Pomodoro quedaban 15.

**Decisiones:**
- **Tres grupos según para qué abrís la app**, más Configuración aparte abajo:
  - *Planificar:* Inicio, Hoy, Semana, Calendario, Lista completa (lo de todos los días).
  - *Facultad:* Materias, Parciales y finales, Proyectos (lo que da estructura).
  - *Estudio:* Series y repeticiones, Planes de estudio, Notas, Hábitos, Estadísticas.
  - Configuración, separada por una línea.
- **Historial y Copias de seguridad pasan adentro de Configuración** (tarjeta "Datos"), con un "‹ Configuración" estilo iOS arriba del título para volver. Se usan poco y no merecían estar siempre a la vista. Mientras estás en ellas, en el menú queda marcada Configuración (lo mismo con el detalle de una materia, parcial o proyecto, que marca su lista).
- Resultado: 14 entradas en vez de 16. No bajé más a propósito: "Series y repeticiones" probablemente desaparezca o cambie en C3, y la barra de navegación inferior para el celu la evalúo en F1; achicar más ahora sería trabajo que esos ítems van a rehacer.
- **Configuración:** "Primer día de la semana" y "Mi día termina a las" pasaron de *Apariencia* a *Preferencias* (no son apariencia). Apariencia quedó con tema y color.
- Borré `MANIFE~1.WEB` (copia de `manifest.webmanifest` con nombre corto de Windows; no lo referenciaba nada).

**Salió bien:** sin sorpresas; ningún test viejo dependía de la estructura del menú.
**Salió mal / intentos fallidos:** la primera versión del botón para volver era un botón con borde al lado del título y se veía como un chip más. Lo cambié por texto en color de acento arriba del título, con 44 px de alto táctil.
**Tests:** +4 (×2 = 8): el menú tiene 3 grupos y ≤ 14 entradas sin Historial/Copias; se entra y se vuelve de Historial y Copias desde Configuración (y queda marcada Configuración); preferencias de tiempo en "Preferencias"; el archivo basura no existe. `npm test`: 62/62.
**Capturas:** [menú (mobile claro)](capturas/A4b-menu-mobile-light.png) · [Configuración (desktop oscuro)](capturas/A4b-config-desktop-dark.png) · [Historial con "‹ Configuración" (mobile claro)](capturas/A4b-history-mobile-light.png)
**Para Bauti:** si extrañás Historial o Copias en el menú, decime; es mover una línea (`NAV` en `app.js`).

### A4a · Sacar el pomodoro

**Plan:** el ítem A4 era grande (pomodoro + reorganizar el menú), así que lo partí: A4a saca el pomodoro, A4b ordena el menú. Primero listé todas las apariciones (`grep -i pomo`): la vista, el reloj flotante, el botón ▸ en cada tarea, "Empezar a estudiar" en Inicio, la sugerencia "Empezar pomodoro", la tarjeta de Configuración, el atajo P, las acciones rápidas, los textos de estadísticas e historial, y el reparto del "Estudio de hoy", que era en pomodoros.

**Decisiones:**
- **Datos: no se borra nada.** `state.sessions` (con su campo `pomos`), `state.timer`, `settings.pomo` y `t.pomos` siguen guardados; solo dejan de mostrarse. Las sesiones viejas siguen sumando minutos en estadísticas. En "Composición del tiempo" la parte que vino del pomodoro se llama "Con temporizador (antes)", para que esos minutos no desaparezcan del gráfico (igual D2 rehace las estadísticas).
- **Para cargar tiempo:** "Registrar tiempo" en el detalle de cada tarea (abre el formulario con la tarea ya elegida) y en Inicio en lugar de "Empezar a estudiar". Lo registrado suma a la tarea, a su materia y a estadísticas, como antes.
- **"Estudio de hoy"** ahora reparte **minutos** por materia (de a 15) en vez de pomodoros, y crea tareas "Sesión de estudio" con esos minutos. Los bloques viejos que tenían `pomo: true` quedan igual en los datos.
- **Código muerto eliminado:** temporizador, fases, beep, notificación del pomodoro, vista, reloj flotante y su CSS, ajustes de duraciones, `pomosBetween`. El link viejo `#/pomodoro` cae en Inicio sin errores.
- En la exportación CSV de sesiones dejé la columna `pomodoros`: es un volcado de datos, no interfaz, y sacarla perdería información.

**Salió bien:** todo verde a la primera.
**Salió mal / intentos fallidos:** en la captura del editor el botón "Registrar tiempo" quedaba metido en el medio de la frase "Tiempo real: … · creada …". Lo pasé a una fila propia, texto a la izquierda y botón a la derecha.
**Tests:** +5 (×2 = 10): ninguna vista/modal/atajo/acción menciona el pomodoro (recorre todas las vistas con el fixture); el link viejo no rompe; las sesiones con pomodoros se conservan y suman; "Registrar tiempo" desde la tarea; "Estudio de hoy" en minutos. `npm test`: 54/54.
**Capturas:** [Inicio (mobile claro)](capturas/A4-home-mobile-light.png) · [editor (mobile oscuro)](capturas/A4-editor-mobile-dark.png) · [Configuración (desktop claro)](capturas/A4-config-desktop-light.png)
**Para Bauti:** si te queda algún reloj del pomodoro corriendo en el celu al actualizar, simplemente desaparece; lo que ya habías estudiado sigue en estadísticas e historial.

### A3 · Una tarea simple aparece como "serie"

**Plan:** que una serie sea algo explícito (`t.seriesId`), no una deducción por título. Y para los datos viejos, reconstruir los `seriesId` con una heurística que no invente series.

**Decisiones:**
- **`buildSeries()` ahora agrupa solo por `seriesId`.** "Todos los días (período)" y "Agregar días" ponen el mismo `seriesId` a todas sus tareas. "Duplicar" una ocurrencia crea una tarea suelta (le saco el `seriesId`).
- **Migración (paso 2→3), heurística documentada en `inferSeriesIds()`:** me fijé en el código cómo se creaban las series sin repetición, y las dos únicas formas (período y "Agregar días") crean tareas **diarias** con el mismo título, materia y **día de creación**. Así que:
  - se agrupan por materia + proyecto + título + día de creación;
  - es serie si las fechas son distintas y casi todas seguidas (se toleran huecos de días que borraste a mano);
  - si son solo 2, además tienen que tener los mismos minutos (si no, no hay forma de distinguirlas de dos tareas que cargaste por separado);
  - lo que se agregó después con "Agregar días" se suma a la serie si arranca justo al día siguiente de su última fecha;
  - todo lo demás queda suelto.
- **Me aparté un poco del backlog:** pedía "mismos minutos" siempre. No lo exigí para grupos de 3 o más porque el editor viejo permitía "Fijar en 120 las últimas 3", y con esa regla una serie real editada se partía. El día de creación + fechas seguidas ya es una señal muy fuerte.
- Una tarea que ya tiene `seriesId` nunca se toca (idempotencia).

**Salió bien:** con el fixture, el período "Repasar unidad 3" (5 días) queda como serie y las dos "Repasar" de BD (el bug de Bauti) quedan sueltas. Cero datos perdidos (`expectNothingLost`).
**Salió mal / intentos fallidos:** nada en este ítem. Pero en la captura se ve que la vista "Series y repeticiones" tiene cosas feas que no son de este ítem: muestra "0.3 h cada día", "0/1" en las recurrentes y "cada día" en una semanal. Esa vista se rehace en C1–C3, así que no la toqué ahora.
**Tests:** +5 (×2 = 10): dos tareas iguales no son serie; un período sí (y una suelta con el mismo título no se mete); extender suma a la misma serie y duplicar no; migración del fixture; 7 casos borde de la heurística. Los 4 que dependen del arreglo fallan con el código viejo. `npm test`: 44/44.
**Capturas:** [Series (desktop oscuro)](capturas/A3-series-desktop-dark.png) · [Series (mobile claro)](capturas/A3-series-mobile-light.png)
**Para Bauti:** fijate en "Series y repeticiones" que estén tus series reales y no aparezcan tareas sueltas. Si alguna serie vieja quedó partida o falta, avisame (o editala: cuando esté C2 vas a poder armarla a mano).

### A2 · La tarea que hice anoche figura como hecha hoy

**Plan:** un ajuste "Mi día termina a las…" (por defecto 04:00) y que todo lo que use "hoy" lo respete.

**Decisiones:**
- **Lo apliqué a `todayISO()` en general, no solo a completar tareas.** Lo pensé así: si a las 00:30 la vista Hoy ya mostrara el miércoles, las tareas del martes que estás terminando aparecerían como *atrasadas* y las del miércoles como pendientes; sería raro marcar algo "atrasado" y que cuente para el martes. Con un solo "hoy" todo es coherente: Hoy, completar, rachas, hábitos, estadísticas y el "hoy" del calendario. Es lo que hacen Things y TickTick ("el día empieza a las…"). Lo que depende de la **hora real** (recordatorios, "pasó tu parcial de las 18:00") sigue usando el reloj real, porque no pasa por `todayISO()`.
- **Que se note:** pasada la medianoche, arriba dice "Miércoles 4 de noviembre · tu día sigue hasta las 04:00", para que no parezca un bug.
- **Opciones de medianoche a 06:00** en un selector. Más tarde que 06:00 ya confunde con la mañana siguiente.
- **"Completada el" editable** en el detalle de la tarea (solo aparece si está completada, o al cambiar el estado a Completada). Al cambiarla se mueve también el contador del día y el tiempo que se registró automáticamente al completarla, para que las estadísticas no queden contando el día viejo. No se puede poner una fecha futura.
- El tiempo real que se pregunta al completar ahora se registra en el día en que contó la tarea (`doneAt`), no en el día del reloj.
- Datos viejos: no hizo falta un paso de migración: `normalizeState` ya mezcla los ajustes con los valores por defecto, así que los datos de Bauti arrancan con 04:00 sin tocar nada más (hay test con el fixture).
- El ajuste quedó en la tarjeta "Apariencia" de Configuración, al lado de "Primer día de la semana". No es apariencia; lo reubico cuando ordene Configuración en A4.

**Salió bien:** los tests del ítem fallaron con el código viejo (5 de 6; el que pasaba es el caso de las 15:00, que no cambia) y pasan con el nuevo.
**Salió mal / intentos fallidos:** en la primera captura el selector de Configuración salía blanco sobre fondo oscuro (los `select` sueltos no tienen estilo en esa vista). Le puse los mismos colores que los otros campos y lo hice de 40 px de alto.
**Tests:** +6 (×2 = 12), con reloj simulado: martes marcada miércoles 00:10 → martes; 15:00 → miércoles; recurrente a las 00:10 → ocurrencia del martes; bordes del ajuste (medianoche, 01:00, justo 04:00); el ajuste persiste y los datos viejos arrancan en 04:00; editar "completada el" mueve contador y tiempo. `npm test`: 34/34 (68/68 con `--repeat-each 2`).
**Capturas:** [Hoy a las 00:30 (desktop oscuro)](capturas/A2-hoy-0030-desktop-dark.png) · [Configuración (mobile oscuro)](capturas/A2-config-mobile-dark.png) · [Configuración (desktop claro)](capturas/A2-config-desktop-light.png) · [editor con "Completada el" (mobile claro)](capturas/A2-editor-mobile-light.png) · resto en `docs/capturas/A2-*`.
**Para Bauti:** probá marcar algo a la 1 de la mañana: tiene que contar para el día anterior. Si preferís que el corte sea a otra hora, está en Configuración → "Mi día termina a las". Si alguna vez marcaste algo en el día equivocado, abrí la tarea y cambiá "Completada el".

### X1 · Que nada se pierda si cerrás la app justo después de un cambio

**Plan:** lo saltee adelante de A2 a propósito: el backlog dice "trabajar en orden", pero la regla 1 es que los datos son sagrados y este es un bug que puede perder datos. Era chico.

**Decisiones:**
- **Guardado sincrónico de último momento (`flushNow`)** en `beforeunload`, `pagehide` (en el celu `beforeunload` muchas veces no llega) y al mandar la app al fondo. Escribe la copia de emergencia en localStorage (sincrónico: siempre llega) e intenta IndexedDB.
- **`loadState` elige la copia más nueva**: si la de emergencia tiene `meta.lastSave` mayor que la de IndexedDB, usa esa. Antes, la de emergencia solo se usaba si IndexedDB estaba vacío o roto, así que aunque se hubiera guardado bien, se ignoraba.
- Descarté sacar la demora de 500 ms del guardado: con muchos datos, serializar todo en cada tecla se nota, y el problema real era el cierre, no la demora.

**Salió bien:** el test que simula que el navegador corta la escritura en IndexedDB falló antes del arreglo y pasa después.
**Salió mal / intentos fallidos:** nada.
**Tests:** +3 (×2 = 6): corte de IndexedDB al cerrar, 8 crear+recargar seguidos, y que una copia de emergencia *más vieja* no pise datos más nuevos. `npm test`: 22/22, y 88/88 con `--repeat-each 4`.
**Capturas:** no hay cambio visible.
**Para Bauti:** nada que hacer; es una red más abajo de la que ya había.

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
