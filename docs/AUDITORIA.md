# Auditoría de lógica y experiencia (L1)

Todo lo que se encuentra va acá primero; después se arregla de a uno, con su test.
Gravedad: **rompe** (dato mal o algo que no anda) · **confunde** (se entiende otra cosa) · **detalle**.

| # | Dónde | Qué pasa | Qué debería pasar | Gravedad | Estado |
|---|-------|----------|-------------------|----------|--------|
| 1 | Barra de arriba ("próximo parcial") | Con dos parciales el mismo día mostraba solo el primero ("Economía · en 2 días") | Mostrar los dos ("Economía y ANP · en 2 días"; con 4 o más, "4 parciales") y el detalle completo al pasar el mouse | confunde | ✅ 2.35.0 (`tests/logica.spec.js`) |
| 2 | Inicio, sugerencia "X es en N días" | Igual: nombraba solo uno y contaba solo su plan | "Economía y ANP son en 2 días: quedan N tareas de sus planes" | confunde | ✅ 2.35.0 |
| 3 | Detalle de materia, "Próxima evaluación" | Con dos el mismo día (teoría y práctica) mostraba una; además decía "en 1 días" para mañana | "Próximas evaluaciones" con las dos; "mañana" | confunde | ✅ 2.35.0 |
| 4 | Inicio, sugerencia de atrasadas | "Tenés 1 tareas atrasadas" | "Tenés 1 tarea atrasada" | detalle | ✅ 2.35.0 |
| 5 | Listas de parciales (Inicio, Parciales, Calendario) | Una evaluación sin tipo (`kind`) mostraba "undefined" | "Evaluación" | detalle | ✅ 2.35.0 (los datos de Bauti siempre tienen tipo; es defensa) |
| 6 | Celu, barra de arriba | El "próximo parcial" no se ve en el celu (está oculto por espacio) | Decidir en F1 dónde mostrarlo en el celu (Inicio ya lo dice en la sugerencia cuando faltan ≤ 3 días) | detalle | abierto (F1) |
| 7 | Inicio, "Estudio de hoy" | Los campos para un bloque nuevo muestran "02:00 PM" (12 h, por el navegador) aunque el bloque dice "15:00 – 17:00"; además el bloque siguiente proponía otra vez 14–17 (se pisaba) y se podían cargar bloques superpuestos | Proponer el siguiente donde terminó el anterior; avisar si se superpone | confunde | ✅ 2.39.0 (`tests/logica-l1b.spec.js`). El formato AM/PM lo decide el idioma del teléfono/navegador (en un iPhone en español sale 24 h); no se puede forzar sin reemplazar el selector nativo, que en el celu es el mejor |
| 8 | Inicio y Materias | "1 pendientes" | "1 pendiente" | detalle | ✅ 2.36.0 (encontrado por el revisor, `tests/revisor.spec.js`) |
| 9 | Generador de planes | "hay 1 tareas pendientes de un plan anterior", "1 temas cargados", "1 días finales" | Singular cuando es 1 | detalle | ✅ 2.36.0 (revisor) |
| 10 | Planes de estudio | "1 atrasadas" | "1 atrasada" | detalle | ✅ 2.36.0 (revisor) |
| 11 | Progreso, por materia | "Parcial en 0 días · le estás dando poco" (parcial hoy) | "Parcial hoy · …" (y "mañana") | confunde | ✅ 2.36.0 (revisor) |
| 12 | Progreso, Lista, Series, Importar | "1 tareas", "1 evaluaciones", "1 días", "1 hechas" en casos de uno (buscados en el código, no en pantalla) | Singular con `pl()` | detalle | ✅ 2.36.0 |
| 13 | Materias, en el celu | Los 4 botones (↑ ↓ Editar Archivar) apretaban el nombre: "Probabilidad / y / Estadística" en tres renglones y el subtítulo en cuatro | Nombre y datos en un renglón; botones en un renglón propio abajo, de 40 px o más | confunde | ✅ 2.36.0 (lo vi en la captura del revisor; test propio) |
| 14 | Series | Una tarea que se repite **con fecha final** ("Clase de consulta", hasta el 15/12) decía "sin fin", en la lista y en el editor | "los lun y mié, hasta el mar 15 dic" (o "terminó el …") | confunde | ✅ 2.39.0 (`tests/logica-l1b.spec.js`) |
| 15 | Series | "cada semana" y "cada mes" no decían qué día | "todos los sábados", "el 10 de cada mes" | detalle | ✅ 2.39.0 |
| 16 | Repeticiones "cada mes" (tareas, series y hábitos) | Una repetición el 31 se salteaba noviembre, febrero, etc. (y el 30, febrero): "pagar cuota el 31" desaparecía meses enteros sin avisar | Cae el último día del mes (30/11, 28/2). Las series viejas que salteaban meses se siguen reconociendo como "cada mes" | rompe | ✅ 2.39.0 (2 tests viejos actualizados: esperaban que se saltee) |
| 17 | Materias → Eliminar | "y desvincular 1 tareas"; no decía nada de los parciales de esa materia | "(1 tarea y 1 evaluación quedan sin materia, no se borran)" | detalle | ✅ 2.39.0 (probé borrar una materia con parciales y sesiones: ninguna vista se rompe) |
| 18 | Materias | "0 pendientes · 0 m estudiadas" | "al día · sin tiempo registrado" | detalle | ✅ 2.39.0 |
| 19 | Parciales, filas | La fecha aparece dos veces (en la pastilla de la izquierda y en el subtítulo) | Dejar una sola | detalle | abierto (F1, es de diseño) |
| 20 | Semana, totales por día | "1 H 20 M" en mayúsculas (lo hace el CSS) | "1 h 20 m" como en el resto | detalle | abierto (F1) |
| 21 | Búsqueda, en el celu | No había forma de abrirla: el campo "Buscar" se esconde en pantallas chicas y el atajo es de teclado | Una lupa en la barra de arriba (44 px). Para que entre, en el celu el logo queda sin la palabra "Aula" | rompe | ✅ 2.49.0 (`tests/l1c-busqueda.spec.js`) |
| 22 | Búsqueda | "economia" no encontraba "Economía" (ni "analisis", "practica"…): comparaba con tildes | Buscar sin tildes ni mayúsculas | confunde | ✅ 2.49.0 |
| 23 | Búsqueda | Sin escribir nada tiraba 14 tareas al azar; una serie aparecía 5 veces ("Repasar unidad 3" × 5); lo hecho y lo cancelado se mezclaba con lo pendiente sin marca; dos "Repasar" iguales sin forma de distinguirlos | Sin texto, una ayuda; una serie una sola vez ("serie · 5 veces", abre la próxima pendiente); materias y parciales primero, lo pendiente antes y lo hecho en gris con "hecha"; la fecha de cada tarea suelta | confunde | ✅ 2.49.0 |
| 24 | Búsqueda, acciones rápidas (Ctrl+K) | "Ir a Estadísticas" cuando el menú dice "Progreso"; no estaban Series ni Copias | Los mismos nombres que el menú | detalle | ✅ 2.49.0 |
| 25 | Búsqueda, en el celu | Mostraba "↑↓ navegar · Enter abrir · Esc cerrar" (atajos de teclado) y filas de 37 px | Sin atajos con el dedo; filas de 44 px | detalle | ✅ 2.49.0 |
| 26 | Copias de seguridad | El botón para importar era el del navegador, en inglés ("Choose File / No file chosen") | "Elegir archivo…" con el estilo de la app | detalle | ✅ 2.49.0 |
| 27 | Copias → Restaurar, con la sincronización activa | No avisaba que restaurar también vuelve atrás el otro dispositivo (la restauración viaja por la sync como cualquier cambio: es lo correcto, pero hay que saberlo) | Decirlo en la confirmación | confunde | ✅ 2.49.0 |
| 28 | Configuración → Reiniciar aplicación, con la sincronización activa | Decía "de este navegador", pero el borrado viajaba por la sync como lápidas: **reiniciar el celu borraba todo también en la compu** | Reinicia solo este dispositivo: lo desconecta antes y arranca sin marcas de sync; el otro conserva todo y, si reconectás con el código, vuelven tus datos. La confirmación lo explica | rompe | ✅ 2.50.0 (`tests/l1c-config.spec.js`, con dos dispositivos) |
| 29 | Configuración, en el celu | "Ver atajos de teclado" en un teléfono; "Reiniciar aplicación" (rojo) pegado a "Exportar JSON" | Sin atajos con el dedo; Reiniciar abajo, separado | detalle | ✅ 2.50.0 |
| 30 | Configuración, en el celu | Botones de ~28 px (Claro/Oscuro, Lunes/Domingo, 24 h/12 h, Datos) | 44 px con el dedo; la × de los avisos con área táctil agrandada | detalle | ✅ 2.50.0 |
| 31 | Configuración | "siguen en Historial y en Estadísticas" (el menú dice Progreso) | "…y en Progreso" | detalle | ✅ 2.50.0 |
| 32 | Reiniciar con ntfy conectado | Los avisos ya programados en ntfy (hasta 48 h) no se cancelan al reiniciar: pueden llegar igual | Cancelarlos antes de reiniciar | detalle | abierto (raro: hay que reiniciar con ntfy activo; llegan como mucho 2 días) |
| 33 | Configuración → Etiquetas | La × para quitar una etiqueta es un link chico | Botón de 44 px con el dedo | detalle | abierto (F1) |
| 34 | Progreso, "¿A qué le dedico tiempo?" | "le estás dando poco" con una regla fija (parcial en ≤ 14 días y < 2 h en 14 días), aunque sea la materia con más horas | Compararlo con lo que te llevó prepararte antes | detalle | abierto (H1d) |

