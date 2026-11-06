# Bitácora del agente nocturno — Aula

Registro de todo lo que hicieron los agentes: hora, qué intentaron, qué salió bien, qué salió mal, decisiones y por qué. Las entradas nuevas van arriba.

Cómo leerla: cada "corrida" es una sesión nueva de Claude que arrancó sola, sin memoria de las anteriores. Lo único que comparten es este archivo, `BACKLOG.md`, `CLAUDE.md` y el historial de git.

---

## Corrida 00:06–00:40 (hora ARG) — S2 (los cambios llegan solos + actualizar a mano)

**Plan:** S2 es lo primero de la Noche 3. Antes de tocar nada busqué por qué en el iPhone no ves los cambios de la compu hasta cerrar y abrir. Versión 2.41.0 → 2.42.0. **No cambia la forma de los datos** (ni el esquema ni lo que viaja por la sync), así que no hizo falta migración.

**Lo que encontré (causa probable, sumando cosas):**
- La app solo preguntaba **cada 60 s**, y cada vez **bajaba el documento entero** (con tus datos, cientos de KB): por eso no se podía preguntar más seguido sin gastar datos del celu.
- Cloudflare KV, además, guarda cada lectura en caché ~60 s en el lugar de Cloudflare que te atiende. Sumado a los 60 s de la app, un cambio podía tardar **hasta 2 minutos**: en la práctica, "no llega nunca", y cerrar/abrir parecía lo que lo arreglaba.
- Si iOS despertaba la app y el primer pedido fallaba (la red tarda un segundo en volver), quedaba "sin conexión" hasta la próxima vuelta, 60 s después.
- El SW **no** cachea `/api/` (ya estaba bien) y `syncApply` sí redibuja: eso lo descarté.

**Decisiones:**
- **Preguntar cada 10 s con la app a la vista, pero barato:** la app manda la versión que ya tiene (`X-Aula-Have`) y, si no hay nada nuevo, la función contesta `{ version, same: true }` (~25 bytes) sin mandar ni parsear el documento (lee la versión del principio del texto). Usé un 200 con `same` en vez de un 304: con `cache: "no-store"` y Safari, un 304 "a mano" es terreno raro; así es lo mismo y más predecible. Si cambiaste algo acá y el otro lado no, sube directo sin bajar nada.
- Para saber si cambió algo acá sin bajar el documento, la app recuerda en memoria lo último acordado con el servidor. Al abrir la app la primera pasada siempre es completa.
- **Disparadores al volver a la app:** `visibilitychange`, `focus`, `pageshow` y `online`, con una pausa mínima de 2 s para que tres eventos juntos no hagan tres pasadas.
- **Actualizar a mano:** tocar el indicador de arriba (ahora es un botón de 44 px) → "actualizando…" → "al día · recién". En el celu, **tirar hacia abajo** desde arriba de todo: aparece una flechita que gira cuando pasaste el umbral (con vibración corta en Android; el iPhone no deja vibrar desde la web) y un círculo girando mientras actualiza. Solo arranca si el gesto es claramente vertical, con la página arriba y sin estar arrastrando una tarea (C5). Desactivé el "tirar para recargar" propio de Chrome en Android (`overscroll-behavior`), que recargaba la página entera.
- **"sincronizado" pasó a decir "al día"**, más humano y lo que pedía el backlog. Las pasadas automáticas no muestran "actualizando…" (si no, titilaría cada 10 s); solo la que pedís vos.
- **Si estás escribiendo** (un modal, la hoja de Mover, la búsqueda o un campo con foco), las pasadas automáticas esperan; al cerrar o salir del campo se aplica todo en ~0,3 s. Lo que tocás a mano sí actualiza siempre.

**Salió bien:** el test de "sin cambios" confirma que en 30 s de app abierta no se sube nada, no se baja el documento y no se redibuja la pantalla.
**Salió mal / intentos fallidos:** el primer test de "sin cambios" fallaba 1 de cada 3 veces con una subida de más. Instrumenté los pedidos y vi la causa: con el reloj simulado avanzando 30 s de golpe, se cumplía el corte de 20 s de un pedido en vuelo y la respuesta llegaba "vacía"; la app la tomaba como "en el servidor no hay nada" y subía todo (que después se arreglaba con el 409). En la vida real eso puede pasar con una respuesta cortada a la mitad, así que **lo arreglé en la app** (una respuesta incompleta ahora cuenta como "sin conexión", nunca como "no hay nada") y en el test avanzo el reloj de a una vuelta. Los tests nuevos fallaron todos antes de implementar, salvo el del formulario abierto, que pasaba de casualidad porque antes no había ninguna pasada en 30 s.
**Tests:** +7 en `tests/sync-vivo.spec.js` (función con `same`, llega en ≤ 15 s con reloj simulado, sin cambios no sube/baja/redibuja, sube lo local sin bajar, formulario abierto no se pisa, focus/pageshow/online, tocar el indicador, tirar para actualizar con toques reales por CDP incluyendo tirón corto y de costado). Actualicé 2 tests viejos (`sync-app` y `sync-ui`) que esperaban el texto "sincronizado": cambió a propósito a "al día". `npm test`: **332 pasaron, 0 fallaron** (38 saltados a propósito, como antes).
**Capturas:** [tirando, celu](capturas/S2-tirar-mobile-light.png) · [actualizando, celu oscuro](capturas/S2-actualizando-mobile-dark.png) · [al día, compu](capturas/S2-aldia-desktop-light.png) (y las demás `S2-*`).
**Para Bauti:** probalo con el celu y la compu abiertos a la vez: un cambio en uno tiene que aparecer en el otro en unos 10 s. **Si tarda cerca de un minuto**, es la caché de Cloudflare KV cuando los dos dispositivos entran por lugares distintos de su red (puede pasar con wifi vs datos): la app no lo puede saltear. Lo dejé anotado como X8 (pasar a D1, que no tiene esa demora); avisame si lo notás y lo hago. Gasto: cada pregunta "¿hay algo nuevo?" es una lectura de KV; con la app abierta 3 h por día y dos dispositivos son ~2.000 lecturas, muy lejos de las 100.000 gratis por día.

---

## Corrida 04:07–04:34 (hora ARG) — E1a2 («Avisarme») y cierre de la noche

**Resumen de la corrida:** era la última de la noche (la hora de cierre de hoy eran las 04:00). Hice un ítem (E1a2), con tiempo reservado para publicar en `main`, escribir `RESUMEN-NOCHE.md` y crear `TERMINADO`. Versión 2.40.0 → 2.41.0. Sin cambios en la forma de los datos (el esquema 6 ya lo había puesto E1a1).

### E1a2 · «Avisarme» en tareas y parciales

**Plan:** la corrida anterior dejó el modelo de recordatorios listo pero invisible. Faltaba la interfaz: el campo en los dos editores y los valores por defecto en Configuración.
**Decisiones:**
- **Un solo control, el mismo en los tres lugares:** los avisos son "pastillas" (`7 días antes ×`) y abajo hay atajos punteados (`+ 2 h`, `+ 3 días`…) y **Otro…** para un número y unidad a mano. Descarté un `<select>` por aviso: con dos o tres avisos se vuelve una planilla, y las pastillas se leen de un vistazo y se tocan bien con el dedo (44 px en el celu).
- **Atajos distintos según qué es:** para tareas, 10 min · 30 min · 1 h · 1 día; para parciales, 2 h · 1 día · 3 días · 7 días. Son los que tienen sentido en cada caso.
- **Si no tocás nada, no se escribe nada.** Un parcial que usa los avisos de Configuración muestra "Como en Configuración" y, si guardás sin tocar los avisos, sigue sin lista propia: si mañana cambiás los de Configuración, lo sigue. Además la sincronización no ve cambios falsos. Sacar todos = "Sin avisos" (lista vacía), que es distinto de "los de Configuración".
- **Tarea sin hora:** en vez de los atajos dice "Poné una hora para que te pueda avisar." y se actualiza apenas ponés la hora.
- **Series:** "avisos" entra en la pregunta de siempre ("¿solo esta / esta y las siguientes / todas?") si lo cambiás en una tarea de una serie.
- **Que no sea un botón que no hace nada:** la noche pasada se decidió no mostrar "Avisarme" hasta que avisara algo. Para no caer en eso, `checkReminders` (las notificaciones locales que ya existían) ahora usa estos avisos: con Aula abierta y "Notificaciones locales" activadas, cada aviso suena **una sola vez** a su hora (si la app estaba cerrada, suena al abrirla, hasta 12 h después). Reemplaza al aviso viejo de parciales ("en N días", uno por día): los nuevos por defecto (7 y 1 día antes) cubren lo mismo sin repetir todos los días. El "Vence hoy" de las tareas queda igual. En Configuración lo digo tal cual: que lleguen con la app cerrada (ntfy) es E1b.
**Salió bien:** los tres editores comparten el mismo código (`remFieldHTML`), y Configuración guarda al instante sin redibujar la pantalla entera.
**Salió mal / intentos fallidos:** (1) Escribí los tests antes pero, otra vez, no los corrí en rojo antes de implementar (sin las funciones fallaban seguro). (2) El primer intento del test de tarea falló: el aviso "Poné una hora" no salía porque el control se dibujaba antes de que existiera el campo de hora en la pantalla; lo arreglé redibujándolo al abrir el editor. (3) Las primeras capturas "claras" salieron oscuras porque el fixture trae tu tema guardado; las volví a sacar forzando el tema. (4) En una de las dos corridas completas de `npm test` falló 1 test viejo (`anios.spec.js`, desktop) por un error de consola "404" que no es de este cambio: lo corrí 4 veces más y pasó siempre, y no lo pude reproducir cargando la app 20 veces a mano. Lo dejo anotado como posible test inestable (sospecho de un pedido del navegador a un archivo que no existe, como `favicon.ico`, pero no lo confirmé, así que no toqué nada).
**Tests:** +4 (×2 proyectos) en `tests/recordatorios-ui.spec.js`: parcial (por defecto, guardar sin tocar no escribe, quitar/agregar/Otro, sin avisos), tarea (sin hora no deja, con hora agrega y persiste, otra tarea no gana la lista), Configuración (cambia los por defecto y se ve en un parcial sin propios) y notificación local una sola vez a su hora. `npm test`: en la rama, 324 pasaron y 1 falló (el inestable de abajo, que pasó al repetirlo); después del merge en `main`, **325 pasaron, 0 fallaron** (31 saltados a propósito, como antes).
**Capturas:** [parcial celu](capturas/E1a2-parcial-mobile-light.png) · [parcial compu](capturas/E1a2-parcial-desktop-light.png) · [tarea celu oscuro](capturas/E1a2-tarea-mobile-dark.png) · [Configuración](capturas/E1a2-config-desktop-light.png) (y las demás `E1a2-*` en claro y oscuro).
**Commits:** `e686041` feat(recordatorios): E1a2.
**Para Bauti:** abrí un parcial → "Avisarme": tienen que estar 7 días y 1 día antes. Si querés que suenen hoy con la app abierta, activá "Notificaciones locales" en Configuración. En el iPhone, las notificaciones web solo andan con Aula **instalada en la pantalla de inicio** (iOS 16.4+).

