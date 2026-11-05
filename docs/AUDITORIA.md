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
| 7 | Inicio, "Estudio de hoy" | Los campos para un bloque nuevo muestran "02:00 PM" (12 h, por el navegador) aunque el bloque dice "15:00 – 17:00" | Revisar formato y valores por defecto de esos campos | confunde | abierto (L1b) |
| 8 | Inicio y Materias | "1 pendientes" | "1 pendiente" | detalle | ✅ 2.36.0 (encontrado por el revisor, `tests/revisor.spec.js`) |
| 9 | Generador de planes | "hay 1 tareas pendientes de un plan anterior", "1 temas cargados", "1 días finales" | Singular cuando es 1 | detalle | ✅ 2.36.0 (revisor) |
| 10 | Planes de estudio | "1 atrasadas" | "1 atrasada" | detalle | ✅ 2.36.0 (revisor) |
| 11 | Progreso, por materia | "Parcial en 0 días · le estás dando poco" (parcial hoy) | "Parcial hoy · …" (y "mañana") | confunde | ✅ 2.36.0 (revisor) |
| 12 | Progreso, Lista, Series, Importar | "1 tareas", "1 evaluaciones", "1 días", "1 hechas" en casos de uno (buscados en el código, no en pantalla) | Singular con `pl()` | detalle | ✅ 2.36.0 |
| 13 | Materias, en el celu | Los 4 botones (↑ ↓ Editar Archivar) apretaban el nombre: "Probabilidad / y / Estadística" en tres renglones y el subtítulo en cuatro | Nombre y datos en un renglón; botones en un renglón propio abajo, de 40 px o más | confunde | ✅ 2.36.0 (lo vi en la captura del revisor; test propio) |

**Revisor automático** (`tests/revisor.spec.js`): 9 estados (fixture, vacío, 1 materia, 200 tareas, títulos larguísimos, tres parciales en dos días, tareas de 0 min, todo hecho, todo atrasado a las 00:40) × desktop y celu. Recorre las 16 vistas, el detalle de cada materia, parcial y proyecto, y 20 modales. Falla con `NaN`, `undefined`, `null`, `Invalid Date`, `[object`, "1 días/tareas/…", "en/hace 0 días", tiempos negativos, scroll de costado o elementos que se salen de la pantalla. Lo que **no** ve: textos cortados por diseño (con "…"), cosas apretadas pero que entran (como el #13), y modales que no estén en su lista. Para agregar un caso: sumar un estado a `ESTADOS` o un modal a `modales`.