**L1c1 (recorrido pensado, corrida 03:06 del 6/11):** Búsqueda y Copias de seguridad, en el celu con el fixture. Hallazgos #21–#27. Revisé también qué pasa al **restaurar una copia con la sincronización activa**: `syncTrack` compara lo restaurado con lo que había y marca como nuevo todo lo que cambió (y como borrado lo que no estaba en la copia), así que la restauración gana en los dos dispositivos y no "vuelve" lo de antes con la próxima sincronización. Es el comportamiento correcto; faltaba avisarlo (#27). Quedan para L1c2: Progreso/estadísticas, Configuración, sincronización y años.

**L1c2 (misma corrida):** Configuración y su relación con la sincronización. El hallazgo grave fue #28 (reiniciar borraba los dos dispositivos). Progreso lo miré en el celu sin encontrar nada roto (#34 queda para H1d; H1 rehace Progreso entero, así que no tenía sentido pulirlo ahora).

**L1c3 (misma corrida):** años de cursado en el celu: "Tus años", "Nuevo año" (la fecha de fin propone bien el 29/2 en un año bisiesto) y la tarjeta de Configuración. Sin hallazgos. Capturas `docs/capturas/L1c3-*`. Con esto no quedan hallazgos "rompe" ni "confunde" abiertos: L1 queda cerrado; los "detalle" abiertos se repasan en F1.