---

## Corrida 03:05–03:33 (hora ARG) — L1b (recorrido pensado de Hoy, Semana, Calendario, Materias, Parciales y Series) y E1a1 (modelo de recordatorios)

**Resumen de la corrida:** dos commits, los dos con `npm test` en verde: L1b (6 arreglos de lógica y textos) y E1a1 (modelo de recordatorios, esquema 6). Versión 2.38.0 → 2.40.0. Tests: de 299 a 317 pasados, 0 fallados. Cerré a los ~30 min en vez de seguir con E1a2: no entraba entero con su revisión visual, y la corrida de las 04:05 (la última) lo puede tomar con tiempo.

### E1a1 · Recordatorios: el modelo (Aula 2.40.0, **esquema 6**)

**Plan:** con el tiempo que quedaba no entraba E1a entero bien hecho (modelo + interfaz en dos editores + Configuración), así que lo partí: ahora el modelo y la migración, que son lo delicado con tus datos; la interfaz queda como E1a2 para la próxima corrida.
**Decisiones:**
- **No se toca ninguna tarea ni ningún parcial.** `reminders` es opcional: un parcial que no lo tiene usa los de Configuración (por defecto **7 días y 1 día antes**), una lista vacía significa "sin avisos", y una tarea sin la lista no avisa. Así tus parciales ya cargados quedan con los avisos por defecto sin reescribirlos, y la sincronización no ve "cambios" falsos.
- La migración (esquema 5 → 6) solo agrega `settings.reminderDefaults`, respetando lo que ya hubiera. Como siempre, antes guarda la copia `premig-v5` en Copias de seguridad.
- **Parcial sin hora:** avisa tomando las 9:00 de ese día ("1 día antes" = el día anterior a las 9). **Tarea sin hora:** no tiene "antes", no avisa.
- Unidades: minutos, horas y días (hasta 999). La lista se limpia sola: sin repetidos (30 min y 0,5 h no se duplican), ordenada del más lejano al más cercano.
**Salió mal / intentos fallidos:** nada. Los tests los escribí antes, pero no los corrí en rojo (sin las funciones fallaban seguro); lo aclaro para ser honesto con el método.
**Tests:** +2 (×2) en `tests/recordatorios.spec.js`: migración del fixture en esquema 5 (todo idéntico, copia `premig-v5`, idempotente, respeta lo configurado, sin marcas de sync) y cuándo suena cada recordatorio. Actualicé 1 test viejo (`anios.spec.js` esperaba el esquema 5 fijo; ahora compara con `SCHEMA_VERSION`). `npm test`: **317 pasaron, 0 fallaron**.
**Capturas:** no hay: no cambió nada visible.
**Para Bauti:** todavía no se ve nada nuevo; es la base para que en E1a2/E1b te lleguen los avisos al celu.

### L1b · Recorrido pensado

