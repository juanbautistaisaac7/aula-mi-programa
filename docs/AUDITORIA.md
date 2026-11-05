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
