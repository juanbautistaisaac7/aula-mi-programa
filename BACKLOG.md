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

- [ ] **A2 · La tarea que hice anoche figura como hecha hoy**
  Pedido: *"si una tarea estaba programada para un día y la marcó al siguiente a las 00:1 pero la hice el día anterior se marca hoy, cambiar eso ver cómo se puede arreglar"*.
  Causa: `toggleTask` y el editor usan `doneAt = todayISO()` (ver ~línea 468 y ~3539), y `bumpDayDone(todayISO())`.
  Listo cuando:
  - Hay un ajuste **"Mi día termina a las…"** (por defecto 04:00). Antes de esa hora, "hoy" para la app sigue siendo el día anterior en todo lo que importa (vista Hoy, marcar hechas, rachas, estadísticas). Pensar bien si aplicarlo a `todayISO()` en general o solo a la lógica de completar; documentar la decisión.
  - Al completar una tarea con fecha pasada, se registra como hecha en su día programado si se completa dentro de ese margen. En otro caso, en el día real.
  - En el detalle de la tarea se puede ver y **editar "completada el"**.
  - Tests con reloj simulado (`setClock`): tarea del martes marcada miércoles 00:10 → cuenta martes; marcada miércoles 15:00 → cuenta miércoles; tareas recurrentes (`recurDone`) igual.

- [ ] **A3 · Una tarea simple aparece como "serie"**
  Pedido: *"ahora creo una tarea simple y aveces se me carga como serie nada que ver"*.
  Causa encontrada: `buildSeries()` (~línea 1419) agrupa como serie a **cualquier par de tareas con el mismo título y la misma materia**. Dos "Repasar" sueltas se vuelven serie.
  Listo cuando:
  - Las series son explícitas: las tareas creadas juntas como período o serie comparten un `seriesId`. Migración: los grupos actuales que realmente vienen de un período (fechas consecutivas o con intervalo regular, mismo título, mismos minutos y creadas el mismo día) reciben `seriesId`; el resto queda como tareas sueltas. Documentar la heurística.
  - Test: dos tareas simples con el mismo título **no** son serie; un período de 5 días sí lo es.
  - (Se complementa con C1/C2: este ítem solo arregla la identidad de las series.)

- [ ] **A4 · Sacar pomodoros y limpiar**
  Pedido: *"eliminar pomoodores para /y limpiar un poco todo"*.
  Listo cuando:
  - No hay más pomodoro en la interfaz: vista, menú, botones en tareas, atajos, ajustes, contadores de "pomodoros" en tareas y estadísticas.
  - Las **sesiones de estudio registradas se conservan** (son datos de tiempo estudiado). Si hace falta una forma simple de cargar tiempo estudiado, que quede como "registrar tiempo" manual en la tarea. Los campos viejos (`pomos`) quedan en los datos, pero no se muestran.
  - Se elimina el código muerto del pomodoro (`POMODORO`, `renderPomoUI`, `renderPomoView`, etc.) sin romper nada.
  - "Limpiar un poco todo": revisar el menú lateral. Hay 17 secciones y es demasiado. Proponer una estructura más corta (por ejemplo, agrupar Historial y Copias de seguridad dentro de Configuración) y documentar el porqué.
  - Borrar el archivo basura `MANIFE~1.WEB` (copia de `manifest.webmanifest` con nombre corto de Windows).

## B. Tareas: hora, comentarios, vínculos, mover días

- [ ] **B1 · Hora en tareas y eventos**
  Pedido: *"permitir poner horario a las tareas"*.
  Listo cuando:
  - Las tareas tienen hora opcional (`time: "HH:MM"`), al crearlas (modal rápido) y al editarlas. Los parciales ya tienen fecha; verificar que también tengan hora.
  - En Hoy, Semana y Calendario, las tareas con hora se ordenan por hora y la hora se ve clara. Las tareas sin hora van después.
  - Tests de creación, edición, orden y persistencia.