**Plan:** lo siguiente del backlog era L1b. En vez de mirar código al azar, usé la app como vos desde el celu (Playwright mobile, 23:40, con el fixture) vista por vista, y probé a propósito los casos borde que pide el backlog: inicio de semana en domingo, fin de mes y día 31, materia borrada con parciales, parcial pasado sin nota. Todo lo encontrado fue primero a `docs/AUDITORIA.md` (#14–#20) y después se arregló con su test. Versión 2.38.0 → 2.39.0. **No cambia la forma de los datos.**
**Decisiones:**
- **"Cada mes" el día 31 ahora cae el último día de los meses cortos** (31/10 → 30/11 → 31/12; el 30 cae el 28/2), para tareas que se repiten, series y hábitos. Antes se salteaba el mes entero: una "Pagar cuota el 31" desaparecía en noviembre sin avisar. La corrida de C1 lo había dejado anotado como algo a decidir; lo decidí porque para un estudiante perderse un vencimiento es mucho peor que tenerlo un día antes. (El Calendario del iPhone hace lo contrario, saltea; si lo preferís así, es una línea.) Las series viejas creadas salteando noviembre se siguen reconociendo como "cada mes", y si les agregás más tareas siguen la regla nueva. **Actualicé 2 tests viejos** (`repetir.spec.js` y `series-editar.spec.js`) que verificaban justamente que se salteara: cambió la regla a propósito.
- **Series:** una tarea que se repite con fecha final decía "sin fin" (la "Clase de consulta" del fixture termina el 15/12). Ahora dice "hasta el mar 15 dic" (o "terminó el …"), en la lista y en el editor. "Cada semana" pasa a "todos los sábados" y "cada mes" a "el 10 de cada mes".
- **Estudio de hoy:** después de agregar 14–17 el formulario proponía otra vez 14–17. Ahora propone el siguiente desde donde terminó el último (17–19) y avisa si un bloque se superpone. El "05:00 PM" de las capturas es del navegador de prueba (en inglés); en tu iPhone en español sale 24 h. No lo cambié: reemplazar el selector de hora nativo del celu sería peor.
- **Materias:** "0 pendientes · 0 m estudiadas" → "al día · sin tiempo registrado". Al eliminar una materia, el aviso ahora dice qué pasa con sus tareas **y parciales** ("1 tarea y 1 evaluación quedan sin materia, no se borran"); antes decía "desvincular 1 tareas".
- **Quedan para F1** (son de diseño, no de lógica): la fecha repetida en las filas de Parciales (#19) y los totales en mayúsculas de Semana (#20).
**Salió bien:** Calendario, Semana con inicio en domingo y borrar una materia con parciales y sesiones aguantaron bien (ninguna vista mostró `undefined` ni se rompió).
**Salió mal / intentos fallidos:** (1) una captura de página completa de Hoy mostraba las filas apretadas a la mitad del ancho; perdí un rato hasta ver que era un efecto de la captura "fullPage", no de la app (en pantalla normal están bien). (2) Mi test de Materias fallaba porque "50 m estudiadas" contiene "0 m estudiadas": era el test. Todos los tests nuevos fallaron antes del arreglo.
**Tests:** +7 (×2 proyectos) en `tests/logica-l1b.spec.js`, 2 viejos actualizados. `npm test`: **313 pasaron, 0 fallaron** (31 saltados a propósito, como antes).
**Capturas:** [Series, celu oscuro](capturas/L1b-series-mobile-dark.png) · [Series, desktop claro](capturas/L1b-series-desktop-light.png) · [Estudio de hoy, celu](capturas/L1b-estudio-mobile-light.png) · [Materias, desktop claro](capturas/L1b-subjects-desktop-light.png) · [Materias, celu oscuro](capturas/L1b-subjects-mobile-dark.png)
**Commits:** `1417732` fix(logica): L1b · `0c7ab35` feat(recordatorios): E1a1.
**Para Bauti:** si tenés alguna tarea "cada mes" el 29, 30 o 31, ahora te va a aparecer también en los meses cortos (el último día). Fijate que eso sea lo que querés.

---

## Corrida 02:06–02:50 (hora ARG) — L1a2 (revisor automático de textos) y G2 completo (Tu año en Aula)

**Resumen de la corrida:** tres commits, cada uno con `npm test` en verde: el revisor automático de textos (L1a2), "Tu año en Aula" (G2a) y compartir cada pantalla como imagen (G2b). Versión 2.35.0 → 2.38.0. Tests: de 261 a 299 pasados, 0 fallados. **No hubo cambios en la forma de los datos** (G2 solo lee).

### G2b · Compartir una pantalla como imagen (Aula 2.38.0)

**Decisiones:**
- **La imagen se dibuja a mano en un canvas de 1080×1920** (formato historia de Instagram) con los mismos colores y textos, más "Aula · 3.º año · 2026" abajo. Descarté sacar una "foto" del HTML: sin librerías no hay forma confiable, y además así la imagen sale igual en cualquier pantalla. El título grande se achica solo si no entra.
- **Botón de compartir** (abajo a la derecha, 44 px): en el iPhone abre la **hoja de compartir** con el PNG (para mandarlo por WhatsApp o subirlo a una historia); si cancelás, no pasa nada. Donde no hay hoja de compartir (la compu) se **descarga** el PNG ("Imagen guardada"). El nombre del archivo queda tipo `aula-3-ano-2026-2.png`.
**Salió mal / intentos fallidos:** (1) el nombre del archivo salía `aula-3-an-o-2026` (al sacar los acentos de "año" quedaba la virgulilla suelta); lo vi gracias al test. (2) Probando un caso borde (un solo día de estudio, una sola materia) aparecieron textos raros: "en 1 día distintos", "el 100% de todo lo que estudiaste" y "5 h en el mes; tu día récord: 5 h". Ahora dice "en un solo día", "todo tu tiempo de estudio fue para esta materia" y "5 h, todas el miércoles 4 de noviembre". Test propio.
**Tests:** +3 (×2): compartir con la hoja (PNG de 1080×1920, con contenido) y cancelar sin descargar; descarga en la compu (verifica la cabecera PNG y el tamaño) y que todas las pantallas se pueden dibujar; los textos del caso de un solo día. `npm test`: **299 pasaron, 0 fallaron**.
**Capturas:** [botón en la historia, celu](capturas/G2b-share-mobile-light.png) · imágenes que se comparten: [portada](capturas/G2b-imagen-portada.png) · [materia](capturas/G2b-imagen-materia.png) · [parciales](capturas/G2b-imagen-parciales.png)
**Commits:** `0404118` feat(año): G2a · `d109fde` feat(año): G2b.
**Para Bauti:** probá el botón de compartir en el iPhone desde la app instalada: la hoja de compartir con archivos solo se puede probar de verdad ahí (en los tests está simulada).


### G2a · Tu año en Aula (Aula 2.37.0)

**Plan:** G2 tiene dos partes bien separadas: los números + la historia, y exportar cada pantalla como imagen. Lo partí en G2a y G2b para cerrar bien la primera con el tiempo que quedaba.
**Decisiones:**
- **Los números salen del estado completo filtrado por año** (`wrappedData(yearId)` sobre `fullState()`): se puede ver el resumen de cualquier año **sin cambiar el año que estás mirando**. No modifica nada (el test compara el estado antes y después).
- **Pantallas** (cada una aparece solo si hay dato real): portada ("Hasta ahora" si el año no terminó), horas estudiadas en cuántos días + equivalente ("como ver 2 películas seguidas"; con 48 h o más, "días enteros sin dormir"), la materia del año con su %, el mes más intenso y el día récord, tareas completadas (las que se repiten cuentan cada vez) + la serie más larga terminada entera, la racha más larga (días seguidos estudiando **o** tachando tareas), "Sos de estudiar de noche/mañana/tarde/madrugada", parciales aprobados con la mejor nota, y un cierre.
- **"A qué hora estudiás" solo con 5 o más sesiones medidas en el momento.** Las cargadas a mano no dicen a qué hora estudiaste (dicen a qué hora las cargaste), así que no cuentan. Con tus datos de prueba hay 3: esa pantalla no sale. Prefiero saltarla a inventar.
- **Sin datos** no se rompe: portada y un cierre honesto ("Todavía no hay nada que contar…").
- **Cómo se usa:** botón "Tu año en Aula" arriba en Progreso, y "Resumen" al lado de cada año en "Tus años". Tocás la derecha para avanzar y la izquierda para volver (como las historias de Instagram); en la compu, flechas, espacio y Esc. Barras de progreso arriba, ✕ de 44 px, animación de entrada de 240 ms que se apaga con "reducir movimiento". En el celu ocupa toda la pantalla; en la compu, una tarjeta vertical centrada.
- **No pasa sola** (sin temporizador): son números para leer, y que se te vaya la pantalla mientras leés frustra.
**Salió mal / intentos fallidos:** en la primera captura los decimales salían con punto ("4.8 h", "1.5 h", del `hClock` de Progreso): en el resumen ahora uso "4 h 45 m" y el número grande va con coma ("4,8 horas"). Además, al abrir quedaba un anillo de foco sobre el ✕ (ahora el foco va al diálogo), "Parciales aprobados: 1" quedaba sin unidad (ahora "Aprobaste 1 parcial"), y revisando el diff vi que los atajos de la app (N = nueva tarea) seguían funcionando detrás de la historia: ahora se bloquean (el test falla sin el arreglo). Los tests los escribí después del código, así que no los vi en rojo primero, salvo el del atajo.
**Tests:** +5 (×2) en `tests/wrapped.spec.js`: los números del fixture calculados a mano (285 min, AN 32%, julio, 7 tareas, racha 3, mejor nota 9…) y el texto de cada pantalla; recorrido entero tocando + teclado + "Ver de nuevo" + Esc, sin cambiar datos; sin datos; "de noche" con 5 sesiones medidas (las cargadas a mano no cuentan); el resumen de un año anterior desde "Tus años" sin cambiar de año. `npm test`: **293 pasaron, 0 fallaron**.
**Capturas:** [portada, celu](capturas/G2-s0-mobile-dark.png) · [horas](capturas/G2-s1-mobile-dark.png) · [materia del año](capturas/G2-s2-mobile-dark.png) · [mes](capturas/G2-s3-mobile-dark.png) · [parciales, desktop claro](capturas/G2-s6-desktop-light.png) · [cierre](capturas/G2-s7-mobile-dark.png) · [botón en Progreso](capturas/G2-boton-mobile-dark.png)
**Para Bauti:** abrilo desde Progreso → "Tu año en Aula". Tus números reales van a ser distintos a los de las capturas (son del fixture de prueba). Si alguna pantalla te parece de más o te falta alguna idea, es fácil sumar.

### L1a2 · Revisor automático de textos (Aula 2.36.0)


**Plan:** seguía L1a2. Era lo siguiente pendiente antes de G2, y además sirve para todo lo que viene: es un test que recorre la app entera buscando textos rotos, así que cada ítem nuevo (G2, E1, F1) queda revisado gratis.
**Decisiones:**
- **Un solo recorredor, muchos estados.** `tests/revisor.spec.js` siembra 9 estados (el fixture, vacío, una materia, 200 tareas, títulos larguísimos, tres parciales en dos días, tareas de 0 min, todo hecho y todo atrasado a las 00:40 de la noche) y en cada uno, en desktop y celu, visita las 16 vistas, el detalle de **cada** materia, parcial y proyecto, y 20 modales (editar tarea, mover, plan, serie, años, informe…). Son 18 tests de ~5 s cada uno: la suite tarda ~1 min más (3,4 → 4,5 min). Me pareció un precio razonable; descarté recorrer todos los modales de todas las tareas porque multiplicaba el tiempo sin encontrar cosas distintas.
- **Qué busca:** `NaN`, `undefined`, `null`, `Invalid Date`, `[object`, plurales mal ("1 tareas", "1 días"… con una lista de palabras; "11 tareas" o "1/3 tareas" no cuentan), "en 0 días"/"hace 0 días", tiempos negativos, la página corriéndose de costado y elementos que se salen del ancho (salvo los que están dentro de algo que recorta a propósito, como los "…"). También revisa lo escrito en los campos.
- **Un test del propio revisor:** le inyecto un HTML lleno de errores y verifico que los detecta todos, y que textos correctos ("1 día", "11 días", "3-5 días") no los marca. Sin esto, un revisor que no encuentra nada podría estar ciego.
- **Helper `pl(n, "tarea", "tareas")`** para los plurales. Además de lo que encontró el revisor, busqué en el código todos los `${n} tareas/días/…` y los pasé a `pl()` (Lista completa, Series, Progreso, Importar copia).
**Hallazgos (todos arreglados, detalle en `docs/AUDITORIA.md` #8–#13):** "1 pendientes" en Inicio y Materias; "hay 1 tareas pendientes de un plan anterior" en el generador de planes; "1 atrasadas" en Planes; en Progreso "Parcial **en 0 días** · le estás dando poco" cuando el parcial es hoy (ahora "hoy"/"mañana"). Y uno que el revisor **no** podía ver, pero que vi en su captura: **Materias en el celu** tenía los 4 botones al lado del nombre y lo apretaban a una palabra por renglón ("Probabilidad / y / Estadística", el subtítulo en 4 renglones). Ahora el nombre y los datos ocupan un renglón y los botones van debajo, de 40 px de alto, Editar y Archivar más anchos. En la compu no cambia nada.
**Salió bien:** la primera pasada del revisor falló en 14 de los 18 tests, todos por plurales y el "en 0 días". No encontró `NaN`/`undefined` ni cosas que se salgan de la pantalla en ningún estado, ni con títulos de 150 letras: buena señal para la base.
**Salió mal / intentos fallidos:** el test de Materias falló de entrada por culpa del test: medía el bloque nombre+subtítulo (2 renglones) en vez del nombre. Corregido el selector, pasa con el arreglo y falla en el celu sin él (lo comprobé sacando el arreglo).
**Tests:** +19 (×2 proyectos, 9 estados + 1 del revisor + 1 de Materias). `npm test`: **283 pasaron, 0 fallaron** (31 saltados a propósito, como antes).
**Capturas:** [Materias, celu oscuro](capturas/L1a2-subjects-mobile-dark.png) · [Materias, celu claro](capturas/L1a2-subjects-mobile-light.png) · [Materias, desktop claro](capturas/L1a2-subjects-desktop-light.png) · [plan, celu oscuro](capturas/L1a2-plan-mobile-dark.png) · [plan, desktop claro](capturas/L1a2-plan-desktop-light.png)
**Commits:** `ab3e5a6` test(revisor): L1a2 revisor automático de textos.
**Para Bauti:** fijate Materias en el celu. Si preferís que los botones ↑ ↓ / Editar / Archivar estén escondidos (por ejemplo, detrás de un "Editar lista", como en iOS), es un cambio chico: avisá.

---

## Corrida 01:06–01:49 (hora ARG) — G1 (años de cursado) y L1a1 (parciales el mismo día)

**Resumen de la corrida:** hice **G1 completo**: cada año de cursado es un espacio aparte, con selector en el menú, asistente para crear el año nuevo y aviso cuando estás mirando un año anterior. **Cambia la forma de los datos (esquema 5)**, con copia previa automática y tests con el fixture elemento por elemento. Versión 2.33.0 → 2.35.0. Tests: de 240 a 261 pasados, 0 fallados (255 al cerrar G1). Además, **L1a1**: tu caso de los dos parciales el mismo día.

**Plan:** G1 toca el modelo y todas las vistas, así que lo primero fue decidir **cómo** separar por año sin tocar los ~170 lugares del código que leen `state.tasks`, `state.subjects`, etc., y sin arriesgar tus datos ni la sincronización recién hecha (S1).

**Decisiones:**
- **Los datos viejos no se reescriben.** Se agrega `state.years` con el primer año (`id: "y0"`, "3.º año · 2026", mar 2026 – feb 2027; lo puse así porque tus materias son las de 3.º de Sistemas; se edita en un toque). Cada cosa nueva lleva `yearId`; lo que **no** tiene `yearId` es del primer año. Así la migración no cambia ni una tarea (el test compara las 22 del fixture campo por campo) y **no aparece como "cambio" para la sincronización** (si la migración hubiera marcado todo como recién editado, un celu desactualizado podía pisar ediciones de la compu).
- **Id fijo para el primer año** (`y0`) en vez de uno al azar: la compu y el celu migran por separado y tienen que llegar al mismo año sin ponerse de acuerdo; con ids al azar te habrían quedado dos "3.º año".
- **En memoria, solo el año que mirás.** Al cargar, lo de los otros años se aparta (`yearHidden`) y `fullState()` lo vuelve a juntar **en el mismo orden** para guardar, sincronizar, exportar y hacer copias. Ventaja: todas las vistas, Progreso, la búsqueda, el generador de planes y los selectores muestran solo el año activo sin tocar su código, y cualquier vista futura (G2, E1…) también. Lo que se crea mientras mirás un año queda en ese año. Descarté filtrar en cada vista (decenas de cambios, fácil olvidarse uno) y guardar cada año en un lugar distinto del estado (para la sincronización habría sido "borrar y crear" todo).
- **El año que ves es de cada dispositivo** (no viaja): si en el celu mirás 3.º, la compu sigue en 4.º. Si no elegiste ninguno, ves el más nuevo: cuando crees 4.º en la compu, el celu pasa solo a 4.º al sincronizar.
- **Años anteriores "en consulta":** se ven con un aviso arriba ("Estás viendo 3.º año · 2026 · Volver al actual") y el selector del menú en amarillo. **No los bloqueé para editar**: corregir una nota de un final viejo es algo real; el aviso alcanza para no confundirse.
- **Año nuevo** (Configuración → Años de cursado → Nuevo año…, o desde el selector del menú): propone el nombre y las fechas solos ("4.º año · 2027", mar 2027 – feb 2028), arranca **vacío** y deja traer, opcionalmente, **materias que siguen** (las elegís de la lista), **hábitos** (sin el historial) y **notas**. Lo que se trae se **copia**: el año viejo queda exactamente igual. Vista previa antes de crear ("Vas a crear 4.º año · 2027 con 2 materias y tus hábitos"), valida nombre repetido y fechas al revés, y **Deshacer** después.
- **La sincronización** ya funcionaba para cualquier lista con ids, así que `years` viaja sola. Ajusté dos cosas: el "dedupe" de materias de la primera sincronización ahora compara nombre **y año** (si no, "Economía" de 3.º y la copia de 4.º se habrían fusionado), y todo lo que compara o sube el estado usa el estado completo (si no, cambiar de año habría parecido "borrar" lo del otro año y dejado lápidas).
- **Red de seguridad:** si algo tuviera un `yearId` que no está en la lista (una importación rara), se le arma un "Año recuperado" en vez de quedar invisible, y nunca pasa a ser el actual. Importar con "Fusionar" también trae los años del archivo.
- `dayLog`/`dayPlan` (registro por día y bloques de "Estudio de hoy") quedaron **comunes a todos los años**: son por fecha, no por año.

**Salió bien:** el enfoque de "solo el año activo en memoria" hizo que todas las vistas quedaran separadas por año sin tocarlas. El test de dos dispositivos (uno en 3.º editando, otro en 4.º) termina igual en los dos, sin lápidas y sin subidas de más.
**Salió mal / intentos fallidos:** (1) un test falló de a ratos: no era la app sino el test, que leía las marcas antes de que terminara el guardado del arranque (`persist()` encola si ya hay uno en curso). Lo mismo podía pasarle a `storedState()` del helper, así que lo arreglé ahí también (espera a que no haya un guardado en curso). (2) En la primera captura el aviso de año anterior ocupaba media pantalla del celu (texto en dos renglones + botón grande azul); lo achiqué a un renglón con "Volver al actual". (3) En "Tus años" las cantidades se partían en dos renglones; ahora fechas y cantidades van en renglones propios y un año vacío dice "Vacío por ahora".
**Tests:** +8 en `tests/anios.spec.js` (×2 proyectos) y +1 en `tests/sync-app.spec.js`: migración del fixture (elementos idénticos, copia `premig-v4`, idempotente, sin marcas de sync); crear 4.º con el asistente → limpio, lo nuevo queda en 4.º, volver a 3.º intacto, recargar mantiene el año, volver con el aviso; traer materias y hábitos (copias con ids nuevos, sin historial) + deshacer; motor (sin lápidas al cambiar de año, mismo orden, la sincronización ve todo, fusión remota con otro año a la vista, dedupe por año); copias y exportación con todos los años; validaciones del asistente; red de seguridad; dos dispositivos con años distintos. Actualicé 1 test viejo (`sync-motor`: esperaba el esquema 4 fijo; ahora compara con `SCHEMA_VERSION`). `npm test`: **255 pasaron, 0 fallaron** (31 saltados a propósito).
**Capturas:** [asistente, celu claro](capturas/G1-nuevo-mobile-light.png) · [asistente, desktop oscuro](capturas/G1-nuevo-desktop-dark.png) · [tus años, celu oscuro](capturas/G1-selector-mobile-dark.png) · [tus años, desktop claro](capturas/G1-selector-desktop-light.png) · [mirando 3.º, celu oscuro](capturas/G1-viejo-mobile-dark.png) · [mirando 3.º, desktop claro](capturas/G1-viejo-desktop-light.png) · [4.º recién creado, celu](capturas/G1-nuevo-inicio-mobile-light.png)
**Commits:** `93c5758` G1 · el de L1a1 y cierre (`fix(logica): ...`).
### L1a1 · Dos parciales el mismo día (Aula 2.35.0)

**Plan:** tu caso exacto primero ("caen dos parciales el mismo día pero arriba dice 'próximo parcial Economía en 2 días'"), y abrir `docs/AUDITORIA.md` para anotar todo lo que vaya apareciendo. El revisor automático de textos (L1a2) lo dejé para la próxima corrida: preferí cerrar G1 y esto bien antes que empezar algo grande con poco tiempo.
**Decisiones:**
- "El próximo parcial" ahora son **todos los del mismo día**. Arriba: "Economía y ANP · en 2 días". Para que entre en la pastilla (máx. ~30 letras) se acortan a la sigla **primero los nombres más largos** ("Economía y Análisis Numérico — Práctica" → "Economía y ANP"); con 4 o más, "4 parciales"; si son dos de la misma materia (teoría y práctica), van sus nombres. Al pasar el mouse se ven los nombres completos y la fecha.
- La sugerencia de Inicio dice "Economía y ANP **son** en 2 días: quedan N tareas de sus planes" (suma los planes de los dos).
- Detalle de materia: "Próximas evaluaciones" con las dos, y "mañana" en vez de "en 1 días".
- De paso: "Tenés 1 tareas atrasadas" → "1 tarea atrasada"; y una evaluación sin tipo mostraba "undefined" (lo vi en mi propia captura con datos de prueba; tus datos siempre tienen tipo, pero quedó a prueba de eso).
**Salió mal:** mi primera captura mostró "undefined" en Próximas evaluaciones: eran mis datos de prueba (sin tipo), pero lo dejé arreglado igual. También vi que en el celu la pastilla de arriba **no se muestra** (está oculta por espacio desde antes): lo anoté en la auditoría para F1.
**Tests:** +3 (×2) en `tests/logica.spec.js` (fallan sin el arreglo): arriba e Inicio con dos el mismo día; reglas del nombre (2, 3, 4, misma materia); detalle de materia y singular.
**Capturas:** [Inicio desktop claro](capturas/L1a-home-desktop-light.png) · [desktop oscuro](capturas/L1a-home-desktop-dark.png)

**Para Bauti:**
- Al abrir la versión nueva no vas a notar nada distinto salvo el selector "Año de cursado · 3.º año · 2026" arriba del menú. Si no estás en 3.º, cambialo en Configuración → Años de cursado → Ver mis años → Editar.
- **No crees 4.º "para probar" con tus datos reales** salvo que quieras: se puede deshacer en el momento (o desde Copias de seguridad), pero si sincronizás, el año llega al otro dispositivo.
- Los **recordatorios** de parciales solo miran el año que tenés abierto: si te quedás mirando un año viejo, no te avisa de los del actual. Para uso normal (siempre en el actual) no cambia nada.

---

## Corrida 00:06–00:50 (hora ARG) — C4, C5, S1 (S1a, S1b, S1c)

**Resumen de la corrida:** primera corrida de la noche 2. Hice los tres primeros del orden que pediste: **tiempos de series por tramos** (C4), **arrastre fluido** (C5) y la **sincronización compu-celu** completa (S1, partida en tres). Tests: de 196 a 240 pasados, 0 fallados, en cada commit. Versión 2.28.0 → 2.33.0. Hubo **un cambio de forma de datos** (S1a, esquema 4): solo agrega `state.sync` vacío, con copia previa automática y test con el fixture tarea por tarea.

**Plan:** seguir el orden del backlog. S1 es grande y toca tus datos, así que lo partí en motor (S1a), cliente (S1b) y pantalla (S1c), cada uno con sus tests y su commit, para que si una corrida se cortaba no quedara nada a medias.

### C4 · Tiempos de una serie por tramos

**Plan:** tu caso ("las primeras 10 de 1 h, después 2 de 1 h 30, después 2 h, después 3 h") tenía que poder hacerse **al crear** la serie, sin pasar por el editor, y también arreglarse rápido **después**.
**Decisiones:**
- **Al crear** (control Repetir, solo si la serie tiene fin y más de una tarea): un interruptor "Tiempos distintos por tramos". Se abren filas `[10] de [1 h]`, `[2] de [1 h 30 m]`, `[El resto (16)] de [2 h]`, `[3] de [3 h]`, en orden de la primera a la última, con "+ Agregar tramo" y ✕ para quitar. "El resto" puede ir **en cualquier fila** (no solo la última): así entra tu caso de "y las últimas 3 de 3 h". Usé selectores nativos (en el iPhone abren la ruedita) en vez de campos de texto: no hay que tipear nada. La vista previa muestra **el tiempo al lado de cada fecha** y el **total** ("Se van a crear 31 tareas · 54 h en total"). Si los tramos no cierran ("suman 35 y son 31", "dos «el resto»") lo dice y no crea nada. Por defecto apagado: el que no lo necesita no lo ve.
- **En el editor** de la serie:
  - Cada fila tiene su **número** (1, 2, 3…) y el **tiempo es tocable**: se vuelve un campo donde escribís `90`, `1,5` o `1 h 30` y Enter (Escape cancela). Usé `inputmode="decimal"` para que en el iPhone salga el teclado numérico: por eso "1,5" = 1 h 30 (con coma son horas; sin coma, minutos).
  - **Rangos:** "De la [1] a la [10] · Elegir" y "Las que quedan" (las que vienen después de la última elegida). Shift + clic en la compu; en el celu, **tocar una y mantener apretada otra** elige todas las del medio. Descarté "mantener y arrastrar" en el celu: dentro de una lista que scrollea se pelea con el scroll y en iOS es frágil; el toque largo sobre la última hace lo mismo sin pelearse.
  - **Tiempo en un toque:** con varias elegidas aparece "Poner a las 10 elegidas (de la 1 a la 10):" y chips `30 m · 1 h · 1 h 30 m · 2 h · 3 h · Otro…`. Se aplica al tocar, con **deshacer**. La "vista previa" en este caso es la frase de arriba de los botones (dice exactamente a cuáles); me pareció mejor que pedir un segundo toque de confirmación para algo que se deshace. Después de aplicar, el rango salta solo a "de la 11 a la 31": la cadena de tu caso son 4 rangos y 4 toques.
  - "Tiempos por tramos" también está como acción en "Qué hacer con las elegidas", con la vista previa de siempre ("Vas a poner tiempos por tramos a 31 tareas (54 h en total)").
**Salió mal / intentos fallidos:** en la primera captura el interruptor salía roto (la casilla ocupaba todo el ancho por un estilo general de los campos del modal) y "El resto (16)" se cortaba en el celu; los arreglé (y "tareas de" pasó a "de", más corto y se lee igual). Los tests nuevos los escribí antes de mirar la pantalla pero después del código, así que no los vi fallar "en rojo" primero (las funciones no existían: habrían fallado).
**Tests:** +8 (×2 proyectos, 2 de un solo proyecto) en `tests/series-tramos.spec.js`: tu caso exacto al crear (31 tareas: 10×60, 2×90, 16×120, 3×180, y sobrevive a recargar), tramos que no cierran, la cadena de rangos + toques en el editor (y deshacer), tramos en el editor con vista previa, editar el tiempo en el lugar, Shift+clic (desktop), toque largo (celu) y `parseDur`.
**Capturas:** [crear, celu claro](capturas/C4-crear-mobile-light.png) · [crear, celu oscuro](capturas/C4-crear-mobile-dark.png) · [crear, desktop oscuro](capturas/C4-crear-desktop-dark.png) · [editor, celu oscuro](capturas/C4-editor-mobile-dark.png) · [editor, desktop claro](capturas/C4-editor-desktop-light.png)

### C5 · Arrastrar para ordenar, fluido

**Plan:** confirmar las causas que había anotado (en la compu) y rehacer el arrastre para que cada movimiento del mouse o del dedo sea barato.
**Causas confirmadas leyendo el código:** `.task{transition:.12s}` animaba **todas** las propiedades (incluida la línea de destino, que se borraba y volvía a poner en cada `pointermove`, así que parpadeaba); el fantasma se movía con `left/top` (fuerza layout); en cada movimiento había `querySelectorAll` + `elementFromPoint` + `getBoundingClientRect`; el `:hover` de las filas que pasaban bajo el cursor animaba fondo y botones; y con mouse solo se podía agarrar la manija ⣿, que es chiquita y casi transparente.
**Decisiones:**
- **Se mide una sola vez**, al empezar: zonas y filas en coordenadas de documento (así el scroll no las invalida). Después, cada movimiento solo guarda la posición y **un único `requestAnimationFrame` por cuadro** mueve el fantasma con `transform: translate3d()` y calcula el destino con esos números. Las clases y los desplazamientos se tocan **solo si cambió el destino**.
- **Como en iOS:** en la misma lista, las demás filas **se corren animadas** (200 ms) para abrir el hueco donde va a caer; al soltar, el fantasma **se asienta** en el lugar nuevo. Entre Hoy y Mañana dejé la línea de destino en vez de correr filas: correr las de Mañana las hacía pisar lo que hay abajo de la tarjeta.
- **Con mouse se agarra de toda la fila** con un umbral de 5 px: un clic sin mover sigue abriendo el editor.
- **iPhone:** iba a agregar un `touchmove` no pasivo para frenar el scroll con la fila levantada, pero al hacer S1b vi que **ya existía** (de B4) y lo saqué para no duplicarlo. En iOS lo que más pesaba era el trabajo por movimiento (layout forzado en cada evento), que ahora no está.
- Transiciones solo de las propiedades necesarias, sin `:hover` durante el arrastre, y con `prefers-reduced-motion` sin animaciones.
**Salió mal / intentos fallidos:** un test viejo (una tarea que se repite no pasa a Mañana) falló: después de soltar escondía la fila nueva con `visibility:hidden` mientras se asentaba el fantasma, y un segundo arrastre inmediato no la podía agarrar. Cambié a `opacity:0`. **Honestidad sobre el celu:** los tests táctiles pasan también con el código viejo, porque el Chrome de los tests no reproduce cómo Safari se queda con el gesto; el arreglo de iOS está hecho pero **solo vos lo podés confirmar en el iPhone**.
**Tests:** +5 en `tests/arrastre.spec.js` (3 desktop, 2 celu): 4 abajo y 2 arriba desde el cuerpo de la fila + clic sigue abriendo el editor; 60 movimientos con **≤ 2 llamadas** a `getBoundingClientRect` (antes, una o más por movimiento), fantasma por `transform` y filas corridas; auto-scroll al borde y soltar abajo; con el dedo 4 abajo y 2 arriba sin `pointercancel` ni scroll; un scroll normal no levanta nada. Los 3 de desktop fallan con el código anterior.
**Videos:** [arrastre en la compu](capturas/C5-arrastre-desktop.webm) · [arrastre en el celu](capturas/C5-arrastre-mobile.webm) (se generan con `node tests/tools/video-arrastre.js`).

### S1a · Sincronización: el motor (sin pantalla todavía)

**Por qué Cloudflare y no Firebase/Supabase:** Firebase o Supabase te obligan a crear una cuenta y un proyecto nuevo, copiar claves en la app y mantener otra cosa más. Aula ya vive en Cloudflare Pages: una **Pages Function** + un **KV** son parte del mismo proyecto, gratis para este uso, y no hay servidor aparte. Lo que falta de tu lado son 2 minutos de clics (queda en el resumen de la noche cuando esté lista la pantalla, S1c).
**Plan:** partí S1 en tres: **S1a** motor + función, **S1b** cliente que sincroniza solo, **S1c** pantalla de Configuración con código y QR. Esta corrida hice S1a.
**Decisiones:**
- **Fusión por elemento, no "el último pisa todo".** Cada tarea, parcial, materia, nota, sesión… tiene una marca "cambió a tal hora"; los ajustes, por campo (cambiar el tema en el celu no pisa el color de acento que cambiaste en la compu); `dayLog`/`dayPlan`, por día. Por elemento gana lo más nuevo.
- **Lápidas:** lo borrado deja "se borró a tal hora", así un borrado en el celu no revive desde la compu. Si alguien lo edita **después** del borrado en el otro lado, gana la edición.
- **No toqué cada lugar que edita o borra** (son decenas y sería fácil olvidarse uno): al guardar, la app compara cada elemento con cómo estaba (un hash en memoria) y marca lo que cambió o desapareció. Así cualquier código nuevo (G1, E1…) queda sincronizado sin hacer nada.
- **Las marcas no van adentro de cada tarea** sino en `state.sync` aparte: tus datos quedan exactamente iguales (el test lo verifica tarea por tarea).
- **Lo que es de cada dispositivo no viaja:** `meta` (último guardado, copias) y el temporizador viejo.
- **Datos de antes de la sincronización** (los tuyos) no tienen marca y cuentan como "lo más viejo": la primera vez se **suman** los dos lados, no se reemplaza nada. Si un mismo elemento existe distinto en los dos sin marca, los dos dispositivos eligen el mismo (regla fija), para terminar iguales.
- **La función** (`functions/api/sync.js`): `GET`/`PUT` con el código en `Authorization: Bearer`. En KV se guarda bajo el **SHA-256 del código**: sin el código no hay cómo leer nada. `PUT` lleva la versión sobre la que se fusionó: si otro dispositivo escribió en el medio responde **409** con lo nuevo y la app vuelve a fusionar. 5 MB máximo (tus datos hoy son mucho menos). Si el KV no está vinculado responde **503 "no-kv"**, que la app va a mostrar como "falta activar en Cloudflare". KV no es transaccional: con dos dispositivos de una persona alcanza, y si dos escrituras se pisaran, la siguiente pasada vuelve a fusionar.
- **Migración al esquema 4:** solo agrega `state.sync` vacío; no toca ningún dato. Con copia previa automática en "Copias de seguridad".
**Salió mal / intentos fallidos:** el test de "los dos lados terminan iguales" falló porque comparaba las lápidas como texto y el orden de las claves era distinto (el contenido era igual); lo comparo ordenado.
**Tests:** +6: `tests/sync-fn.spec.js` (2, en Node con un KV falso: GET/PUT, conflicto 409, clave hasheada, 401 con código inválido, otro código no ve nada, 503 sin KV, JSON roto, 413 por tamaño) y `tests/sync-motor.spec.js` (4 ×2: migración del fixture tarea por tarea con copia previa e idempotente; marcas y lápidas al guardar; fusión con 8 casos cruzados y simetría; editar después de borrar, y primera vez con datos en los dos lados).

### S1b · Sincronización: el cliente

**Plan:** que la app sincronice sola, sin botones, y que nunca pierda nada aunque estés sin señal.
**Decisiones:**
- **Una pasada** = bajar lo que hay en Cloudflare → fusionar con lo de este dispositivo → subir **solo si algo cambió**. Entre fusionar y aplicar no hay espera (la red va antes), así que si estás escribiendo justo en ese momento no se pisa. Subir solo si cambió importa: el KV gratis da ~1000 escrituras por día.
- **Cuándo:** al abrir la app, al volver a primer plano, cuando vuelve la conexión, ~4 s después de cada cambio y cada 1 min con la app abierta.
- **El código de sincronización vive solo en el dispositivo** (`localStorage`), nunca dentro de tus datos, copias ni exportaciones.
- **Indicador:** el "todo guardado" de arriba pasa a "sincronizado", "sincronizando…", "sin conexión · se sube después" (punto amarillo), "falta activar la sincronización" (si Cloudflare no tiene el KV) o "código inválido".
- **Antes de la primera fusión** se guarda una copia automática ("Antes de sincronizar por primera vez") en Copias de seguridad.
- **Si otro dispositivo escribió en el medio** (409), se baja lo nuevo, se fusiona otra vez y se reintenta (hasta 4 veces).
- **El service worker no toca `/api/`**: sin eso, el GET de la sincronización quedaba guardado en el caché para siempre y nunca vería cambios del otro lado (lo encontré leyendo `sw.js`; test nuevo).
- La función ahora responde **200 con `data: null`** cuando todavía no hay nada (antes 404): el navegador anota los 404 como error de consola y la regla es cero errores.
**Salió mal / intentos fallidos:** el test "dos dispositivos" encontró dos problemas reales: (1) **materias duplicadas**: un dispositivo nuevo arranca con las 10 materias de ejemplo con ids al azar, así que al sincronizar por primera vez quedaban 20. Ahora, en la primera fusión, si hay dos materias con el mismo nombre queda una (la que tiene cosas vinculadas; si empatan, una regla fija para que los dos dispositivos elijan la misma) y lo vinculado a la otra se pasa a la que queda. (2) **subidas de más**: cada lado ordenaba las listas distinto y se "corregían" mutuamente; ahora el orden lo da lo que ya está en el servidor.
**Tests:** +5 en `tests/sync-app.spec.js` (dos contextos de navegador contra la función real con un KV falso y la red mockeada): crear/editar/borrar cruzado → iguales, lo borrado no revive y otra vuelta no sube nada; primera vez con datos en los dos lados (se suman, materias sin duplicar, tareas vinculadas bien); sin conexión no se pierde nada y sube solo al volver; conflicto 409 en el medio; sin KV avisa y la app sigue igual. +1 en `tests/sw.spec.js`.

### S1c · Sincronización: la pantalla

**Decisiones:**
- Tarjeta **arriba de todo en Configuración** ("Sincronizar compu y celu"): apagada muestra **Activar en este dispositivo** y **Ya tengo un código**, más el paso a paso de Cloudflare plegado. Prendida: estado con punto de color y "última sincronización hace X", **QR**, el código en grupos de 4 (se selecciona entero con un toque), **Copiar código**, **Copiar link**, y abajo **Cambiar código** / **Desconectar** (los dos con confirmación).
- **Código:** 128 bits al azar (`crypto.getRandomValues`), 22 caracteres. Al pegar se aceptan espacios o el link entero.
- **QR propio, sin librerías:** escribí un generador (modo byte, corrección M, versiones 1–10). Lo verifiqué **decodificándolo con un lector real** (OpenCV) para 5, 20, 60, 100, 150 y 200 caracteres y el link real: todos leyeron bien. El test en `npm test` verifica la estructura (patrones de esquina, timing, módulo oscuro, versión).
- **El link del QR** (`…/#/sync?k=…`) abre Configuración ofreciendo "Conectar este dispositivo", y **saca el código de la barra de direcciones**.
- **iPhone, aviso importante:** la app instalada en la pantalla de inicio tiene sus datos **separados** de Safari. El QR abre Safari, no la app instalada. Por eso la pantalla lo dice y ofrece copiar/pegar el código. Lo dejé escrito también en [`docs/SINCRONIZAR.md`](SINCRONIZAR.md).
**Salió mal / intentos fallidos:** ninguno serio; el primer QR leyó bien a la primera (tenía miedo con la información de versión de la 7 en adelante, por eso probé hasta 200 caracteres).
**Tests:** +4 (×2) en `tests/sync-ui.spec.js`: activar → estado, QR y código (y que el código **no** quede dentro de tus datos), desconectar con confirmación; el link del QR; pegar código con espacios, el link entero o basura; estructura del QR.
**Capturas:** [celu, conectado](capturas/S1c-on-mobile-light.png) · [celu oscuro, conectado](capturas/S1c-on-mobile-dark.png) · [desktop oscuro, sin activar](capturas/S1c-off-desktop-dark.png) · [desktop claro, conectado](capturas/S1c-on-desktop-light.png)

**Commits:** `93de8a1` C4 · `78c52ae` C5 · `9ac5522` S1a · `bc4c6b9` S1b · el de S1c y cierre.
**Tests de la corrida:** `npm test` final: **240 pasaron, 0 fallaron** (30 saltados a propósito: son de un solo proyecto, desktop o mobile).

**Para Bauti:**
- **Sincronización: falta un paso tuyo en Cloudflare** (2 minutos, está en [`docs/SINCRONIZAR.md`](SINCRONIZAR.md) y en la propia pantalla). Hasta que lo hagas, la app anda exactamente igual que antes y la tarjeta te dice "falta activar".
- **Ojo con el iPhone:** si usás Aula desde la pantalla de inicio, el QR abre Safari (que tiene sus propios datos, separados de la app instalada). Usá **Copiar código** y pegalo en la app del celu.
- Probá en la **compu** arrastrar tareas en Hoy agarrándolas de cualquier parte de la fila: decime si ahora se siente fluido. En el iPhone también, porque ahí no lo puedo probar de verdad.
- Probá crear "Estudiar X" todos los días por un mes con **Tiempos distintos por tramos**, y en el editor de la serie la cadena "De la 1 a la 10 → 1 h → (salta solo a la 11) …".

---

## Corrida 08:06–08:40 (hora ARG) — X5, X6, X7 y cierre de la noche

**Resumen de la corrida:** era la última corrida (arrancó después de las 08:00), así que hice cosas chicas y seguras y reservé tiempo para publicar en `main`. Encontré **un problema serio que dejó la corrida anterior**: `sw.js` estaba **vacío** (X6). Además arreglé los botones partidos del detalle del parcial en el celu (X5) y un bug de foco que hacía fallar un test de series 1 de cada 3 veces (X7). Tests: de 190 a 196 pasaron, 0 fallaron. Versión 2.27.0 → 2.28.0. Sin cambios de forma de datos.

**Plan:** el siguiente ítem del backlog era **E1a** (modelo + migración de recordatorios). **Decidí no empezarlo**: (1) toca la forma de `state` y necesita migración, y hacerla con apuro justo antes de publicar en `main` es el peor momento para arriesgar tus datos; (2) por sí solo agrega un campo "Avisarme 30 min antes" que **no avisa nada** hasta que esté E1b (ntfy): sería una promesa vacía en la interfaz. Queda E1 entero para otra noche. En su lugar tomé lo que la corrida anterior dejó anotado para F1 (X5).

### X6 · `sw.js` vacío (lo más importante de esta corrida)
**Qué pasó:** al buscar `CACHE_VERSION` para subir la versión, `sw.js` tenía 0 bytes. Con `git log` vi que el commit de X3 (`59c67fa`, corrida 07:06) lo commiteó vacío — probablemente un comando que lo truncó al intentar subir la versión. Ningún test lo detectó porque los tests bloquean el service worker. Sin él, la app instalada en el celu no anda offline y no limpia el caché viejo.
**Arreglo:** lo restauré desde el commit anterior (`694c565`) con `CACHE_VERSION = aula-v2.28.0`. **Test nuevo** (`tests/sw.spec.js`): `sw.js` no está vacío, tiene `install`/`activate`/`fetch`, su versión coincide con `APP_VERSION` y todo lo que cachea existe. Falla con el estado anterior, pasa ahora.
**Aprendizaje:** "los tests en verde" no alcanzan si nadie mira un archivo; ahora hay un test que lo mira.

### X5 · Detalle del parcial en el celu sin botones partidos
**Decisiones:** "Nota · Editar · Eliminar" van juntos en un grupo (si no entran al lado del título, bajan los tres al mismo renglón, en vez de "Nota" arriba y los otros abajo). En "Tareas y plan de estudio", en el celu el título va en su renglón y los botones abajo; "Replanificar pendientes" pasó a **"Replanificar"** (con la frase completa como tooltip) para que los tres entren en una fila. En "Temas", el campo "Nuevo tema…" ocupa todo el ancho y debajo dificultad, minutos y Agregar (antes el selector se cortaba en "Me‹"). En desktop queda igual que antes.
**Tests:** +1 (×2) en `tests/parcial-detalle.spec.js`: ningún botón en dos renglones, acciones del encabezado en una fila, título de la tarjeta en un renglón, selector de dificultad legible, sin scroll horizontal. Falló antes del cambio, pasa después.
**Capturas:** [antes (celu claro)](capturas/X3-eval-e-pe2-mobile-light.png) · [después (celu claro)](capturas/X5-eval-e-pe2-mobile-light.png) · [abajo: temas y plan (celu oscuro)](capturas/X5-plan-mobile-dark.png) · [desktop oscuro](capturas/X5-eval-e-pe2-desktop-dark.png)

### X7 · El foco se robaba lo que escribías
**Qué pasó:** la primera corrida completa de tests dio 1 rojo en `series-integradas` ("Cambiaste título" cuando solo se cambiaron minutos). No toqué series, así que lo repetí 8 veces **en el commit anterior** (sin mis cambios): fallaba igual, 6 de 16. Causa: `openModal` enfoca el primer campo 30 ms después de abrir; si en ese lapso ya enfocaste otro campo, le robaba el foco y lo tipeado iba al título. En el celu es difícil que pase (los dedos son más lentos que 30 ms), pero es real.
**Arreglo:** solo enfoca si el foco no está ya dentro del modal. 16/16 después.
**Tests:** +1 (×2) `tests/foco.spec.js` (escribir enseguida en minutos no cambia el título; si no tocás nada, el foco sí va al título). Falla sin el arreglo.

**Salió mal / intentos fallidos:** el primer `sed` para subir la versión en `sw.js` "no hizo nada" — ahí descubrí que estaba vacío.
**Tests de la corrida:** `npm test` final: 196 pasaron, 0 fallaron (16 saltados a propósito).
**Cierre de la noche:** `npm test` verde en la rama y otra vez sobre el merge con `main` (196/0). Publicado en `main`. El tag `antes-del-agente` no se pudo pushear (el proxy de GitHub devuelve 403 para tags; reintenté 4 veces), así que creé una **rama** `antes-del-agente` desde el `main` viejo (`e2c964a`) con la API de GitHub: es el mismo punto de vuelta atrás. Escribí `docs/RESUMEN-NOCHE.md` y `.agente/TERMINADO`.
**Para Bauti:** abrí un parcial en el celu y mirá el encabezado y "Tareas y plan de estudio". Si la app instalada se comportaba raro sin conexión desde anoche, era el `sw.js` vacío: con esta versión vuelve a andar offline (puede que tengas que abrirla dos veces para que tome el service worker nuevo).

---

## Corrida 07:06–07:28 (hora ARG) — D1b, D2a, D2b, X3

**Resumen de la corrida:** terminé el **calendario en desktop** (D1b, cierra D1), reemplacé las estadísticas por una vista **Progreso** con 5 preguntas reales (D2a), recorté "Estadísticas detalladas" a lo que sirve (D2b, cierra D2) y compacté el **detalle del parcial** (X3). Partí **E1** (notificaciones) en E1a/E1b/E1c para que la próxima corrida arranque derecho. Tests: de 174 a 190, todos en verde en cada commit. Versión: 2.23.0 → 2.27.0. Sin cambios de forma de datos (no hizo falta migrar). El push falló dos veces con "Internal Server Error" de GitHub (igual que en la corrida anterior); reintenté con espera y anduvo.

**Commits:** `8a6f9ae` D1b · `fe787f0` D2a · `694c565` D2b · `59c67fa` X3 · el de cierre.

### D1b · Calendario en desktop

**Plan:** mirar la captura "antes" con ojo de diseñador y arreglar lo que pedía el ítem: horas ilegibles ("1.8 h"), crear desde la celda, parciales poco marcados, desbordes.
**Decisiones:**
- **Horas:** "1 h 50 m", "20 m" (mismo formato que el resto de la app) en vez de decimales.
- **Crear desde la celda:** al pasar el mouse aparece un **+** azul arriba a la derecha (también con el teclado, por foco) que abre "Nueva tarea" con ese día, sin pasar por el resumen. Elegí hover porque en desktop hay mouse; en el celu ya está "+ Tarea para el …" de D1a. El clic en el resto de la celda sigue abriendo el resumen.
- **Parciales:** el día con parcial tiene una franja roja arriba y el número en rojo; el parcial va primero, con barrita roja a la izquierda y su hora.
- **Desbordes:** cada celda muestra como mucho 3 renglones (parciales primero, hasta 2) y "+N más" (que cuenta también parciales escondidos) junto con los hábitos en un solo renglón. Todas las filas miden lo mismo (`1fr`), columnas `minmax(0,1fr)` para que un título largo no ensanche la columna. Hoy: número en círculo azul, como el Calendario de macOS.
**Salió mal / intentos fallidos:** la primera versión hacía las filas más altas y el mes ya no entraba en 800 px; junté "+N más" y hábitos en un renglón y bajé el alto mínimo.
**Tests:** +4 desktop (`tests/calendario.spec.js`): horas sin decimales; + crea en el día sin abrir el resumen y está oculto si no pasás por encima; día con parcial marcado y parcial primero con hora; día con 11 tareas y 2 parciales no desborda, la fila no se estira y "+10 más" abre el resumen.
**Capturas:** [antes (desktop claro)](capturas/D1b-antes-desktop-light.png) · [después (desktop claro)](capturas/D1b-calendar-desktop-light.png) · [después (desktop oscuro)](capturas/D1b-calendar-desktop-dark.png) · [el + al pasar el mouse](capturas/D1b-hover-desktop-dark.png)

### D2a · Progreso: gráficos que responden algo

**Plan:** dijiste que los gráficos "no te sirven para nada". En vez de retocarlos, armé una vista nueva con **una pregunta por tarjeta**, un número grande y una barra simple (estilo Salud/Fitness).
**Decisiones (qué pregunta responde cada una):**
1. **¿Cuánto estudié esta semana?** Total de la semana y comparación con **la semana pasada a esta misma altura** (comparar un miércoles contra una semana entera siempre da "menos" y desanima). Barras L M X J V S D (X para miércoles, como en iOS en español); los días que faltan, apagados.
2. **¿Voy al día?** Tareas atrasadas y cuánto trabajo suman, botón "Ver atrasadas" (va a Hoy, donde se resuelven) y "Tareas hechas esta semana: 5 de 12".
3. **¿Llego a los parciales?** Los próximos 4 con los días que faltan grandes (en rojo si es esta semana), preparación con barra de color y tiempo estudiado.
4. **¿A qué le dedico tiempo?** Últimos 14 días por materia, ordenadas por el parcial más cercano; si un parcial está a ≤14 días y le diste menos de 2 h, avisa "le estás dando poco".
5. **¿Soy constante?** Racha de días seguidos y 28 puntitos (4 semanas).
- En el menú "Estadísticas" pasó a llamarse **Progreso**. Lo viejo no se borró: queda en "Estadísticas detalladas, informe y CSV ›" al pie.
- El tiempo estudiado sale de las sesiones registradas (lo mismo que usaba la vista vieja).
**Salió mal / intentos fallidos:** las barras de preparación no se veían (la clase `.pbar` tiene `flex:1` y dentro de una columna flex quedaba con alto 0); y la primera fila de cada lista tenía una línea de más arriba. Los vi en las capturas y los arreglé.
**Tests:** +3 (×2) en `tests/progreso.spec.js`: números exactos con el fixture (75 m vs 90 m, racha 2, 3 días activos, parciales a 8/14/21 días, minutos por materia) y que se muestran; estado vacío sin errores y sin scroll horizontal; atrasadas cuenta y lleva a Hoy.
**Capturas:** [desktop claro](capturas/D2a-stats-desktop-light.png) · [desktop oscuro](capturas/D2a-stats-desktop-dark.png) · [celu claro](capturas/D2a-stats-mobile-light.png) · [celu oscuro](capturas/D2a-stats-mobile-dark.png)

### D2b · Estadísticas detalladas, más cortas

**Decisión:** saqué lo que no responde nada o repetía Progreso: 8 de las 12 tarjetas de números (mediana, promedios, sesiones…), la dona (repetía "horas por materia"), "¿De dónde vienen las horas?" (hablaba del temporizador que ya no existe), "Tareas del período", "Qué tipo de trabajo hiciste", "Cumplimiento de hábitos" (está en Hábitos) y la tabla por materia. Quedan: 4 números, evolución, horas por materia, día de la semana y hora del día, precisión de estimaciones, notas, mapa de actividad y conclusiones. **El informe descargable (póster) y el CSV se quedan**: no molestan, están escondidos un nivel más abajo y sirven para compartir. Solo se tocó la vista; los cálculos siguen (los usa el póster).
**Salió mal:** honestamente, este test lo escribí después de recortar (pasó a la primera), no antes como dice el manual.
**Tests:** +1 (×2). **Capturas:** [desktop claro](capturas/D2b-detalle-desktop-light.png)

### X3 · Detalle del parcial compacto

**Plan:** antes había 6 tarjetas grandes de números y las tareas quedaban varias pantallas abajo en el celu.
**Decisiones:** una tarjeta arriba con **los días que faltan bien grandes** (con fecha y hora) y la **preparación** con su barra de color; abajo una sola fila con estudiado · temas · tareas (con atrasadas) · simulacros, y una línea con lo pendiente estimado. Si ya pasó, lo dice; si es hoy, "Hoy" en rojo.
**Tests:** +2 (×2) en `tests/parcial-detalle.spec.js` (número grande y preparación correctos, 4 datos en una fila, en el celu todo entra en la primera pantalla, parcial pasado). Actualicé una línea de `tests/vinculos.spec.js` que leía "1/2" de la tarjeta vieja "tareas del plan": ahora lo lee de la fila compacta (mismo dato, otro lugar).
**Capturas:** [antes (celu claro)](capturas/B3-eval-e-pe2-mobile-light.png) · [después (celu claro)](capturas/X3-eval-e-pe2-mobile-light.png) · [después (desktop oscuro)](capturas/X3-eval-e-pe2-desktop-dark.png)

**Tests de la corrida:** `npm test` final: 190 pasaron, 0 fallaron (16 saltados a propósito: son de un solo proyecto, desktop o mobile).

**Para Bauti:**
- Abrí **Progreso** en el celu y decime si las 5 preguntas son las que te hacés. El umbral de "le estás dando poco" (menos de 2 h en 14 días con parcial a 2 semanas) es arbitrario: es un número fácil de cambiar.
- En el calendario de la compu pasá el mouse por un día y tocá el +.
- Visto en las capturas y anotado para F1: en el celu, el encabezado del detalle del parcial parte los botones en dos renglones y "Tareas y plan de estudio" queda apretado con 3 botones.

---

## Corrida 06:06–06:39 (hora ARG) — C2a, C2b, C3, X4, D1a

**Resumen de la corrida:** se terminó todo el bloque **C (series y repeticiones)**, que era lo que más te frustraba, más el calendario en el celu. 5 ítems cerrados: C2a (editor de serie con lista, selección y cambios masivos con vista previa), C2b (editar una sola, agregar siguiendo el patrón, quitar), C3 ("3 de 5" y la pregunta "¿solo esta / siguientes / todas?"), X4 (pulido que encontré en las capturas) y D1a (calendario estilo iOS en el celu; antes se salía de la pantalla). Partí **D1** en D1a/D1b: D1b (desktop) queda para la próxima corrida. Tests: de 140 a 174, todos en verde en cada commit. Versión: 2.19.1 → 2.23.0. Sin cambios de forma de datos (no hizo falta migrar). Un push falló una vez con "Internal Server Error" de GitHub; reintenté y anduvo.

**Commits:** `1891576` C2a · `01eda9a` C2b · `0002984` C3 · `3a724e9` X4 · `cd8eb63` D1a · el de cierre.

### D1a · Calendario en el celu, estilo iOS

**Plan:** las capturas "antes" mostraron que en el celu el calendario **no entraba**: la grilla de 7 columnas con las tareas escritas se salía de la pantalla y solo se veían lunes a miércoles. Lo arreglé primero en el celu (que es donde lo usás) y dejé el desktop para D1b.

**Decisiones:**
- **En el celu (≤ 720 px)** cada día es un número con **hasta 4 puntitos**: rojo para parciales (primero), y uno por tarea con el color de su materia (las hechas, apagadas). Hoy en azul; el día elegido con un círculo relleno, como en iOS.
- **Abajo, la lista del día elegido** con las filas de tareas de siempre (se pueden completar, abrir, arrastrar) y los parciales con su hora, el total de minutos del día y el botón **"+ Tarea para el jue 12 nov"**, que abre "Nueva tarea" con esa fecha.
- **Deslizar** a izquierda/derecha cambia de mes (si el gesto es más vertical que horizontal, es scroll y no hace nada). Los botones ‹ Hoy › siguen y tienen 40 px.
- **En desktop no cambia nada todavía**: celdas con las tareas escritas y el clic abre el resumen del día, como antes. Eso es D1b.
- Es todo CSS + una lista nueva: no toca datos.

**Salió bien:** la diferencia es enorme (mirá antes/después).
**Salió mal / intentos fallidos:** la primera versión partía el encabezado en dos renglones en el celu (la flecha › caía abajo); lo dejé en una sola línea.
**Tests:** +4 (`tests/calendario.spec.js`; 3 solo mobile y 1 solo desktop): nada se sale del ancho y hay puntos; tocar un día muestra parcial y tareas con hora y crea una tarea ese día; deslizar y botones; en desktop sigue el resumen. `npm test`: 174 pasaron, 0 fallaron.
**Capturas:** [antes (mobile claro)](capturas/D1-antes-mobile-light.png) · [después (mobile claro)](capturas/D1-calendar-mobile-light.png) · [después (mobile oscuro)](capturas/D1-calendar-mobile-dark.png)
**Para Bauti:** abrí Calendario en el celu, tocá un día con puntos rojos y deslizá para cambiar de mes.

### X4 · Pulido de series (lo vi en las capturas de C3)

- En el editor de una tarea que es parte de una serie **ya no aparece "Recurrencia"** (la vieja): ponerle "Todos los días" a una ocurrencia la convertía en otra repetición infinita dentro de la serie. Para repetir está "Repetir" al crear y el editor de la serie.
- El modal de una serie **sin fin** ahora dice su regla y sus minutos ("todos los días, sin fin · 20 m cada vez") y tiene **"Editar la tarea"**, que es donde se cambian los minutos, la hora y cada cuánto se repite. El botón de borrar dice "Eliminar" (es una sola tarea) y "Guardar nombre y materia" pasó a "Guardar" (se partía en dos renglones).
- **Tests:** +1 (×2) y una verificación más en el de C3. `npm test`: 170 pasaron, 0 fallaron.
- **Capturas:** [serie sin fin (mobile oscuro)](capturas/C3-sinfin-mobile-dark.png)

### C3 · Series bien integradas

**Plan:** que una serie se note y se pueda abrir desde cualquiera de sus tareas, que editar una pregunte a cuáles aplicar el cambio (como el Calendario del iPhone) y simplificar la vista Series.

**Decisiones:**
- **En el editor de una tarea de serie** aparece arriba "Parte de una serie · **3 de 5**" con el botón "Ver la serie" (abre el editor de C2). En las filas de Hoy / Lista / Semana, un indicador chiquito ↻ 3/5 al lado de los minutos.
- **"¿A cuáles se lo aplico?"** solo aparece si cambiaste algo que las tareas de la serie comparten: título, descripción, materia/proyecto, parcial, minutos, hora, prioridad, tipo o etiquetas. Opciones: **Solo a esta / A esta y las siguientes (N) / A todas las de la serie (N) / Cancelar**. La fecha, el estado, "completada el", notas, subtareas y comentarios son siempre de esa tarea sola: no pregunta (sería molesto preguntar al mover una).
- **A las otras se les copia solo lo que cambiaste**, no todo el formulario: si cambiaste la hora, a las demás se les pone la hora y conservan sus minutos propios. "Lo que cambiaste" se calcula comparando el editor con cómo estaba al abrirlo (así un dato viejo sin prioridad no dispara la pregunta sin motivo).
- **Deshacer** después de aplicar a varias vuelve atrás las otras; la que editaste queda como la guardaste.
- **Vista Series → lista simple** (estilo Ajustes): punto de color de la materia, título, "cada 3 días · 2/5 hechas · próxima jue 5 nov", una barrita de progreso y ›. Tocar la fila abre el editor. Las terminadas, plegadas abajo. Las que se repiten sin fin dicen su regla ("los lun y mié, sin fin"). Saqué "Seleccionar tareas" (lo reemplaza la selección del editor de C2a) y el menú dice "Series" a secas.
- Detalle general: al abrir cualquier modal, el foco va al primer **campo** y no al primer botón (si no, "Ver la serie" aparecía con el anillo de foco).

**Salió bien:** todos los tests pasaron a la primera.
**Salió mal / intentos fallidos:** ninguno serio. Actualicé el helper de `series-editar` que tocaba "Gestionar" para que toque la fila de la lista nueva.
**Tests:** +5 (`tests/series-integradas.spec.js`, 10 corridas): "3 de 5" + Ver la serie (y que una suelta no lo muestra); indicador 3/5 en la fila; minutos con solo esta / siguientes / todas / cancelar y deshacer; cambiar fecha no pregunta y título + hora a todas sí ("Cambiaste título y hora"); la vista Series con el fixture. `npm test`: 168 pasaron, 0 fallaron.
**Capturas:** [Series (mobile claro)](capturas/C3-series-mobile-light.png) · [Series (desktop oscuro)](capturas/C3-series-desktop-dark.png) · [la pregunta (mobile oscuro)](capturas/C3-pregunta-mobile-dark.png) · [banner en el editor (mobile claro)](capturas/C3-banner-mobile-light.png)
**Para Bauti:** abrí una tarea de una serie desde Hoy, cambiale los minutos y guardá: te pregunta. Si te parece que debería preguntar también al cambiar la fecha ("mover esta y las siguientes"), decime: es una línea.

### C2b · Editar una sola, agregar y quitar ocurrencias

**Plan:** completar C2 con lo que faltaba: tocar una sola tarea de la serie (+10 min sin tocar el resto), agregar tareas siguiendo el patrón o una fecha suelta, y quitar una puntual.

**Decisiones:**
- **Cada fila tiene "Editar"** a la derecha (separado de la casilla, para que tocar la fila siga eligiéndola). Se despliega ahí mismo: **−10 m / minutos / +10 m**, Fecha, Hora, "Abrir la tarea" (el editor completo) y "Quitar de la serie". Cada cambio se aplica al instante con su **Deshacer**, como en Recordatorios del iPhone; el panel queda abierto para seguir tocando.
- **"Agregar tareas a la serie"** (plegado, con un +): "Más tareas, cada 3 días" (cuántas), "Hasta una fecha, cada 3 días" o "Una fecha suelta". Vista previa con las fechas exactas antes de agregar. No deja agregar una fecha que ya está. Las nuevas copian la última (título, materia, parcial, minutos, hora, prioridad) y quedan en la misma serie.
- **El patrón se deduce de las fechas** (las series no guardan la regla con la que se crearon, y las viejas tampoco la tienen): mismo día del mes → cada mes; todas a la misma distancia → esa distancia ("todos los días", "cada semana", "cada 3 días"); si están *todos* los lun/mié/vie entre la primera y la última → esos días; si no (por ejemplo, moviste una a mano), la distancia más común. Descarté guardar la regla en los datos: obligaba a migrar y no servía para las series que ya tenés.
- **Reemplacé "Extender hasta → Agregar días"**, que agregaba **un día tras otro** aunque la serie fuera cada 3 días (era un bug: extendías "Practicar cada 3 días" y te llenaba todos los días). Tuve que actualizar otra vez el test `series-identidad` ("extender una serie…") para usar el control nuevo; sigue verificando lo mismo (2 días más en la misma serie).
- Si quitás tareas hasta que queda una sola, deja de ser serie y el editor se cierra (como antes).
- Sin cambios de forma de datos.

**Salió bien:** el caso "una fecha movida a mano" lo encontré escribiendo el test del patrón: mi primera heurística creía que eran "los mié, vie, sáb y dom". Ahora exige que estén todos esos días en el rango.
**Salió mal / intentos fallidos:** (1) "cada mes" el 31 (oct 31 → dic 31) no se reconocía como mensual porque hay 61 días entre medio: corregido. (2) En un test, el deshacer de cambiar la fecha "no andaba": era el test, que disparaba el cambio dos veces (Playwright ya dispara `change` al llenar fechas). (3) En la captura había dos botones azules grandes uno abajo del otro; el de Agregar pasó a botón normal.
**Tests:** +5 (9 corridas): editar una sola (+10, deshacer, minutos, hora y fecha); quitar una con deshacer; agregar siguiendo el patrón, hasta una fecha y suelta (incluido no repetir un día); deducción del patrón (diario, semanal, L-M-V, mensual el 31, fecha movida a mano); en el celu con el dedo. `npm test`: 158 pasaron, 0 fallaron.
**Capturas:** [editar una (mobile claro)](capturas/C2b-una-mobile-light.png) · [agregar (mobile oscuro)](capturas/C2b-agregar-mobile-dark.png) · [agregar (desktop claro)](capturas/C2b-agregar-desktop-light.png)
**Para Bauti:** Series → Gestionar → "Editar" en una fila → +10 m. Y "+ Agregar tareas a la serie" para sumar 2 más cada 3 días.

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
