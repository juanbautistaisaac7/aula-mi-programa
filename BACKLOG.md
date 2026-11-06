# Backlog de mejoras — Aula

Estados: `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[!]` bloqueado (con nota)

Trabajar en orden. Cada ítem tiene un id (`A1`, `B2`...) para nombrar commits y capturas. "Listo cuando" es el criterio de terminado: **todos** los puntos se tienen que cumplir y estar cubiertos por tests cuando sea posible.

Las palabras de Bauti están citadas tal cual en "Pedido", para no perder lo que quiso decir.

---

## A. Base y bugs que molestan todos los días

- [x] **A1 · Red de seguridad para los datos** *(agregado: necesario antes de tocar el modelo)*
  Hay cambios de modelo en varios ítems (hora, comentarios, vínculos, series, notificaciones). Antes de tocarlo hace falta poder probar que los datos viejos sobreviven.
  Listo cuando:
  - Existe `tests/fixtures/estado-v2.6.json`: un `state` realista con la forma actual (materias, parciales con distintos estados, proyectos, tareas simples, con fecha límite, sin fecha, períodos "todos los días", recurrentes, hechas y pendientes, sesiones de pomodoro, hábitos, notas). Armalo leyendo `defaultSettings()`, la migración v1 y `quickAddTask()` para respetar la forma real.
  - Hay un helper de test para cargar un estado en IndexedDB antes de abrir la app, y un test que lo carga, navega todas las vistas sin errores y verifica que no se perdió nada.
  - Existe una función de migración versionada (`state.meta.schema` o similar) a la que los ítems siguientes le agregan pasos, con test de que es idempotente (correrla dos veces da lo mismo).

- [x] **A2 · La tarea que hice anoche figura como hecha hoy**
  Pedido: *"si una tarea estaba programada para un día y la marcó al siguiente a las 00:1 pero la hice el día anterior se marca hoy, cambiar eso ver cómo se puede arreglar"*.
  Causa: `toggleTask` y el editor usan `doneAt = todayISO()` (ver ~línea 468 y ~3539), y `bumpDayDone(todayISO())`.
  Listo cuando:
  - Hay un ajuste **"Mi día termina a las…"** (por defecto 04:00). Antes de esa hora, "hoy" para la app sigue siendo el día anterior en todo lo que importa (vista Hoy, marcar hechas, rachas, estadísticas). Pensar bien si aplicarlo a `todayISO()` en general o solo a la lógica de completar; documentar la decisión.
  - Al completar una tarea con fecha pasada, se registra como hecha en su día programado si se completa dentro de ese margen. En otro caso, en el día real.
  - En el detalle de la tarea se puede ver y **editar "completada el"**.
  - Tests con reloj simulado (`setClock`): tarea del martes marcada miércoles 00:10 → cuenta martes; marcada miércoles 15:00 → cuenta miércoles; tareas recurrentes (`recurDone`) igual.

- [x] **A3 · Una tarea simple aparece como "serie"**
  Pedido: *"ahora creo una tarea simple y aveces se me carga como serie nada que ver"*.
  Causa encontrada: `buildSeries()` (~línea 1419) agrupa como serie a **cualquier par de tareas con el mismo título y la misma materia**. Dos "Repasar" sueltas se vuelven serie.
  Listo cuando:
  - Las series son explícitas: las tareas creadas juntas como período o serie comparten un `seriesId`. Migración: los grupos actuales que realmente vienen de un período (fechas consecutivas o con intervalo regular, mismo título, mismos minutos y creadas el mismo día) reciben `seriesId`; el resto queda como tareas sueltas. Documentar la heurística.
  - Test: dos tareas simples con el mismo título **no** son serie; un período de 5 días sí lo es.
  - (Se complementa con C1/C2: este ítem solo arregla la identidad de las series.)

- [x] **A4 · Sacar pomodoros y limpiar** *(partido en A4a y A4b por el agente)*
  - [x] **A4a** · Sacar el pomodoro de la interfaz y su código muerto, conservar sesiones, "Registrar tiempo" en la tarea.
  - [x] **A4b** · Menú lateral más corto (y Configuración ordenada) + borrar `MANIFE~1.WEB`.
  Pedido: *"eliminar pomoodores para /y limpiar un poco todo"*.
  Listo cuando:
  - No hay más pomodoro en la interfaz: vista, menú, botones en tareas, atajos, ajustes, contadores de "pomodoros" en tareas y estadísticas.
  - Las **sesiones de estudio registradas se conservan** (son datos de tiempo estudiado). Si hace falta una forma simple de cargar tiempo estudiado, que quede como "registrar tiempo" manual en la tarea. Los campos viejos (`pomos`) quedan en los datos, pero no se muestran.
  - Se elimina el código muerto del pomodoro (`POMODORO`, `renderPomoUI`, `renderPomoView`, etc.) sin romper nada.
  - "Limpiar un poco todo": revisar el menú lateral. Hay 17 secciones y es demasiado. Proponer una estructura más corta (por ejemplo, agrupar Historial y Copias de seguridad dentro de Configuración) y documentar el porqué.
  - Borrar el archivo basura `MANIFE~1.WEB` (copia de `manifest.webmanifest` con nombre corto de Windows).

## B. Tareas: hora, comentarios, vínculos, mover días

- [x] **B1 · Hora en tareas y eventos**
  Pedido: *"permitir poner horario a las tareas"*.
  Listo cuando:
  - Las tareas tienen hora opcional (`time: "HH:MM"`), al crearlas (modal rápido) y al editarlas. Los parciales ya tienen fecha; verificar que también tengan hora.
  - En Hoy, Semana y Calendario, las tareas con hora se ordenan por hora y la hora se ve clara. Las tareas sin hora van después.
  - Tests de creación, edición, orden y persistencia.

- [x] **B2 · Comentarios en tareas**
  Pedido: *"poder poner comentarios a las tareas"*.
  Listo cuando: en el detalle de una tarea hay un hilo de comentarios (texto + fecha y hora), con agregar, editar y borrar (con deshacer). Un indicador sutil en la fila de la tarea muestra que tiene comentarios. Con tests.

- [x] **B3 · Tareas → parciales → materias**
  Pedido: *"poder asignar tareas a parciales parciales a materias. cuando se termine un proyecto o parcial que esté aprobado o estado finalizado que no aparezca más como opción para meterle tareas"*.
  Listo cuando:
  - Al crear o editar una tarea se elige la materia y, dentro de ella, opcionalmente un parcial o final (`evalId` ya existe en el modelo; revisar cómo se usa). Los parciales pertenecen a una materia.
  - En los selectores **no aparecen** los parciales con estado `rendido`, `aprob` o `desaprob`, ni los proyectos terminados o archivados. Las tareas que ya estaban vinculadas a ellos siguen mostrando el vínculo.
  - En el detalle de un parcial se ven sus tareas y su progreso.
  - Con tests.

- [x] **B4 · Pasar tareas a otro día, fácil**
  Pedido: *"poder pasar tareas de hoy a mañana arrastrándolas · en la sección hoy, abajo de hoy en la sección mañana que se pueda pasar a pasado mañana y un par de días más de última una semana más"*.
  Listo cuando:
  - En la vista Hoy, debajo de "Hoy", hay una sección "Mañana".
  - Se puede **arrastrar** una tarea de Hoy a Mañana y viceversa. Tiene que funcionar con el dedo en el celular: pointer events con long-press para empezar a arrastrar, sin romper el scroll ni el orden manual que ya existe (`ord`).
  - Además, cada tarea tiene una acción rápida "Mover a…": mañana, pasado mañana, en 3 días, próximo lunes, en 1 semana, elegir fecha. Que se pueda hacer con una mano.
  - Con deshacer. Tests de arrastre (desktop y mobile) y del menú.

