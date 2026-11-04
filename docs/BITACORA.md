# Bitácora del agente nocturno — Aula

Registro de todo lo que hicieron los agentes: hora, qué intentaron, qué salió bien, qué salió mal, decisiones y por qué. Las entradas nuevas van arriba.

Cómo leerla: cada "corrida" es una sesión nueva de Claude que arrancó sola, sin memoria de las anteriores. Lo único que comparten es este archivo, `BACKLOG.md`, `CLAUDE.md` y el historial de git.

---

## Corrida 06:06–… (hora ARG) — C2a, …

### C2a · Editor de serie: lista de ocurrencias y cambios masivos

**Plan:** reemplazar el modal "Gestionar" (que tenía un formulario de "Operación / Minutos / Aplicar a / Cuántas son las últimas" a ciegas) por lo que hace el Recordatorios del iPhone: ver **todas** las tareas de la serie, tildar las que querés y decir qué hacer, viendo antes qué va a pasar.

**Decisiones:**
- **Lista arriba, acción abajo.** Cada fila: casilla, fecha (y hora si tiene), estado (✓ hecha / hoy / atrasada) y minutos. Se toca la fila entera (46 px de alto), no solo el cuadradito.
- **Selección:** Todas / Pendientes / Ninguna, o a mano. **Al abrir quedan elegidas las pendientes**, que es lo que casi siempre querés cambiar; las hechas solo se tocan si las elegís.
- **Acciones:** Sumar tiempo, Restar tiempo, Fijar tiempo, Mover de día (±N, con atajos −7, −1, +1, +2, +3, +7), Cambiar hora (vacía = sin hora) y Borrar. Para minutos hay atajos 10 m / 30 m / 1 h / 1 h 30 m / 2 h.
- **Vista previa siempre visible** ("Vas a sumar 1 h 30 m a 5 tareas: mar 10 nov: 1 h → 2 h 30 m …") y el botón dice exactamente lo que hace ("Sumar 1 h 30 m a 5 tareas"). Si no elegiste nada, el botón se apaga y te lo dice.
- **El editor queda abierto después de aplicar**, con los minutos ya actualizados, para encadenar tu caso: +1 h 30 a todas y después +10 min a una. Cada cambio tiene **Deshacer** en el aviso, y el deshacer también actualiza la lista.
- **Borrar no pide la doble confirmación** de siempre: ya ves en la vista previa qué se borra, el botón se pone rojo y hay deshacer. "Eliminar toda la serie" sí sigue con la doble confirmación.
- Saqué "Recortar desde una fecha" y el viejo "Tiempo por día" (quedaron reemplazados por elegir + Borrar / Sumar). Renombrar, materia, prioridad y "Extender hasta" quedaron en **"Más opciones"** (plegado), para que la pantalla tenga una sola tarea obvia. Extender bien hecho (siguiendo el patrón) es C2b.
- Restar nunca deja minutos negativos (queda en 0).
- Sin cambios de forma de datos: solo cambian `estMin`, `date` y `time`. No hace falta migración.

**Salió bien:** los tests nuevos pasaron a la primera.
**Salió mal / intentos fallidos:** en las capturas vi dos cosas: (1) el modal enfocaba solo el primer botón, y "Todas" aparecía con el anillo azul como si estuviera elegido: ahora este modal no enfoca nada al abrir (`openModal` acepta `noFocus`); (2) el botón decía "Mover a 1 tarea" / "Borrar a 1 tarea": corregido a "Mover 1 tarea". También las casillas en tema oscuro eran blancas: ahora usan el esquema oscuro.
**Tests:** +5 (`tests/series-editar.spec.js`, 9 corridas entre desktop y mobile): tu caso exacto creando la serie con el control Repetir real (5 cada 3 días → +1 h 30 → +10 min a la del jue 16 → [150, 150, 160, 150, 150], también después de recargar); fijar y deshacer, restar sin negativos; mover ±N, cambiar hora y borrar con deshacer (la serie mantiene su `seriesId`); Todas vs Pendientes con una hecha; en el celu filas ≥ 44 px y nada se sale del ancho. Actualicé `series-identidad` ("extender una serie…") para que abra "Más opciones" antes de usar "Extender hasta"; lo que verifica no cambió. `npm test`: 149 pasaron, 0 fallaron.
**Capturas:** [editor (mobile claro)](capturas/C2a-editor-mobile-light.png) · [mover una (mobile oscuro)](capturas/C2a-mover-mobile-dark.png) · [desktop oscuro](capturas/C2a-editor-desktop-dark.png) · [mover (desktop claro)](capturas/C2a-mover-desktop-light.png)
**Para Bauti:** Series y repeticiones → Gestionar. Probá: dejá las pendientes, Sumar 1 h 30 m, aplicar; después "Ninguna", tocá una fila, 10 m, aplicar.