- [ ] **B2 · Comentarios en tareas**
  Pedido: *"poder poner comentarios a las tareas"*.
  Listo cuando: en el detalle de una tarea hay un hilo de comentarios (texto + fecha y hora), con agregar, editar y borrar (con deshacer). Un indicador sutil en la fila de la tarea muestra que tiene comentarios. Con tests.

- [ ] **B3 · Tareas → parciales → materias**
  Pedido: *"poder asignar tareas a parciales parciales a materias. cuando se termine un proyecto o parcial que esté aprobado o estado finalizado que no aparezca más como opción para meterle tareas"*.
  Listo cuando:
  - Al crear o editar una tarea se elige la materia y, dentro de ella, opcionalmente un parcial o final (`evalId` ya existe en el modelo; revisar cómo se usa). Los parciales pertenecen a una materia.
  - En los selectores **no aparecen** los parciales con estado `rendido`, `aprob` o `desaprob`, ni los proyectos terminados o archivados. Las tareas que ya estaban vinculadas a ellos siguen mostrando el vínculo.
  - En el detalle de un parcial se ven sus tareas y su progreso.
  - Con tests.

- [ ] **B4 · Pasar tareas a otro día, fácil**
  Pedido: *"poder pasar tareas de hoy a mañana arrastrándolas · en la sección hoy, abajo de hoy en la sección mañana que se pueda pasar a pasado mañana y un par de días más de última una semana más"*.
  Listo cuando:
  - En la vista Hoy, debajo de "Hoy", hay una sección "Mañana".
  - Se puede **arrastrar** una tarea de Hoy a Mañana y viceversa. Tiene que funcionar con el dedo en el celular: pointer events con long-press para empezar a arrastrar, sin romper el scroll ni el orden manual que ya existe (`ord`).
  - Además, cada tarea tiene una acción rápida "Mover a…": mañana, pasado mañana, en 3 días, próximo lunes, en 1 semana, elegir fecha. Que se pueda hacer con una mano.
  - Con deshacer. Tests de arrastre (desktop y mobile) y del menú.

- [ ] **B5 · La lista completa se limpia sola**
  Pedido: *"que la lista completa se vaya actualizando o borrando sola por ejemplo cuando pasan 5/10 días de una tarea hecha"*.
  Listo cuando: las tareas hechas hace más de N días (ajustable; por defecto 7) dejan de aparecer en "Lista completa". **No se borran**: siguen en Historial y en estadísticas. Hay una opción "mostrar hechas antiguas". Tests con reloj simulado.

## C. Series y repeticiones (lo que más frustra)

Pedido: *"hacer más intuitiva fácil y no tan compleja todo lo que sea series y repeticiones, poder correr todo tal cantidad de días, poder manejarlo mucho mejor y visualmente mejor, que te des cuenta lo que estás haciendo"* y *"lo más tedioso de todo está siendo series y repeticiones, tela mente es una paja hacer una es muy muy confuso, que se agregan días se sacan pero si pero no pero los últimos pero que todo pero no se carga.... es frustrante la verdad, necesito una interfaz siempre comprensible y fácil, y que me de flexibilidad, si quiero agregar una hora y media a 5 tareas que están distribuidas cada 3 días cada una pero a una de ellas sumarle 10 minutos debo poder, no puede ser que sea tan tedioso"*.

Hoy hay dos modelos mezclados: "períodos" (una tarea por día, ver `saveQuickTask`) y "recurrentes" (`t.recur`, ver `occursOn`), más el editor de series (`viewSeries`, `seriesApplyTime`, `seriesExtend`, `seriesTrim`...). Para el usuario tendría que ser **un solo concepto: "Repetir"**.