- [x] **B5 · La lista completa se limpia sola**
  Pedido: *"que la lista completa se vaya actualizando o borrando sola por ejemplo cuando pasan 5/10 días de una tarea hecha"*.
  Listo cuando: las tareas hechas hace más de N días (ajustable; por defecto 7) dejan de aparecer en "Lista completa". **No se borran**: siguen en Historial y en estadísticas. Hay una opción "mostrar hechas antiguas". Tests con reloj simulado.

## C. Series y repeticiones (lo que más frustra)

Pedido: *"hacer más intuitiva fácil y no tan compleja todo lo que sea series y repeticiones, poder correr todo tal cantidad de días, poder manejarlo mucho mejor y visualmente mejor, que te des cuenta lo que estás haciendo"* y *"lo más tedioso de todo está siendo series y repeticiones, tela mente es una paja hacer una es muy muy confuso, que se agregan días se sacan pero si pero no pero los últimos pero que todo pero no se carga.... es frustrante la verdad, necesito una interfaz siempre comprensible y fácil, y que me de flexibilidad, si quiero agregar una hora y media a 5 tareas que están distribuidas cada 3 días cada una pero a una de ellas sumarle 10 minutos debo poder, no puede ser que sea tan tedioso"*.

Hoy hay dos modelos mezclados: "períodos" (una tarea por día, ver `saveQuickTask`) y "recurrentes" (`t.recur`, ver `occursOn`), más el editor de series (`viewSeries`, `seriesApplyTime`, `seriesExtend`, `seriesTrim`...). Para el usuario tendría que ser **un solo concepto: "Repetir"**.

- [x] **C1 · Crear repeticiones sin pensar** (depende de A3)
  Listo cuando:
  - Al crear una tarea hay un control "Repetir" claro: no se repite / todos los días / cada N días / ciertos días de la semana / cada semana / cada mes. Fin: en una fecha / después de N veces / sin fin.
  - **Vista previa en vivo** mientras configurás: mini calendario o lista con las fechas exactas que se van a crear ("Se van a crear 5 tareas: lun 10, jue 13, dom 16, mié 19, sáb 22"). Cero sorpresas.
  - Por defecto "no se repite": imposible crear una serie sin querer.
  - Decidir y documentar si internamente todo se materializa en tareas individuales con `seriesId` (más simple para editar una sola) o si se mantiene `recur` para las infinitas. Recomendación: materializar las finitas; mantener un modelo simple para las "sin fin".
  - Tests de cada patrón y del preview (fechas exactas, con reloj simulado).

- [x] **C2 · Editar una serie con flexibilidad total** (depende de C1) *(partido en C2a y C2b por el agente: es grande para una corrida)*
  - [x] **C2a** · Lista de todas las ocurrencias (fecha, minutos, estado) con selección (varias / todas / todas las pendientes) y acciones masivas: sumar/restar/fijar tiempo, mover ±N días, cambiar hora, borrar. Vista previa antes de aplicar ("Vas a sumar 1 h 30 a 5 tareas") y deshacer. Test del caso exacto de Bauti.
  - [x] **C2b** · Editar una sola ocurrencia en la lista (+10 min sin tocar el resto), agregar ocurrencias (siguiendo el patrón o una fecha suelta) y quitar puntuales. Tests de extender, quitar, mover y borrar en desktop y mobile.
  Listo cuando:
  - El editor de serie muestra **todas las ocurrencias** en una lista o línea de tiempo visual (fecha, minutos, estado).
  - Se puede **seleccionar** varias (o todas, o "todas las pendientes") y aplicar: sumar o restar tiempo, fijar tiempo, mover fechas ±N días, cambiar hora, borrar.
  - Se puede editar **una sola** ocurrencia (por ejemplo, +10 min) sin afectar al resto.
  - Agregar ocurrencias (extender la serie siguiendo el mismo patrón, o una fecha suelta) y quitar ocurrencias puntuales.
  - Antes de aplicar un cambio masivo se muestra qué va a pasar ("Vas a sumar 1 h 30 a 5 tareas"). Después hay deshacer.
  - El caso exacto de Bauti es un test: 5 tareas cada 3 días → +1 h 30 a las 5 → +10 min a una sola → verificar los minutos de cada una.
  - Tests de extender, quitar, mover y borrar, en desktop y mobile.

- [x] **C3 · Series bien integradas**
  Listo cuando: desde cualquier tarea de una serie se puede abrir la serie ("parte de una serie · 3 de 5"). Al editar una ocurrencia, la app pregunta "¿solo esta / esta y las siguientes / todas?", como el calendario del iPhone. La sección "Series y repeticiones" del menú pasa a ser una lista simple de series activas o desaparece si ya no hace falta. Con tests.

## D. Calendario y gráficos

- [x] **D1 · Acomodar el calendario** *(partido en D1a y D1b por el agente)*
  - [x] **D1a** · Celu estilo iOS: el mes entra en la pantalla (antes se salía: solo se veían lun–mié), puntos de colores por día, día elegido con su lista abajo (parciales y tareas con hora), "+ Tarea para el …", deslizar para cambiar de mes.
  - [x] **D1b** · Desktop: horas de cada día legibles ("1.8 h" → "1 h 50 m" o similar), crear una tarea en un día desde la celda (sin pasar por el resumen), marcar mejor los parciales en la celda, revisar desbordes con muchos ítems. Capturas antes/después.
  Pedido: *"acomodar calendario"*.
  Listo cuando: el calendario mensual se lee bien en el celular (estilo Calendario de iOS: puntos de colores por día y la lista del día elegido abajo) y en desktop (tareas y parciales visibles en cada celda, sin desbordes). Se marcan hoy y los parciales. Tocar un día muestra sus tareas con hora. Se puede crear una tarea en ese día. Navegación fluida entre meses (botones + deslizar en el celu). Capturas antes y después en la bitácora.

- [x] **D2 · Gráficos que sirvan** *(partido en D2a y D2b por el agente)*
  - [x] **D2a** · Vista nueva "Progreso" (reemplaza a Estadísticas en el menú): 5 tarjetas que responden una pregunta cada una (esta semana vs la pasada a esta altura, ¿voy al día?, ¿llego a los parciales?, tiempo por materia en 14 días con su próximo parcial, constancia con racha y 28 días). Estado vacío, tests con el fixture. Lo viejo queda en "Estadísticas detalladas" (`#/stats/detalle`).
  - [x] **D2b** · Decidir qué se va de "Estadísticas detalladas" (KPIs repetidos, póster/informe, CSV) y borrarlo o integrarlo; pasar la lógica de semana a `computeStats` si conviene. Ver X3 (detalle del parcial) que encaja acá.
  Pedido: *"reacomodar gráficas solo las necesarias"* y *"los gráficos hoy son una mierda no me sirvan para nada"*.
  Listo cuando:
  - Se reemplaza la sección de estadísticas por **pocos gráficos que respondan preguntas reales** de un estudiante. Proponer y justificar en la bitácora. Punto de partida: ¿cuánto estudié esta semana vs la anterior? ¿Voy al día o atrasado? ¿Cuánto le dedico a cada materia vs lo que necesita según sus próximos parciales? ¿Cuántos días faltan para cada parcial y cuánto preparé? ¿Mi racha o constancia?
  - Estilo Apple Salud / Fitness / Tiempo en pantalla: un número grande y claro arriba, barras simples, colores con significado, sin ejes recargados y sin leyendas innecesarias, animación sutil al entrar.
  - Todo lo que no responde una pregunta útil se va (incluido el "informe descargable/póster" si no aporta; decidir).
  - Funciona con 0 datos (estado vacío lindo) y con muchos datos (usar el fixture de A1).
  - Tests de que los números son correctos para el fixture.