## Corrida 05:05–05:42 (hora ARG) — B4, B5, C1

**Resumen de la corrida:** 3 ítems cerrados (B4 mover tareas de día, B5 lista que se limpia sola, C1 Repetir con vista previa). Tests: de 100 a 140, todos en verde en cada commit. Versión: 2.16.0 → 2.19.1. Sin cambios de esquema de datos (no hizo falta migrar nada). Al final corregí un texto viejo de "Series y repeticiones" que todavía hablaba de "Todos los días (período)", que ya no existe (2.19.1). Partí **C2** en C2a y C2b en el backlog: es el ítem más delicado (lo que más te frustra) y no quería empezarlo con 15 minutos y dejarlo a medias; la próxima corrida arranca C2a de cero.

**Commits:** `2eaaab9` B4 · `cd6cf0f` B5 · `5e19398` C1 · el de cierre (texto de Series + backlog + bitácora).


### C1 · Crear repeticiones sin pensar

**Plan:** un solo control "Repetir" al crear una tarea, con vista previa en vivo de las fechas exactas, y que sea imposible crear una serie sin querer.

**Decisiones:**
- **Dónde:** en "Nueva tarea", debajo de la fecha, solo cuando la programación es "Día fijo" (repetir una fecha límite o una tarea sin fecha no tiene sentido). Por defecto **"No se repite"**.
- **Opciones:** No se repite / Todos los días / Cada N días / Ciertos días de la semana (botones redondos L M X J V S D, como el reloj del iPhone) / Cada semana / Cada mes. **Termina:** en una fecha / después de N veces / sin fin.
- **Vista previa:** "Se van a crear 5 tareas (una serie): mar 10 nov · vie 13 nov · …", y el botón cambia a **"Crear 5 tareas"**: no hay forma de crear muchas sin verlo. Los errores aparecen ahí mismo en rojo y no dejan crear ("Elegí al menos un día", "La fecha final tiene que ser posterior…", máximo 120).
- **Modelo interno (lo que pedía el backlog decidir):**
  - **Con fin** → se crean tareas individuales con el mismo `seriesId`. Cada una se puede mover (B4), completar o editar sola, que es justamente lo que pedías ("a una de ellas sumarle 10 minutos").
  - **Sin fin** → **una sola tarea** con `recur` (el modelo que ya existía), porque no se pueden crear infinitas.
  - Las dos usan el **mismo cálculo de fechas** (`occursOn`), así la vista previa y lo que después aparece en el calendario no pueden diferir.
  - "Cada mes" el día 31 se saltea los meses que no tienen 31 (igual que antes). Lo dejo anotado por si preferís "último día del mes".
- **Saqué "Todos los días (período)"** de Programación: ahora es Repetir → Todos los días → Hasta una fecha (mismo resultado, una serie). Tuve que **actualizar un test viejo** (`series-identidad`, "un período de 5 días es una serie") para que use el control nuevo; lo que verifica no cambió.
- **No hizo falta migración**: no cambia la forma de los datos.

