# Resumen de la noche — Aula (viernes 6 de noviembre de 2026)

Buen día, Bauti. Esto es lo que hizo el agente mientras dormías (5 corridas, de 00:06 a 04:35). El detalle de cada decisión está en [`BITACORA.md`](BITACORA.md) y los hallazgos del recorrido, en [`AUDITORIA.md`](AUDITORIA.md). Versión nueva: **Aula 2.51.0**.

## Qué quedó hecho

- **Los cambios llegan solos (S2).** Lo que hacés en un dispositivo aparece en el otro en ~10 s, sin recargar, y hay un botón para actualizar a mano.
- **Formularios del celu sin campos encimados (M2)**, preparados para Safari de iOS: campos de 16 px (no hace zoom), 44 px de alto, Fecha + Hora en la misma fila.
- **Deslizar una tarea a la derecha la borra (M1)**, con Deshacer. Corto vuelve, largo o rápido borra; scrollear no borra nada.
- **Hallazgos de tu revisión en el celu (Q1):** Inicio corto (resumen + "Ver todo en Hoy"), títulos enteros, sin "atrasada" repetido, botón de tema sol/luna, "Mover todas a hoy" con Deshacer.
- **Avisos con la app cerrada vía ntfy (E1b + E1c).** Configuración → "Avisos con la app cerrada": se conecta en un minuto, se programan 48 h por adelantado, se cancelan si movés/completás/borrás, no se duplican entre dispositivos ni con el aviso local.
- **Auditoría de lógica (L1c):** lupa de búsqueda en el celu y búsqueda sin tildes; **"Reiniciar" ya no borra el otro dispositivo** con la sync activa (era la forma más fácil de perder todo).
- **Estadísticas, paso 1: datos confiables (H1a).** Al completar una tarea ya no salta una ventana: se registra lo estimado y abajo aparece una barrita con `−30 m · = · +30 m · +1 h · Otro` para corregir con un toque (se va sola). Se puede apagar en Configuración → Preferencias. Además, cada vez que una tarea cambia de día queda anotado (la base para medir "¿cumplo lo que planifico?").

## Qué quedó a medias o sin hacer

- **H1b, H1c (y H1d–H1f):** no llegué. H1a deja los datos listos para que H1b ("¿cumplo lo que planifico?") los use.
- **F1 / F2** (pasada de diseño y de calidad en toda la app): pendientes.
- Detalles abiertos de la auditoría: #32 (al reiniciar con ntfy no se cancelan los avisos ya programados, llegan como mucho 2 días), #33 (la × de las etiquetas es chica), #34 (la regla fija de "le estás dando poco" en Progreso; va con H1d).

## Cómo probarlo (en el celu)

1. Abrí Aula y esperá que se actualice a la **2.51.0** (se ve abajo del menú). Si no, cerrala del todo y abrila de nuevo.
2. **Completá una tarea en Hoy:** aparece la barrita abajo. Tocá "+30 m" o dejala irse sola. Fijate si te sirve o molesta.
3. **Deslizá una tarea a la derecha** (después Deshacer). Scrolleá la lista: no tiene que borrar nada.
4. **Con la compu abierta al lado**, cambiá algo en el celu: tiene que aparecer allá en unos segundos.
5. **Avisos:** Configuración → "Avisos con la app cerrada" → Empezar, instalá ntfy y tocá la prueba. Después una tarea para dentro de una hora con "Avisarme 30 min antes" y cerrá Aula.
6. **Buscar:** la lupa de arriba, escribiendo sin tildes ("economia").

## Publicación y cómo volver atrás

- Todo se publicó en **`main`** con los tests en verde (detalle abajo).
- Si algo no te gusta: la versión de antes de esta noche está en la rama **`antes-del-agente-2026-11-06`**.
- Tus datos: esta noche hubo dos migraciones chicas (esquema 7 y 8, para ntfy), las dos con **copia automática previa**; H1a no migra nada. Si algo se ve raro, en **Copias de seguridad** está la copia "Antes de actualizar a Aula …".

## Estadísticas de la noche

- **Corridas:** 5 (00:06, 01:07, 02:06, 03:06, 04:05).
- **Commits:** 23 en la rama esta noche (13 de funcionalidad o arreglo, el resto bitácora y candados).
- **Tests:** **325** en verde al empezar → **400** en verde al terminar (54 saltados a propósito: son de un solo proyecto, desktop o mobile).

## Tres capturas

- [La barrita al completar, celu](capturas/H1a-barra-mobile-light.png)
- [Configuración con la sync y "Reiniciar" seguro, celu oscuro](capturas/L1c2-config-mobile-dark.png)
- [Búsqueda en el celu](capturas/L1c1-busqueda-mobile-dark.png)