## Noche 3 (pedidos del 5/11 a la mañana, después de probar en el celu) — HACER PRIMERO, en este orden: S2, M2, M1

- [x] **S2 · Que los cambios lleguen solos y rápido al otro dispositivo, y poder actualizar a mano**
  Pedido (5/11 11:43): *"no hay un actualizar en el celu, por lo tanto si hago un cambio en la compu no impacta en el celu hasta que cierre y vuelva a entrar"*.
  Estado actual (`syncInit`, `syncNow`, `syncApply` en `app.js`): baja cambios al abrir, al volver a primer plano (`visibilitychange`) y cada 60 s con la app visible; `syncApply` ya redibuja. En la práctica, en el iPhone (app en la pantalla de inicio) Bauti no ve los cambios hasta cerrar y abrir. Investigar por qué (¿no llega `visibilitychange` en standalone?, ¿60 s es demasiado?, ¿el SW cachea `/api/`?, ¿`render()` no refresca un modal o una hoja abierta?) y arreglarlo de raíz.
  Listo cuando:
  - Con la app abierta, un cambio hecho en otro dispositivo aparece en **≤ 15 s** sin tocar nada. Para no gastar: el `GET` manda la versión que ya tiene y la función responde `304`/"sin cambios" barato si no hay nada nuevo (actualizar `functions/api/sync.js` y sus tests). Escuchar también `pageshow`, `focus` y `online`.
  - **Actualizar a mano**: en el celu, **tirar hacia abajo** desde arriba de la lista (pull-to-refresh, con su indicador y feedback háptico si existe) y, en todos lados, tocar el indicador "sincronizado" de arriba fuerza una sincronización ("Actualizando…" → "Al día · hace 3 s").
  - Si estás editando algo (modal abierto o escribiendo), los cambios remotos no te pisan lo que estás escribiendo: se aplican al cerrar.
  - Tests con dos contextos de navegador y red mockeada: el cambio llega solo en ≤ 15 s (con reloj simulado), el pull-to-refresh sincroniza, el 304 no redibuja ni gasta, y un modal abierto no se pierde.

- [x] **M2 · Formularios en el celu: nada encimado y el espacio bien usado**
  Pedido (5/11 11:44): *"temas de interfaz en el celu, cuando hay que crear una tarea, proyecto, etc. la hora se superpone con otros campos, no me fijé en todos pero en algunos pasa, fijate que tampoco otros campos se superpongan y que a la vez se ocupe el espacio lo mejor posible"*.
  Causa probable: los `<input type="time">` y `type="date"` de **Safari en iOS** tienen un ancho mínimo propio y se salen de las grillas de dos columnas (`.mrow`) aunque en Chrome se vean bien. Ojo: los tests corren en Chrome (WebKit no se puede descargar en este entorno), así que **no alcanza con que se vea bien en las capturas**: hay que hacer el CSS a prueba de Safari (`min-width:0`, `width:100%`, `box-sizing:border-box`, `-webkit-appearance:none` con estilo propio y alto fijo, `font-size:16px` para que iOS no haga zoom al tocar) y que las grillas tengan columnas `minmax(0,1fr)`.
  Listo cuando:
  - Inventario de **todos** los formularios y modales (nueva tarea con y sin Repetir y tramos, editar tarea, Mover a…, materia, parcial, proyecto, nota, hábito, año nuevo, avisos, sincronizar, configuración) en `docs/AUDITORIA.md`.
  - En el celu (390 px y 375 px de ancho, y 320 px como caso extremo): ningún campo se encima con otro ni se sale del modal; lo corto va de a dos por fila (fecha + hora, minutos + materia) y lo largo ocupa el ancho; botones de pie de modal siempre visibles; nada de scroll horizontal.
  - Test automático que abre cada modal en mobile y falla si dos campos (`input, select, textarea, button`) tienen sus rectángulos superpuestos o si alguno se sale del contenedor. Sumarlo al revisor de L1a.
  - Capturas de cada modal en mobile (claro y oscuro).

- [x] **M1 · Deslizar una tarea para borrarla (celu)**
  Pedido (5/11 11:43): *"en el cel poder eliminar una tarea arrastrando hacia la derecha"*.
  Listo cuando:
  - En el celu, **deslizar una tarea hacia la derecha** muestra detrás un fondo rojo con un tachito que crece con el gesto; si pasás el umbral (~40 % del ancho) o soltás rápido, se borra con animación y aparece **Deshacer**. Si soltás antes, vuelve a su lugar.
  - Tarea de una serie: pregunta "¿solo esta / esta y las siguientes / todas?" (como C3) antes de borrar.
  - No choca con lo que ya existe: el scroll vertical (si el gesto empieza vertical, es scroll), el mantener apretado para arrastrar (C5), tocar para abrir y el pull-to-refresh (S2). Pista de iOS: en Apple deslizar a la izquierda es borrar; acá va a la **derecha porque lo pidió Bauti**. Evaluar y proponer en la bitácora usar el otro lado (izquierda) para "Mover a…" o completar, sin hacerlo si no aporta.
  - Tests con touch emulado (borra, cancela, deshacer, serie, scroll vertical no borra) y video en `docs/capturas/M1-*.webm`.

- [x] **Q1 · Hallazgos de la revisión del 5/11 por la tarde (celu, con el fixture)** — hacer después de M1. *(hecho, corrida 01:07, Aula 2.45.0, `tests/q1-celu.spec.js`; "unificar Programación y Repetir" evaluado y descartado, ver bitácora)* Capturas tomadas en mobile con datos de ejemplo:
  - **Títulos de tareas que se cortan a la mitad del ancho** en Hoy y en Inicio ("Leer capítulo / 3", "Repasar / unidad 3", "Leer apunte de / límites") aunque sobra lugar a la derecha. Parece que volvió el problema de X2 en algunas filas (sobre todo las que tienen manija de arrastre o etiqueta de estado). Test: en mobile ningún título de 25 caracteres o menos ocupa más de una línea.
  - **"atrasada" repetido en cada fila** dentro de la sección "Atrasadas": es ruido. Dentro de esa sección, sacar la etiqueta; la fecha (en rojo suave) alcanza.
  - **Inicio en el celu es larguísimo y repite Hoy**: tres tarjetas grandes de un solo número (restante, 0/4, estudiado) ocupan una pantalla entera; "Estudio de hoy" con los bloques horarios; y Atrasadas + Para hoy repetidas tal cual están en la vista Hoy. Proponer un Inicio corto y útil en el celu: los tres números en **una sola fila compacta**, lo próximo (parciales y la siguiente tarea sugerida) y accesos; la lista completa vive en Hoy. Documentar la decisión.
  - **"Flexibles próximas a vencer"**: el texto de ayuda ("botón 'Hoy' para asignarlas") está metido en el encabezado y lo rompe en dos columnas. Pasarlo abajo como texto chico, o reemplazarlo por un botón claro.
  - **Nueva tarea en el celu**: Programación, Fecha y Hora van en **tres columnas** y la fecha se corta ("11/05/202…"). Encaja con M2: en el celu, Fecha + Hora en una fila y Programación arriba ocupando el ancho. Además, revisar si "Programación" (día fijo / fecha límite / sin fecha) y "Repetir" se pueden unificar en un solo control más simple.
  - **El ícono de tema de arriba** (◖) es casi invisible y no se entiende: usar un ícono claro de sol/luna con área táctil de 44 px, o moverlo a Configuración.