**Salió bien:** los tests nuevos pasaron a la primera.
**Salió mal / intentos fallidos:** al correr todo, un test viejo del menú falló **una vez** (el menú todavía no estaba dibujado; no se repitió en 40 corridas). La causa era el test, no la app: `openApp` esperaba a que existiera `state`, pero la app dibuja recién después de guardar la copia diaria. Ahora el helper también espera al menú dibujado.
**Tests:** +7 (×2 = 14): por defecto no repite; cada 3 días × 5 con fechas exactas, serie y deshacer; días de la semana hasta una fecha; diario/semanal/mensual (incluido el 31); sin fin crea una sola tarea que aparece los días correctos tras recargar; errores; los botones de días entran en el celu. `npm test`: 140 pasaron, 0 fallaron.
**Capturas:** [cada 3 días, 5 veces (mobile claro)](capturas/C1-nueva-mobile-light.png) · [días de la semana, sin fin (mobile oscuro)](capturas/C1-dias-mobile-dark.png) · [desktop claro](capturas/C1-nueva-desktop-light.png)
**Para Bauti:** lo siguiente es C2 (editar la serie: +1 h 30 a todas, +10 min a una sola). Con C1 ya podés crear "5 tareas cada 3 días" en un paso y ver las fechas antes.

### B5 · La lista completa se limpia sola

**Plan:** que las hechas hace más de N días (por defecto 7) no aparezcan en "Lista completa", sin borrar nada.

**Decisiones:**
- **Es un filtro de vista, no un borrado.** Las tareas quedan igual en los datos, en Historial y en Estadísticas. Por eso no hace falta migración: el ajuste nuevo `doneKeepDays` (7 por defecto) se completa solo en los datos viejos, como el resto de los ajustes.
- **"Hace más de 7 días"** se cuenta desde el día en que la completaste (`doneAt`, que respeta "Mi día termina a las…"). Si una tarea vieja no tiene `doneAt` (datos de versiones anteriores), uso su fecha.
- **Abajo de la lista** dice cuántas se ocultaron ("2 tareas hechas hace más de 7 días no se muestran") con el botón **"Mostrar hechas antiguas"**. Así nunca parece que algo desapareció sin explicación. Elegí ponerlo abajo y no como otro filtro arriba, porque arriba ya hay 10 controles.
- **Si filtrás por estado "Hecha", se ven todas**, también las antiguas: si las estás buscando, las querés ver.
- **En Configuración → Preferencias**, debajo de "Mostrar tareas completadas en la lista": "Sacar de la lista las hechas hace más de" 3 / 5 / 7 / 10 / 14 / 30 días / Nunca.

**Salió bien:** sin sorpresas.
**Salió mal / intentos fallidos:** en el test usé la ruta `settings` en vez de `config`; nada de la app.
**Tests:** +5 (×2 = 10), con reloj simulado: qué se oculta y qué no (incluido el borde de 7 días justos y una tarea sin `doneAt`), que nada se borra, mostrar/ocultar antiguas, filtro por estado, ajuste que persiste y "Nunca", y que una tarea hecha hoy desaparece sola cuando el reloj avanza 8 días. `npm test`: 126 pasaron, 0 fallaron.
**Capturas:** [lista con el aviso (mobile claro)](capturas/B5-list-mobile-light.png) · [ajuste en Configuración (mobile oscuro)](capturas/B5-config-mobile-dark.png)

### B4 · Pasar tareas a otro día, fácil

**Plan:** sección "Mañana" fija en Hoy, arrastrar entre Hoy y Mañana con mouse **y con el dedo**, y un "Mover a…" que se use con una mano. Todo con deshacer.

