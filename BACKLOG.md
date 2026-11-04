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

## E. Notificaciones al celular

- [ ] **E1 · Recordatorios que llegan al celu** *(partido en E1a–E1c por el agente, corrida 07:05: es grande y toca el modelo)*
  - [ ] **E1a** · Modelo + migración: `reminders: [{amount, unit: "min"|"h"|"d"}]` en tareas con fecha y hora y en parciales; defaults en `settings.reminderDefaults` (parciales: 7 d y 1 d). Paso de migración con copia previa (A1) y test de que el fixture sobrevive. UI en el editor de tarea y de parcial ("Avisarme: 30 min antes · + agregar").
  - [ ] **E1b** · ntfy: Configuración paso a paso (instalar ntfy, tema al azar, "mandar notificación de prueba", "mensaje genérico" por privacidad). Programar con header `At` lo que entra en la ventana de antelación; reprogramar al abrir la app; si se edita/borra la tarea, ignorar al disparar (documentar). Tests con `page.route` (nunca ntfy.sh real).
  - [ ] **E1c** · Respaldo local (`checkReminders` con la app abierta) usando los mismos `reminders`, y bitácora con por qué WhatsApp/mail necesitan servidor.
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