- [ ] **C1 · Crear repeticiones sin pensar** (depende de A3)
  Listo cuando:
  - Al crear una tarea hay un control "Repetir" claro: no se repite / todos los días / cada N días / ciertos días de la semana / cada semana / cada mes. Fin: en una fecha / después de N veces / sin fin.
  - **Vista previa en vivo** mientras configurás: mini calendario o lista con las fechas exactas que se van a crear ("Se van a crear 5 tareas: lun 10, jue 13, dom 16, mié 19, sáb 22"). Cero sorpresas.
  - Por defecto "no se repite": imposible crear una serie sin querer.
  - Decidir y documentar si internamente todo se materializa en tareas individuales con `seriesId` (más simple para editar una sola) o si se mantiene `recur` para las infinitas. Recomendación: materializar las finitas; mantener un modelo simple para las "sin fin".
  - Tests de cada patrón y del preview (fechas exactas, con reloj simulado).

- [ ] **C2 · Editar una serie con flexibilidad total** (depende de C1)
  Listo cuando:
  - El editor de serie muestra **todas las ocurrencias** en una lista o línea de tiempo visual (fecha, minutos, estado).
  - Se puede **seleccionar** varias (o todas, o "todas las pendientes") y aplicar: sumar o restar tiempo, fijar tiempo, mover fechas ±N días, cambiar hora, borrar.
  - Se puede editar **una sola** ocurrencia (por ejemplo, +10 min) sin afectar al resto.
  - Agregar ocurrencias (extender la serie siguiendo el mismo patrón, o una fecha suelta) y quitar ocurrencias puntuales.
  - Antes de aplicar un cambio masivo se muestra qué va a pasar ("Vas a sumar 1 h 30 a 5 tareas"). Después hay deshacer.
  - El caso exacto de Bauti es un test: 5 tareas cada 3 días → +1 h 30 a las 5 → +10 min a una sola → verificar los minutos de cada una.
  - Tests de extender, quitar, mover y borrar, en desktop y mobile.

- [ ] **C3 · Series bien integradas**
  Listo cuando: desde cualquier tarea de una serie se puede abrir la serie ("parte de una serie · 3 de 5"). Al editar una ocurrencia, la app pregunta "¿solo esta / esta y las siguientes / todas?", como el calendario del iPhone. La sección "Series y repeticiones" del menú pasa a ser una lista simple de series activas o desaparece si ya no hace falta. Con tests.

## D. Calendario y gráficos

- [ ] **D1 · Acomodar el calendario**
  Pedido: *"acomodar calendario"*.
  Listo cuando: el calendario mensual se lee bien en el celular (estilo Calendario de iOS: puntos de colores por día y la lista del día elegido abajo) y en desktop (tareas y parciales visibles en cada celda, sin desbordes). Se marcan hoy y los parciales. Tocar un día muestra sus tareas con hora. Se puede crear una tarea en ese día. Navegación fluida entre meses (botones + deslizar en el celu). Capturas antes y después en la bitácora.

- [ ] **D2 · Gráficos que sirvan**
  Pedido: *"reacomodar gráficas solo las necesarias"* y *"los gráficos hoy son una mierda no me sirvan para nada"*.
  Listo cuando:
  - Se reemplaza la sección de estadísticas por **pocos gráficos que respondan preguntas reales** de un estudiante. Proponer y justificar en la bitácora. Punto de partida: ¿cuánto estudié esta semana vs la anterior? ¿Voy al día o atrasado? ¿Cuánto le dedico a cada materia vs lo que necesita según sus próximos parciales? ¿Cuántos días faltan para cada parcial y cuánto preparé? ¿Mi racha o constancia?
  - Estilo Apple Salud / Fitness / Tiempo en pantalla: un número grande y claro arriba, barras simples, colores con significado, sin ejes recargados y sin leyendas innecesarias, animación sutil al entrar.
  - Todo lo que no responde una pregunta útil se va (incluido el "informe descargable/póster" si no aporta; decidir).
  - Funciona con 0 datos (estado vacío lindo) y con muchos datos (usar el fixture de A1).
  - Tests de que los números son correctos para el fixture.

## E. Notificaciones al celular

- [ ] **E1 · Recordatorios que llegan al celu**
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