**Decisiones:**
- **Un solo sistema de arrastre con pointer events** (mouse y dedo) en lugar del arrastre HTML5 que había. El HTML5 no funciona en táctil, y tener dos sistemas era pedir bugs. Lo borré entero (`taskDragStart`, `dragArm`, etc.).
- **Cómo se agarra una tarea:** con mouse, desde la manija ⣿ (un clic en la fila sigue abriendo el detalle). Con el dedo, **mantené apretada la fila ~0,4 s**: se "levanta" (se agranda un poquito con sombra y vibra si el celu puede). Si movés el dedo, la arrastrás; si soltás sin moverla, se abre **"Mover a…"**. Es lo mismo que hace el iPhone con las apps de la pantalla de inicio. Si el dedo se mueve *antes* de los 0,4 s, es scroll normal: no se rompe el desplazamiento.
- **Soltar:** en el mismo día cambia el orden (como antes); en otro día cambia la fecha y la ubica arriba o abajo de la tarea donde soltaste. Las zonas donde se puede soltar se marcan con un borde y la que está debajo del dedo se pinta con el color de acento. Si arrastrás cerca del borde de la pantalla, la página se desplaza sola.
- **"Mover a…"** es una hoja que sube desde abajo en el celu (al alcance del pulgar) y un cuadro centrado en desktop: Hoy (si no está hoy), Mañana, Pasado mañana, En 3 días, Próximo lunes, En 1 semana y Elegir fecha. Cada opción muestra la fecha exacta ("jue 5 nov") para que no haya sorpresas. Todas cuentan desde **hoy**, no desde la fecha de la tarea. En desktop el botón "+1d" de la fila pasó a ser "Mover…" (Mañana está adentro); "Hoy" sigue.
- **Tareas flexibles** (solo tienen "vence"): moverlas les pone día y **conservan el vencimiento**. Una tarea "pospuesta" que movés vuelve a "pendiente".
- **Las tareas que se repiten no cambian de día** (su fecha la define la repetición): se pueden reordenar dentro del día, pero si las soltás en otro día avisa "Las tareas que se repiten no se mueven de día". Esto se va a revisar en C1–C3.
- **Las tareas con hora** se pueden pasar a otro día (con el dedo o "Mover a…"), pero dentro del día siguen ordenándose solas por hora; no les agregué la manija para no romper esa regla (test de B1 intacto).
- **No hizo falta migración:** solo cambian `date`, `ord` y `status`, campos que ya existían. Deshacer restaura las tres cosas de todas las tareas que se reordenaron.
- Borré `postponeTask` (lo usaba solo el botón "+1d").

**Salió bien:** el arrastre con el dedo anda con toques táctiles reales (los tests usan el protocolo de Chrome para mandar toques de pantalla, no clics simulados).
**Salió mal / intentos fallidos:**
- El "Deshacer" del aviso no andaba si lo tocabas enseguida después de arrastrar: para que el arrastre no abra el editor, "me como" el clic que manda el navegador al soltar, y me estaba comiendo el clic del Deshacer. Ahora solo descarto clics sobre la lista.
- En el celu, después de mantener apretado, el "tap" del navegador caía sobre el fondo de la hoja recién abierta y la cerraba al instante. Lo encontré con un test de depuración que registraba los eventos; lo arreglé descartando también ese clic.
- Las capturas mostraron que la ayuda "mantené apretada una tarea para moverla" partía el título en dos renglones en el celu: la pasé a una línea chiquita debajo del título.
- Al revisar las capturas vi que la manija de una tarea que se repite ya no hacía nada (mi primera versión ignoraba las repetitivas del todo): eso era una regresión del orden manual. Lo arreglé y le puse test.
**Tests:** +11 (`tests/mover.spec.js`; los de mouse corren en desktop y los de dedo en mobile, el resto en los dos). `npm test`: 116 pasaron, 0 fallaron (6 salteados a propósito: son los de mouse en mobile y los de dedo en desktop).
**Capturas:** [Hoy (mobile claro)](capturas/B4-today-mobile-light.png) · [sección Mañana (mobile oscuro)](capturas/B4-manana-mobile-dark.png) · [Mover a… (mobile oscuro)](capturas/B4-mover-mobile-dark.png) · [Mover a… (desktop claro)](capturas/B4-mover-desktop-light.png) · [Hoy (desktop claro)](capturas/B4-today-desktop-light.png)
**Para Bauti:** probalo en el celu: en Hoy, mantené apretada una tarea, esperá que "se levante" y arrastrala a Mañana. Y mantené apretada y soltá sin mover para ver "Mover a…". Si 0,4 s te parece mucho o poco, decime: es un número (`LONGPRESS_MS`). No lo pude probar en un iPhone real; en Safari de iOS el comportamiento de "mantener apretado" puede variar, así que contame si algo se siente raro.