## Noche 2 (pedidos del 4/11 al mediodía) — HACER PRIMERO, en este orden: C4, C5, S1, G1, G2; después E1, F1, F2

- [x] **C4 · Tiempos de una serie por tramos, en segundos**
  Pedido: *"las series todavía no son del todo cómodas, más que nada el tema de tiempos. si yo creo una tarea de hoy a un mes para adelante y quiero que las primeras 10 sean de una hora, luego 2 de 1h y media, luego de 2h y luego de 3.. es muy tedioso, haz ese paso más fácil, se me ocurre que se muestren todas en una lista y que puedas seleccionar rápido y cambiar horarios"*.
  Listo cuando:
  - Al **crear** una serie (control Repetir) y al **editarla**, hay una forma rápida de poner tiempos distintos por tramos. Propuesta (el agente puede mejorarla, documentando por qué): "Tiempos por tramos": filas del tipo `[10] tareas de [1 h]`, `[2] de [1 h 30]`, `[3] de [2 h]`, `el resto de [3 h]`, con "+ agregar tramo"; la vista previa de fechas muestra el tiempo de cada una al lado y el total de horas.
  - En el editor de la serie, la lista de ocurrencias permite **selección rápida de rangos**: tocar la primera y Shift/clic o mantener apretado y arrastrar sobre la última en el celu selecciona todas las del medio; atajos "primeras N", "de la N a la M", "las que quedan". Con varias seleccionadas, poner el tiempo es 1 toque (chips: 30 m · 1 h · 1 h 30 · 2 h · 3 h · otro).
  - Cada fila muestra sus minutos editables en el lugar (tocar el número y cambiarlo), sin abrir otra pantalla.
  - Test con el caso exacto de Bauti: serie diaria de hoy a 30 días → 10 de 1 h, 2 de 1 h 30, el resto 2 h y las últimas 3 de 3 h; verificar los minutos de cada una. En desktop y mobile. Capturas.

- [x] **C5 · Arrastrar para ordenar tiene que ser fluido** *(bug de B4, en la compu; chico pero de uso diario: hacerlo justo después de C4)*
  Pedido (4/11 21:30): *"ahora ordenar las tareas arrastrando se vuelve súper difícil, nose por qué parece que se traba todo el tiempo, que sea fluido"*.
  **Aclaración de Bauti (21:38): el problema lo ve en la COMPU (con mouse); en el celu todavía no lo probó.** Priorizar desktop, sin descuidar iOS.
  Causa más probable en desktop: `.task{transition:.12s}` (transición de **todas** las propiedades) + `clearDropMarks()` saca y vuelve a poner `dropbefore/dropafter` en **cada** `pointermove`. La línea de destino (un `box-shadow`) arranca su transición de cero en cada movimiento y parpadea; encima, el `:hover` de las filas que pasan bajo el cursor anima fondo y acciones mientras arrastrás. Arreglo: transiciones solo de las propiedades necesarias, sin transiciones durante el arrastre (`body.is-dragging .task{transition:none}` salvo el desplazamiento de filas del punto 3), sin `:hover` mientras arrastrás, y cambiar clases solo cuando cambia el destino. Además, la manija `⣿` es chiquita y casi transparente (opacity .35): con mouse, permitir agarrar desde toda la fila con un umbral de 4–5 px (el clic sin movimiento sigue abriendo el editor).
  Otras causas probables (encontradas leyendo `dragPointerDown`…`dropTask` en `app.js` y el CSS de `.task`/`.dragghost` en `index.html`; confirmarlas antes de arreglar):
  1. **En el celu (iOS Safari), el navegador se queda con el gesto.** Las filas no tienen `touch-action: none` (solo la manija `.drag`) y `preventDefault()` en `pointermove` no frena el scroll en iOS. Después del long-press, Safari empieza a scrollear y manda `pointercancel`, y el arrastre se corta solo. Arreglo: cuando la fila queda "levantada", bloquear el scroll con un `touchmove` en `{passive:false}` + `preventDefault()` (y/o `touch-action:none` mientras dura el arrastre), sin romper el scroll normal cuando no hay arrastre.
  2. **Mucho trabajo en cada movimiento del dedo o del mouse:** `dragUpdate()` mueve el fantasma con `left/top` (fuerza layout), hace `querySelectorAll` para limpiar marcas y `elementFromPoint` en cada evento, y el auto-scroll vuelve a llamarlo en cada frame. Arreglo: un solo `requestAnimationFrame` por frame, fantasma con `transform: translate3d()`, cachear los rectángulos de las filas al empezar (y recalcular solo al scrollear), y tocar clases solo cuando cambia el destino.
  3. **No se siente como iOS:** hoy solo aparece una línea "antes/después". Las demás filas deberían **correrse animadamente** (`transform` con 150–200 ms) para abrir el hueco donde va a caer, y al soltar la fila tiene que "asentarse" en su lugar en vez de saltar.
  4. Revisar también el long-press (400 ms y 10 px de tolerancia): que no se dispare sin querer al scrollear ni cueste activarlo. En desktop, que se pueda agarrar de toda la fila (no solo de la manija) sin romper el clic que abre el editor (umbral de movimiento).
  Listo cuando:
  - Tests (mobile con touch emulado y desktop con mouse): arrastrar una tarea 4 posiciones hacia abajo y 2 hacia arriba deja el orden correcto; durante el arrastre no hay `pointercancel` y la página no scrollea sola; arrastrar hasta el borde hace auto-scroll y se puede soltar abajo; pasar de Hoy a Mañana sigue andando; un scroll normal sobre la lista no levanta ninguna tarea.
  - Medición: un test que arrastra con 60 movimientos y verifica que el handler de movimiento no fuerza layout síncrono (por ejemplo, contando llamadas a `getBoundingClientRect` durante el arrastre: tienen que ser O(1) por frame) y que el fantasma se mueve por `transform`.
  - **Video** del arrastre en mobile y desktop (Playwright `recordVideo`) en `docs/capturas/C5-*.webm`, para que Bauti lo vea.