**Revisor automático** (`tests/revisor.spec.js`): 9 estados (fixture, vacío, 1 materia, 200 tareas, títulos larguísimos, tres parciales en dos días, tareas de 0 min, todo hecho, todo atrasado a las 00:40) × desktop y celu. Recorre las 16 vistas, el detalle de cada materia, parcial y proyecto, y 20 modales. Falla con `NaN`, `undefined`, `null`, `Invalid Date`, `[object`, "1 días/tareas/…", "en/hace 0 días", tiempos negativos, scroll de costado o elementos que se salen de la pantalla. Lo que **no** ve: textos cortados por diseño (con "…"), cosas apretadas pero que entran (como el #13), y modales que no estén en su lista. Para agregar un caso: sumar un estado a `ESTADOS` o un modal a `modales`.


**L1b (recorrido pensado, corrida 03:05):** revisé Hoy, Semana, Calendario, Materias, Parciales y Series en el celu a las 23:40 con el fixture, más casos borde: inicio de semana en domingo (calendario y semana se acomodan bien), borrar una materia con parciales y sesiones (ninguna vista muestra `undefined` ni se rompe), parcial pasado sin nota (ya lo resuelve "Ya pasaron"), y las reglas de repetición a fin de mes (#16). Sin hallazgos en Calendario ni en Hoy más allá de #7.

## M2 · Inventario de formularios en el celu (corrida 00:06, 6/11)

Lo revisa `tests/formularios-celu.spec.js` en 390, 375 y 320 px: falla si dos campos (`input, select, textarea, button`) se enciman o si alguno se sale del modal, y si hay scroll de costado. **Como los tests corren en Chrome**, el test le agrega a la página el comportamiento de Safari en iOS (un ancho mínimo propio en los campos de fecha y hora): sin los arreglos de M2, ese test reproduce exactamente lo que viste ("la hora se superpone": fecha encima de hora en Nueva tarea y en el parcial, y a 320 px la hora salida del modal).

| Formulario | Cómo se abre | Estado |
|---|---|---|
| Nueva tarea (simple, con Repetir, días + cantidad, tramos) | `+` / "Nueva tarea" | ✔ Programación a lo ancho, Fecha + Hora en una fila |
| Agregado rápido | `+` arriba | ✔ |
| Editar tarea (simple y de una serie) | tocar una tarea | ✔ |
| Mover a… | mantener apretada / menú | ✔ (hoja de abajo) |
| Materia (nueva y editar) | Materias | ✔ |
| Parcial (nuevo y editar) | Parciales y finales | ✔ Fecha + Hora juntas, días de repaso abajo |
| Plan de estudio | detalle del parcial | ✔ |
| Proyecto, nota, hábito | sus vistas | ✔ |
| Registrar tiempo | Progreso | ✔ |
| Años / año nuevo | selector de año | ✔ (las fechas ya no se salen a 320 px) |
| Informe descargable | Progreso | ✔ |
| Cambiar fecha / tiempo de varias | modo selección | ✔ |
| Avisos, sincronizar, configuración | Configuración | ✔ (a 320 px la tarjeta se salía de la pantalla) |
| Estudio de hoy | Inicio | ✔ |

Reglas que quedaron (en `index.html`, bloque "M2"): campos con `min-width:0`; en iOS, fecha y hora sin apariencia nativa y alineadas a la izquierda; con el dedo, letra de 16 px (iOS no hace zoom al tocar) y 44 px de alto; en el celu cada fila de dos va de a dos, la de tres pone la primera a lo ancho (salvo que sea la fecha), y los campos quedan parejos aunque un rótulo ocupe dos renglones. Las grillas de tarjetas (`grid2`, `grid3`) ya no pueden ser más anchas que la pantalla. Lo que no se puede probar acá: Safari de verdad (WebKit no se descarga en este entorno).