## Corrida 04:08–04:49 (hora ARG) — A1, X1, A2, A3, A4a, A4b, B1, B2, X2, B3

**Resumen de la corrida:** 10 ítems cerrados (7 del backlog + 3 que encontré yo: X1, X2, y A4 partido en dos). Tests: de 6 a 100 (50 tests × desktop y mobile), todos en verde en cada commit. Versión de la app: 2.6.0 → 2.16.0; esquema de datos: v1 → v3 (con copia automática antes de migrar). Lo siguiente en el backlog es **B4** (mover tareas a otro día arrastrando con el dedo + "Mover a…"); no lo empecé porque quedaban menos de 10 minutos y es un ítem grande: mejor arrancarlo entero en la próxima corrida. Quedan anotados **X3** (detalle del parcial en el celu) y los detalles feos de la vista Series (para C1–C3).

**Commits:** `153013f` A1 · `a5923f1` X1 · `7620e4b` A2 · `a811399` A3 · `8bf9409` A4a · `ab2c6d4` A4b · `7706584` B1 · `27d575c` B2 · `4ba1ff5` X2 · `935c46f` B3 (más los de candado).

**Cómo trabajé (para aprender):** cada ítem siguió el mismo ciclo: leer el código involucrado con `grep` por secciones, escribir los tests y comprobar que **fallan con el código viejo** (lo verifiqué con `git stash` en A2, A3 y X2), implementar, correr todo, sacar capturas desktop/mobile × claro/oscuro y mirarlas. Las capturas encontraron 7 problemas que los tests no veían (selector ilegible en oscuro, filas desalineadas, campos cortados en el celu, botones pesados, el fixture mal armado…). Por eso la revisión visual no es opcional.


### B3 · Tareas → parciales → materias

**Plan:** que al crear o editar una tarea se elija la materia y, dentro de ella, un parcial; que no aparezcan cosas cerradas; y que el parcial muestre sus tareas.

**Decisiones:**
- **Un solo helper (`evalOptions`)** para el modal rápido y el editor: muestra los parciales *abiertos* de la materia (o proyecto) elegida. Sin materia, muestra todos los abiertos; si elegís uno, se completa la materia sola. Si cambiás de materia y el parcial elegido no es de esa materia, se limpia (para no guardar un vínculo cruzado sin darte cuenta).
- **Cerrados = rendido, aprobado o desaprobado** (parciales) y **terminado o archivado** (proyectos). No se ofrecen, **salvo el que la tarea ya tiene**: se sigue viendo, con su estado entre paréntesis ("Primer parcial Economía · vie 2 oct (aprobado)"), y guardar sin tocarlo no lo pierde.
- **Los parciales ya pertenecían a una materia** (`e.subjectId`, se elige al crearlo); no hizo falta cambiar el modelo.
- **Encontré un riesgo y lo evité:** "Regenerar plan" borra las tareas pendientes con `planId` igual al parcial. El editor viejo ponía `planId` al vincular a mano, así que regenerar un plan podía **borrar tareas que vinculaste vos**. Ahora vincular a mano solo pone `evalId`; `planId` queda reservado para las tareas que crea el generador. Hay un test que llama al `generatePlan` real y verifica que la tarea manual sobrevive. (Las tareas que ya vinculaste con la versión vieja siguen teniendo `planId`; no las toqué para no cambiar datos sin necesidad.)
- **Detalle del parcial:** la sección se llama "Tareas y plan de estudio", incluye las tareas vinculadas a mano (antes solo las del plan generado) y tiene un botón "+ Tarea" que abre el modal con la materia y el parcial ya elegidos. El contador "tareas del plan" y el % de preparación las cuentan.