- [x] **S1 · Compu y celu sincronizados** *(FUNDAMENTAL según Bauti; grande: partirlo en S1a/S1b/S1c; datos sagrados)*
  - [x] **S1a** · Motor: marcas de cambio (`state.sync.stamps`) y lápidas (`state.sync.tombs`) calculadas solas al guardar (sin tocar cada lugar que edita o borra), fusión por elemento `syncMerge`, migración al esquema 4 con copia previa, y la función `functions/api/sync.js` (GET/PUT con versión, clave hasheada, 401/404/409/413/503) con tests en Node.
  - [x] **S1b** · Cliente: `syncNow()` (bajar, fusionar, subir; reintento ante 409), disparadores (al abrir, al volver a primer plano, unos segundos después de cada cambio, cada ~1 min), indicador "sincronizado / sin conexión / falta activar", copia de seguridad antes de la primera fusión. Tests con dos contextos de navegador y la red mockeada (`page.route`).
  - [x] **S1c** · Pantalla en Configuración: activar (código al azar de 128+ bits), QR (generador propio, sin CDN) + copiar código, "ya tengo un código" (pegar o abrir el link del QR), desconectar, cambiar código, y el paso a paso de Cloudflare. Capturas.
  Pedido: *"quiero que estén conectados ambos, sino no tiene sentido, ambos dispositivos digo, nose si se maneja con cuenta o como eso, pero eso anotalo también porque es fundamental"*.
  Contexto: hoy cada dispositivo tiene sus datos en su IndexedDB; Bauti abrió la app en el iPhone y la vio vacía. La app ya está publicada en **Cloudflare Pages** (`aula-pi0.pages.dev`, conectada al repo, se despliega sola desde `main`).
  Propuesta (el agente puede mejorarla documentando por qué):
  - **Backend mínimo con Cloudflare Pages Functions + KV** (gratis, mismo proyecto, sin servidor aparte): `functions/api/sync.js` con `GET` y `PUT`. El agente NO tiene acceso a Cloudflare: el código queda listo y en el resumen va un paso a paso de 2 minutos para que Bauti cree el namespace KV y lo vincule al proyecto (Settings → Functions → KV bindings, nombre de variable fijo, por ejemplo `AULA_KV`). Mientras no esté vinculado, la app funciona igual que hoy y la sync muestra "falta activar en Cloudflare".
  - **Sin cuentas ni contraseñas**: "Código de sincronización". En la compu: Configuración → Sincronizar → "Activar" genera una clave larga al azar (128 bits o más) y muestra un **QR** + el código para copiar. En el celu: "Ya tengo un código" → escanear QR con la cámara o pegarlo. En KV se guarda bajo un hash de la clave; nadie sin la clave lee nada. Opción "desconectar este dispositivo" y "cambiar código".
  - **Sincronización automática**: al abrir la app, al volver a primer plano (`visibilitychange`), unos segundos después de cada cambio y cada ~1 min con la app abierta. Indicador discreto (el "todo guardado" de arriba pasa a "sincronizado" / "sin conexión, se sube después").
  - **Fusión por elemento, no "el último pisa todo"**: cada tarea, parcial, materia, proyecto, nota, hábito, sesión, etc. tiene `updatedAt` (migración: ponerlo a todo lo existente) y los borrados dejan una lápida (`deleted: true` + `updatedAt`) en vez de desaparecer, así un borrado en el celu no "revive" desde la compu. Al sincronizar: por id gana el `updatedAt` más nuevo; ajustes también por campo o por bloque. Para escritura concurrente usar versión/ETag en el PUT (si cambió en el medio, bajar, fusionar y reintentar).
  - **Primera vez con datos en los dos lados** (justo el caso de Bauti: compu llena, celu vacío o con algo): fusionar, nunca reemplazar a ciegas; antes, copia de seguridad automática local en los dos dispositivos.
  Listo cuando:
  - Tests de la función con un KV falso en Node (GET/PUT, clave inválida, conflicto de versión, tamaño grande) y tests de la app con la red **mockeada** (`page.route`): dos "dispositivos" (dos contextos de navegador) que crean, editan y borran cosas cruzadas y terminan iguales; borrar en uno no revive; sin conexión no se pierde nada y sube al volver; primera vez con datos en ambos fusiona sin perder.
  - Funciona en iPhone/Safari (sin APIs que Safari no tenga; QR con una librería mínima embebida o generada a mano, sin CDN en runtime si se puede).
  - Paso a paso para Bauti en `docs/RESUMEN-NOCHE.md` y en la propia pantalla de Configuración: crear KV, vincularlo, redeploy, activar en la compu, escanear desde el celu.
  - Bitácora explicando la decisión (por qué no Firebase/Supabase: requieren que Bauti cree cuenta y proyecto y meter claves; Cloudflare ya lo tiene).

- [x] **G1 · Años de cursado: un espacio nuevo por año** *(grande, toca el modelo: partirlo; datos sagrados)* — hecho en una corrida (esquema 5, Aula 2.34): `state.years`, lo que no tiene `yearId` es del primer año, en memoria solo lo del año que se ve (`fullState()` junta todo para guardar/sincronizar).
  Pedido: *"esta app la quiero seguir usando el año que viene y todos los que me queden de facultad así que habrá que tener una forma de dividir el año ... y también separar por año osea que se cree como un nuevo espacio de trabajo totalmente nuevo para 4to yo poder crearlo"*.
  Listo cuando:
  - Existe el concepto **año / ciclo** (ej. "3.º año · 2026", "4.º año · 2027"): nombre, fechas de inicio y fin. Migración: todo lo actual pasa al primer ciclo ("3.º año · 2026" o "Año 2026" si no se sabe; editable), con copia previa.
  - **Crear un ciclo nuevo** desde Configuración (o desde el selector de año): asistente corto que pregunta nombre y fechas y deja elegir qué traer: nada / materias que siguen (por ejemplo, las anuales o las que no aprobé) / hábitos / notas. Por defecto, espacio limpio.
  - Un **selector de año** visible pero discreto (como el de cuentas de una app de Apple) para cambiar de espacio. Todas las vistas, Progreso y búsqueda muestran solo el año activo; los años viejos quedan en modo consulta (se pueden ver, no molestan).
  - Las copias de seguridad incluyen todos los años.
  - Tests: migración del fixture al primer año sin perder nada; crear 4.º año limpio; cambiar de año y ver solo lo suyo; volver al viejo y que todo esté intacto; recargar y que se mantenga el año activo.

- [x] **G2 · Resumen del año estilo "Spotify Wrapped"** (depende de G1) *(partido en G2a + G2b por el agente)*
  - [x] **G2a** · Números del año + historia a pantalla completa (tocar/teclado, saltea lo que falta, año en curso y cerrados, 0 datos). *(corrida 02:06, Aula 2.37.0, `tests/wrapped.spec.js`)*
  - [x] **G2b** · Compartir/guardar cada pantalla como imagen (canvas → PNG; `navigator.share` con archivo en el iPhone, si no descarga). *(corrida 02:06, Aula 2.38.0)*
  Pedido: *"quiero poder ver por año el resumen del mismo como un spotify resumen bien interesante"*.
  Listo cuando:
  - Para cada año hay un **"Tu año en Aula"**: historia de pantallas a pantalla completa que se pasan tocando (como las stories), con animaciones y colores lindos. Ideas: horas totales estudiadas y su equivalente divertido, la materia a la que más le dedicaste, el mes y el día más productivo, parciales aprobados y mejor nota, racha más larga, tareas completadas, a qué hora estudiás más ("sos de estudiar de noche"), la serie más larga que completaste, una frase de cierre. Solo datos reales; si falta un dato se salta esa pantalla.
  - Se puede **compartir/guardar** cada pantalla como imagen (canvas → PNG; en iPhone, `navigator.share` con archivo si está disponible, si no descarga).
  - Disponible para el año en curso ("hasta ahora") y para los años cerrados. Con el fixture y con 0 datos (no se rompe).
  - Tests de los números con el fixture y de que se navega entera sin errores; capturas de varias pantallas en mobile.