**Salió bien:** sin regresiones.
**Salió mal / intentos fallidos:** la captura del parcial mostraba los temas sin nombre: el error era **mío, del fixture** (usé `{t, done}` para los temas, y la app usa `{name, diff, estMin, state}`). Lo corregí leyendo `addTopic`. También vi que en el celu el detalle del parcial apila 6 tarjetas de números antes de llegar a las tareas: lo anoté como **X3**.
**Tests:** +6 (×2 = 12): el modal filtra por materia y oculta cerrados; cambiar materia limpia / elegir parcial completa materia; un vínculo a un parcial aprobado se conserva; proyectos cerrados ocultos salvo el vinculado; el detalle muestra las tareas manuales con su progreso y "+ Tarea"; regenerar el plan no borra lo manual. `npm test`: 100/100.
**Capturas:** [nueva tarea con parcial (mobile claro)](capturas/B3-nueva-mobile-light.png) · [detalle del parcial (desktop oscuro)](capturas/B3-eval-e-pe2-desktop-dark.png) · [detalle (mobile claro)](capturas/B3-eval-e-pe2-mobile-light.png)
**Para Bauti:** probá crear una tarea, elegir la materia y fijate que en "Parcial / final" solo estén los que todavía no rendiste.

### X2 · En el celu, las filas de tareas usaban la mitad del ancho

**Plan:** lo vi en las capturas de B1/B2 y lo anoté; como era chico y molesta todos los días, lo hice enseguida.

**Causa:** las acciones de cada fila (Hoy, +1d, Editar, ×, ↑↓) aparecen al pasar el mouse (`opacity: 0` → `1`). En el celu no hay "pasar el mouse": nunca se veían, pero seguían ocupando lugar a la derecha y el título se cortaba a la mitad.

**Decisiones:**
- En pantallas táctiles (`@media (hover:none)`) esas acciones no se dibujan. No se pierde nada que se pudiera usar: tocar la tarea abre el detalle con Eliminar, Archivar, etc. En B4 viene el "Mover a…" de una mano, que reemplaza a "Hoy" y "+1d".
- En desktop quedan igual (aparecen con el mouse).
- Aviso honesto: las flechas ↑↓ para reordenar tampoco se podían usar en el celu, y la manija ⣿ usa arrastre HTML5, que en táctil no anda. Reordenar con el dedo es parte de B4.

**Salió bien / mal:** bien; el test falla sin el arreglo (en mobile) y pasa con él.
**Tests:** +1 (×2). `npm test`: 88/88.
**Capturas:** [Hoy (mobile claro)](capturas/X2-hoy-mobile-light.png) · [mobile oscuro](capturas/X2-hoy-mobile-dark.png)

### B2 · Comentarios en tareas

**Plan:** un hilo de comentarios en el detalle de la tarea, con fecha y hora, editar y borrar con deshacer, y un indicador chiquito en la fila.

**Decisiones:**
- **Modelo:** `t.comments = [{ id, text, ts, editedTs? }]`. Campo nuevo y opcional, sin migración.
- **Se guardan al instante**, como las subtareas: no dependen del botón "Guardar" del editor. Así no se pierde un comentario si cerrás con "Cancelar".
- **Separé "Notas de la tarea" de "Comentarios":** la nota es *un* texto que describe la tarea; los comentarios son un registro con fecha de lo que fue pasando ("pregunté en la consulta", "ya lo resolví"). Las notas viejas quedan como estaban.
- **Editar** marca "· editado". Guardar vacío no se permite (para eso está Borrar). **Borrar** no pide confirmación pero ofrece *Deshacer*, que es más rápido y menos molesto en el celu.
- **Ctrl/Cmd+Enter** comenta (en desktop); en el celu está el botón "Comentar".
- **Indicador en la fila:** un globito de diálogo dibujado en SVG + la cantidad ("💬 2" sin emoji), gris, con `title` "2 comentarios".
- El texto se escapa siempre (probado con `<b>`), y los saltos de línea se respetan.

**Salió bien:** todo verde a la primera.
**Salió mal / intentos fallidos:** "Editar" y "Borrar" con borde en cada comentario pesaban mucho visualmente: los dejé como texto (gris y rojo), con 36 px de alto táctil. Para capturar la parte de abajo del editor tuve que hacer un script aparte: el `scrollTop` sobre el modal no movía el contenedor correcto.
**Tests:** +5 (×2 = 10): agregar (y que vacío no se agregue) y persistir; editar y cancelar; borrar y deshacer; indicador con cantidad; HTML escapado. `npm test`: 86/86.
**Capturas:** [comentarios en el editor (mobile oscuro)](capturas/B2-editor-mobile-dark.png) · [mobile claro](capturas/B2-editor-mobile-light.png) · [indicador en la fila](capturas/B2-fila-mobile-light.png)
**Para Bauti:** en las capturas de Hoy en el celu se nota que el título y los datos de cada tarea usan solo la mitad del ancho (se cortan "Segundo parcial / PE"). No es de este ítem; lo anoto para la pasada de diseño (F1).

### B1 · Hora en tareas

**Plan:** campo opcional `t.time` ("HH:MM"), en el modal rápido y en el editor, y que Hoy, Semana, Calendario y el resumen del día ordenen por hora.

**Decisiones:**
- **No hizo falta migración:** las tareas viejas simplemente no tienen hora (= "sin hora"). Ningún campo existente cambia.
- **Orden:** primero las que tienen hora, de la más temprana a la más tarde; después las sin hora con el orden de siempre (el que armaste a mano arrastrando, y si no, prioridad y duración). Lo cambié en un solo lugar (`orderedTasks`), así que vale para todas las vistas.
- **Las tareas con hora no se arrastran:** su lugar lo decide la hora. No muestran la manija ni ↑↓ (dejé el espacio de la manija para que las casillas queden alineadas) y si se intenta moverlas, aviso: "Las tareas con hora se ordenan solas por hora".
- **Cómo se ve:** la hora va antes del título, en color de acento y números tabulares (estilo Calendario de iOS). Respeta el ajuste de formato 24 h / 12 h ("6:30 p. m.").
- **En el modal rápido** la hora aparece al lado de la fecha y se esconde si elegís "Sin fecha". Un período o "Agregar días" copian la hora a todas las tareas de la serie.
- **Parciales:** ya tenían hora (`ev_time`); ahora también se ve en Semana y Calendario.

**Salió bien:** todo verde.
**Salió mal / intentos fallidos:** en las capturas aparecieron dos cosas que arreglé: (1) sin la manija, las tareas con hora quedaban corridas a la izquierda respecto de las otras; (2) en el editor, la fila "fecha / hora / fecha límite / estimado" en 4 columnas cortaba las fechas en el celu ("11/04/" y "mm/d"). La partí en dos filas de 2.
**Tests:** +7 (×2 = 14): crear con hora y persistir; sin fecha no hay hora; editar y borrar la hora; orden en Hoy, Semana y Calendario; las con hora no se arrastran; formato 12 h; parciales con hora en la semana. `npm test`: 76/76.
**Capturas:** [Hoy con horas (mobile claro)](capturas/B1-hoy-mobile-light.png) · [nueva tarea (mobile oscuro)](capturas/B1-nueva-mobile-dark.png) · [editor (mobile claro)](capturas/B1-editor-mobile-light.png) · [semana (desktop claro)](capturas/B1-semana-desktop-light.png) · [calendario (desktop oscuro)](capturas/B1-calendario-desktop-dark.png)
**Para Bauti:** los campos de hora y fecha los dibuja el navegador; en tu celu en español van a decir "dd/mm/aaaa" (en las capturas salen en inglés porque el navegador de prueba está en inglés).

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