- [ ] **L1 · Cazar errores de lógica y de experiencia en toda la app** *(trabajo continuo: arrancar con L1a esta noche si sobra tiempo después de G1; el resto en las noches siguientes, intercalado)*
  Pedido (4/11 21:49): *"temas de lógica en general, por ejemplo una que vi recién: caen dos parciales el mismo día pero arriba dice 'próximo parcial Economía en 2 días'... que diga Economía y tal en 2 días. Esas cosas que por ahí son pequeñas pero son de lógica o de experiencia de usuario, que debe haber varias... fijate si podés sumar eso también e investigar bien profundo e ir resolviéndolas"*.
  Método (no al azar, sistemático):
  1. **Inventario:** abrir `docs/AUDITORIA.md` con una tabla: dónde, qué pasa, qué debería pasar, gravedad (rompe / confunde / detalle), estado. Todo lo que se encuentre va ahí primero.
  2. **Revisor automático de textos:** un test que carga el fixture (y estados "raros": vacío, 1 materia, 200 tareas, títulos larguísimos, dos parciales el mismo día, tareas de 0 min, todo hecho, todo atrasado), recorre **todas** las vistas y modales en desktop y mobile, y falla si el texto visible contiene `NaN`, `undefined`, `null`, `Invalid Date`, `[object`, plurales mal ("1 días", "1 tareas"), "en 0 días", números negativos donde no van, o elementos que se salen de la pantalla (ancho > viewport).
  3. **Recorrido pensado**, vista por vista, con preguntas de casos borde: empates (dos cosas el mismo día o la misma hora), límites (medianoche y "mi día termina a las 4", fin de mes, día 31 en repeticiones mensuales, inicio de semana configurable), cosas borradas o archivadas (materia borrada con tareas y parciales, parcial borrado con tareas vinculadas, proyecto terminado), cosas vencidas (tarea con hora que ya pasó hoy, parcial ya pasado sin nota), y coherencia entre vistas (el mismo número en Inicio, Hoy, Progreso y en el detalle).
  4. Arreglar de a uno, cada uno con su test, y marcar en `AUDITORIA.md`.
  - [x] **L1a1** · *(hecho, corrida 01:06: arriba, en la sugerencia de Inicio y en el detalle de materia; ver `docs/AUDITORIA.md`)*
  - [x] **L1a2** · El revisor automático de textos (punto 2) y sus primeros hallazgos. *(hecho, corrida 02:06: `tests/revisor.spec.js`, hallazgos 8–13 en `docs/AUDITORIA.md`)*
  - [x] **L1a** *(partido en L1a1 + L1a2)* · El caso de Bauti: arriba ("próximo parcial", `renderTop` → `nextEv`, que hoy toma `evs[0]`) y en todo lugar que muestre "el próximo parcial" (Inicio, detalle de materia, Progreso, recordatorios): si hay varios el mismo día, mostrarlos juntos ("Economía y AN · en 2 días", o "2 parciales · en 2 días" si no entran). Test con dos y tres parciales el mismo día. Después, el revisor automático de textos (punto 2) y los primeros hallazgos.
  - [x] **L1b** · Recorrido pensado (punto 3) de Hoy, Semana, Calendario, Materias, Parciales y Series. *(hecho, corrida 03:05: hallazgos #7 y #14–#20 en `docs/AUDITORIA.md`; #19 y #20 quedan para F1)*
  - [ ] **L1c** · Recorrido pensado de Progreso/estadísticas, Configuración, Copias, búsqueda, y de las cosas nuevas (sincronización, años). Repetir después de F1.
  Listo cuando: `docs/AUDITORIA.md` existe y está al día, el revisor automático corre en `npm test`, y no quedan hallazgos "rompe" ni "confunde" abiertos (los "detalle" pueden quedar listados con su porqué).

## Noche 3 o siguientes — NO hacer la noche del 5/11 (Bauti lo pidió "para los próximos días")

- [ ] **H1 · Estadísticas que sirvan de verdad, con historial** *(grande: partir en H1a–H1f; hacerlas en orden)*
  Pedido (4/11 21:08): *"que se puedan hacer más cosas con las estadísticas, nose qué pero algo que me sirva. fijate y pensalo y analizalo bien porfa pero así como están ahora ni me sirven ni son estéticas, necesito algo que me sirva de verdad, no solo de hoy además, un histórico también, tres palabras: QUE ME SIRVA, que sea útil"*.

  **Diagnóstico** (hecho al analizar el código el 4/11):
  1. **Casi todo depende del "tiempo estudiado"** (`state.sessions`), que hoy solo se carga a mano o con el popup al completar una tarea. Si Bauti saltea el popup, las estadísticas mienten o quedan vacías. Sin datos confiables, ningún gráfico sirve: esto se arregla primero.
  2. **Progreso solo mira el presente** (esta semana, 14 días, 28 días): no hay forma de ver cómo le fue en octubre, en el cuatrimestre o en el año, ni comparar.
  3. **"Estadísticas detalladas"** es un tablero genérico (KPIs, evolución, día de la semana, hora, mapa de calor) que muestra datos pero no responde nada ni dice qué hacer, y visualmente es denso y de otro estilo que Progreso.
  4. **Falta lo que realmente le importa a un estudiante:** ¿cumplo lo que planifico?, ¿la semana que viene es manejable?, ¿cuánto me tengo que preparar para un parcial y qué funcionó la vez pasada?, ¿cómo voy en cada materia y en la carrera?

  **Principio:** cada pantalla responde una pregunta y, si se puede, termina en una acción ("mové 2 tareas del jueves", "empezá a preparar AN"). Modelo Apple Salud: **Resumen** con tarjetas → tocás una → **detalle con historial** y selector `S · M · Cuatri · Año · Todo` + flechas para ir al período anterior. Un solo estilo de gráfico para toda la app.

  - [ ] **H1a · Datos confiables (sin fricción)**
    - Al completar una tarea: un toque. Por defecto "lo estimado" con chips rápidos (`-30 m · = · +30 m · +1 h · otro`) en una hoja que no bloquea. Opción en Configuración: "no preguntar, usar el estimado".
    - Registrar **cuándo** se movió una tarea (`moves: [{from, to, at}]`) y su fecha original (`origDate`), para medir "cumplido en el día" y "postergaciones". Migración con copia y test con el fixture.
    - Test: completar 10 tareas con un toque cada una y que todas sumen tiempo; mover una tarea 2 veces y que quede registrado.

  - [ ] **H1b · "¿Cumplo lo que planifico?"** (lo más útil según el análisis; no necesita tiempo cargado)
    - Por semana: tareas planificadas vs hechas en su día, hechas tarde, postergadas, sin hacer. Un número grande ("cumpliste 78 %") y la tendencia de las últimas 8 semanas.
    - Qué se posterga más (por materia y por tipo de tarea) y qué día de la semana falla más.
    - Con historial (S/M/Cuatri/Año).

  - [ ] **H1c · "¿La semana que viene es manejable?"** (mirar hacia adelante)
    - Carga planificada por día para las próximas 2–4 semanas (horas de tareas) contra tu **capacidad real** (promedio de lo que efectivamente hacés por día, de H1a/H1b). Días sobrecargados en rojo, parciales marcados.
    - Acción: "este jueves tenés 6 h y solés hacer 3 h → mover 2 tareas" lleva al menú "Mover a…" (B4).

  - [ ] **H1d · Parciales: preparación y "qué funcionó"**
    - Para cada parcial por delante: horas preparadas vs las que te llevó prepararte los anteriores de esa materia o en promedio; con cuántos días de anticipación arrancaste.
    - **Retrospectiva** de los parciales ya rendidos: horas, cuándo empezaste, cumplimiento del plan y nota. Si hay suficientes datos, una conclusión simple y honesta ("con +8 h y empezando 10 días antes, aprobaste 4 de 4"). Nada de correlaciones con 2 datos: si no alcanza, decirlo.

  - [ ] **H1e · Historial por materia y del cuatrimestre/año**
    - Cada materia tiene su pestaña "Historial": horas por semana a lo largo del cuatrimestre con los parciales marcados, tareas, notas, promedio y estado (cursando / regular / aprobada).
    - Vista "Mi cursada": todas las materias del año en una tabla limpia (horas, cumplimiento, notas, estado) y, con G1, comparación entre años. Si se carga el plan de la carrera (opcional), avance de la carrera ("aprobadas 18 de 41").
    - Diario: tocar cualquier día pasado (desde el calendario o el historial) y ver qué hiciste, cuánto y qué quedó pendiente.

  - [ ] **H1f · Rediseño visual y limpieza**
    - Un solo sistema de gráficos (barras redondeadas, colores por materia, número grande + frase arriba, sin ejes recargados), tema claro y oscuro, animación sutil, accesible (no solo color).
    - "Estadísticas detalladas" desaparece: lo que sirva se reubica en H1b–H1e; lo que no responde nada (mapa de calor anual, hora del día, etc.) se quita o pasa a "Tu año" (G2). El informe descargable y el CSV se mantienen como "Exportar" en el historial.
    - Estados vacíos que explican qué hacer para que la tarjeta se llene.

  Listo cuando (para todo H1): números correctos verificados con el fixture (y un fixture más largo, de un cuatrimestre entero, generado para esto); navegación del historial testeada (cambiar de período, ir y volver); capturas mobile y desktop, claro y oscuro; y una sección en la bitácora explicando qué pregunta responde cada pantalla y por qué se descartó lo que se descartó.

## E. Notificaciones al celular

- [ ] **E1 · Recordatorios que llegan al celu** *(partido en E1a–E1c por el agente, corrida 07:05: es grande y toca el modelo)*
  - [x] **E1a1** · Modelo + migración (esquema 6, Aula 2.40): `reminders` opcional, `settings.reminderDefaults`, `reminderTimes()`. *(hecho, corrida 03:05; `tests/recordatorios.spec.js`)*
  - [x] **E1a2** · La interfaz: "Avisarme" en el editor de tarea (solo con hora) y de parcial, y los valores por defecto en Configuración. *(hecho, corrida 04:07, Aula 2.41.0; además los avisos ya suenan como notificación local con la app abierta: `tests/recordatorios-ui.spec.js`)*
  - [x] **E1a** *(partido en E1a1 + E1a2 por el agente)* · Modelo + migración: `reminders: [{amount, unit: "min"|"h"|"d"}]` en tareas con fecha y hora y en parciales; defaults en `settings.reminderDefaults` (parciales: 7 d y 1 d). Paso de migración con copia previa (A1) y test de que el fixture sobrevive. UI en el editor de tarea y de parcial ("Avisarme: 30 min antes · + agregar").
  - [x] **E1b1** *(partido por el agente, corrida 01:07; hecho en esa misma corrida: esquema 7, Aula 2.46.0, `tests/ntfy.spec.js`)* · Configuración de ntfy: `settings.ntfy` (servidor, tema al azar de 128 bits, mensaje genérico sí/no, activo) con paso de migración al esquema 7 (copia previa + test con el fixture), pantalla paso a paso (instalar ntfy, suscribirse al tema con QR/link, "mandar notificación de prueba"), tests con `page.route` (nunca ntfy.sh real). Antes de empezar: leer en docs.ntfy.sh las secciones "Scheduled delivery", "Updating + deleting notifications", "Limitations" y CORS (la página es larga: buscarlas puntualmente) y anotar límites en la bitácora.
  - [x] **E1b2** *(hecho, corrida 02:06, Aula 2.47.0, esquema 8, `tests/ntfy-programar.spec.js`: registro sincronizado `state.ntfySched`, ventana de 48 h, cancelar con DELETE por sequence id)* · Programar los avisos en ntfy (header `At`/`Delay`) para lo que entra en la ventana de antelación; reprogramar al abrir la app; editar/borrar → cancelar si la API lo permite, si no ignorar (documentar). **Ojo, hallado al planificar:** con la sync activa hay **dos dispositivos** con los mismos datos; si los dos programan, llega cada aviso **dos veces**. Decidir y documentar: por ejemplo, un registro sincronizado de lo ya programado (`id de aviso → hora`) para que el segundo dispositivo no repita, o que solo programe uno ("este dispositivo manda los avisos"). **Otro hallazgo:** no está claro que ntfy.sh deje cancelar un mensaje programado (la doc consultada no lo dice); si no se puede, una tarea que movés de hora igual avisa a la hora vieja. Mitigación posible: programar solo lo de las próximas ~24 h (no los 3 días que permite) y avisar en la bitácora. Mandar con parámetros en la URL (`?title=&at=`), no headers: ver `ntfySend`.
  - [x] **E1b** *(partido en E1b1 + E1b2)* · ntfy: Configuración paso a paso (instalar ntfy, tema al azar, "mandar notificación de prueba", "mensaje genérico" por privacidad). Programar con header `At` lo que entra en la ventana de antelación; reprogramar al abrir la app; si se edita/borra la tarea, ignorar al disparar (documentar). Tests con `page.route` (nunca ntfy.sh real).
  - [ ] **E1c** · Respaldo local (`checkReminders` con la app abierta) usando los mismos `reminders`, y bitácora con por qué WhatsApp/mail necesitan servidor. **Hallado en E1b2:** (1) con ntfy activo y la app abierta en el celu con notificaciones locales, el mismo aviso puede sonar dos veces (local + ntfy): si la clave está en `state.ntfySched`, que la local no suene; (2) `checkReminders` mira `state.tasks`, que con un año viejo a la vista solo tiene ese año: usar `fullState()` como `ntfyWanted`.
  Pedido: *"alguna forma de ver desde el celu o mandar una notificación"* y *"a las tareas/eventos que se les pueda poner hora, que permita mandar una notificación a mi celular lo más simple que se pueda, si es por wsp mejor, sino bueno mail está bien, y que se pueda acomodar para que diga tantos minutos o días antes de esa hora y también que se pueda hacer lo mismo para eventos o tareas o parciales más que nada con fecha"*.
  Contexto técnico: la app no tiene servidor y los datos viven en el celular. WhatsApp o mail necesitan un servidor que mande el mensaje a la hora indicada.
  Propuesta a investigar y decidir (documentar todo):
  - **ntfy.sh** (gratis, sin cuenta): Bauti instala la app ntfy en el celular y se suscribe a un tema secreto. Aula le pide a ntfy que entregue el mensaje en el futuro (envío programado con el header `At`/`Delay`; revisar la documentación oficial para límites, por ejemplo el máximo de antelación, y si se puede cancelar un mensaje programado). Llega como push real aunque Aula esté cerrada. Lo que esté más lejos que el límite de antelación se programa cuando la app se abre de nuevo. Considerar privacidad: el título de la tarea viaja a ntfy.sh. Ofrecer "mensaje genérico" como opción.
  - Respaldo: notificaciones locales del navegador (ya hay algo en `checkReminders`) cuando la app está abierta o instalada.
  - Dejar escrito en la bitácora por qué WhatsApp o mail no se hacen hoy (requieren servidor) y qué haría falta para tenerlos (por ejemplo, un worker gratuito y un proveedor).
  Listo cuando:
  - Cada tarea con fecha y hora, y cada parcial, puede tener uno o varios recordatorios: "X minutos / horas / días antes". Hay valores por defecto configurables para parciales (por ejemplo, 7 días y 1 día antes).
  - En Configuración: paso a paso para conectar el celular (instalar ntfy, tema generado al azar, botón "mandar notificación de prueba").
  - Si se edita la hora o se borra la tarea, el recordatorio se actualiza o cancela (o, si la API no lo permite, se ignora al dispararse; documentar).
  - Tests con la red de ntfy **mockeada** (`page.route`). Nunca pegarle a ntfy.sh real desde los tests.

## F. Pulido final

- [ ] **F1 · Nivel Apple en toda la app**
  **Dirección de diseño de Bauti (4/11 21:40):** *"colores diferentes, no me gustaría que pierda la esencia completa porque sino se vuelve muy monocromático y aburrido como Notion por ejemplo, Notion no me gusta, no tengo una que quiero que se copie o sea igual, simplemente mejorar la estética y UX/UI manteniendo un poco la esencia de Aula original"*.
  Traducido a reglas:
  - **Evolución, no reemplazo.** Aula tiene que seguir reconociéndose como Aula: el índigo de acento (`--acc`, editable), los colores por materia, el tono de los textos. Antes de tocar, sacar capturas "antes" y escribir en la bitácora qué es la esencia que se conserva.
  - **Con color y con vida.** Nada de gris sobre gris ni de blanco y negro tipo Notion. El color tiene que tener significado: cada materia con su color en todas partes (chips, puntos, barras, bordes sutiles), estados (atrasado, al día, hecho) y el acento para la acción principal. Fondos con leve calidez o tinte del acento, tarjetas con profundidad suave.
  - **No copiar ninguna app.** Usar el nivel de detalle de iOS (espaciado, jerarquía, animaciones, áreas táctiles) como vara de calidad, no como estética a imitar.
  - Mejorar la **UX** además de lo visual: menos ruido por pantalla, la acción principal obvia, todo a un toque o dos.
  Pedido: *"necesito una app hecha por el mismísimo apple para cuando me levante"*.
  Listo cuando: pasada de diseño completa sobre todas las vistas que quedan, con capturas antes y después en mobile y desktop, claro y oscuro. Tipografía del sistema (`-apple-system`/SF), espaciados consistentes, jerarquía, estados vacíos lindos, transiciones sutiles, iconografía coherente, barra de navegación inferior en mobile con las 4 o 5 vistas principales en vez de menú hamburguesa (evaluar), `prefers-reduced-motion`. Cero regresiones en los tests.

- [ ] **F2 · Pasada de calidad como usuario real**
  Usar la app de punta a punta en el celular (Playwright mobile) como un día real de Bauti: armar la semana, una serie de estudio para un parcial, mover tareas, completarlas tarde a la noche, ver el progreso. Todo lo que moleste se anota y se arregla. Repetir mientras haya tiempo.

---

## Agregados por el agente

(El agente agrega acá lo que encuentre necesario, con su porqué.)

- [x] **X1 · Que nada se pierda si cerrás la app justo después de un cambio**
  Por qué: en la corrida de A1 el test de humo "crear una tarea… persiste" falló **una vez** (no se pudo reproducir en 40 repeticiones). La causa probable: `change()` guarda con 500 ms de demora y, si la página se recarga o se cierra antes, el guardado de `beforeunload` abre una transacción de IndexedDB que el navegador puede cortar. En el celu eso sería "creé una tarea, cerré la app y no estaba".
  Listo cuando: los cambios hechos con acciones explícitas (crear, completar, borrar, mover) se guardan sin esperar el debounce, o hay una garantía equivalente (por ejemplo, `pagehide` + copia sincrónica en localStorage que `loadState` prefiera si es más nueva, comparando `meta.lastSave`). Test: crear una tarea y recargar al instante, repetido 20 veces, nunca pierde la tarea.

- [x] **X2 · En el celu, las filas de tareas usan solo la mitad del ancho**
  Por qué: en las capturas mobile de Hoy (B1/B2) el título y los datos de cada tarea se cortan a mitad de pantalla ("Leer apunte de / límites", "Segundo parcial / PE") aunque sobra lugar a la derecha. Probablemente la zona de acciones (`.tactions`) ocupa espacio aunque no se vea. Ver en F1 o antes si sobra tiempo.

- [x] **X3 · Detalle del parcial en el celu: 6 tarjetas de números antes de lo importante**
  Por qué: en la captura de B3 (mobile) el detalle de un parcial apila 6 tarjetas grandes (días, preparación, estudiado, temas, tareas, simulacros) y las tareas quedan varias pantallas más abajo. Estilo Apple: un número grande arriba (días que faltan + preparación) y el resto compacto en una fila. Encaja en D2/F1.

- [x] **X4 · Pulido de series después de C3** *(agregado por el agente)*
  Por qué: al revisar las capturas de C3: (1) el editor de una tarea de serie seguía ofreciendo el viejo "Recurrencia", que convertiría una ocurrencia en otra repetición infinita (confuso y peligroso); (2) el modal de una serie "sin fin" no decía cada cuánto se repetía ni cómo cambiar sus minutos u hora.

- [x] **X5 · Detalle del parcial en el celu: botones partidos** *(agregado por el agente)*
  Por qué: anotado en la corrida 07:06 al ver las capturas de X3: el encabezado dejaba "Nota" arriba y "Editar/Eliminar" abajo, "Tareas y plan de estudio" quedaba apretado con 3 botones partidos en dos renglones y el selector de dificultad del tema nuevo se cortaba ("Me‹").

- [x] **X6 · `sw.js` quedó vacío** *(agregado por el agente)*
  Por qué: en el commit de X3 (`59c67fa`) `sw.js` se commiteó vacío por accidente. Sin service worker la app no funciona offline y el celu no recibe bien las actualizaciones. Ningún test lo notó. Restaurado y con un test que verifica que exista, tenga sus handlers y que `CACHE_VERSION` coincida con `APP_VERSION`.

- [x] **X7 · Al abrir un modal, el foco se robaba lo que estabas escribiendo** *(agregado por el agente)*
  Por qué: el test de series "cambiar minutos de una…" fallaba ~1 de cada 3 veces (también en el commit anterior, no era nuevo). Causa: `openModal` enfoca el primer campo 30 ms después de abrir; si ya habías tocado otro campo (minutos), le sacaba el foco y lo que escribías caía en el título. Ahora solo enfoca si el foco no está ya dentro del modal.


- [ ] **X8 · Sync más inmediata que KV (opcional)** *(agregado por el agente en S2)*
  Por qué: Cloudflare KV guarda en caché cada lectura en el lugar de Cloudflare que la atiende (≥ 30–60 s). Si la compu y el celu entran por lugares distintos de la red de Cloudflare (por ejemplo, wifi de casa vs datos), un cambio puede tardar hasta ~1 min aunque la app pregunte cada 10 s. Si pasa, la solución de raíz es guardar en **D1** (base de Cloudflare, también gratis; Bauti tendría que crearla y vincularla como hizo con KV). No hacerlo hasta que Bauti confirme que lo nota.

## Ideas del agente

(Funcionalidades nuevas que el agente propone por su cuenta, con el permiso permanente de Bauti del 5/11. Cada una con: qué problema resuelve, cómo la usaría Bauti y por qué vale la pena. Se hacen después de lo pedido.)
